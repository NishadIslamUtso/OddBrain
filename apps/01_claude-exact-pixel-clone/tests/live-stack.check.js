/**
 * Live-stack integration — the real libraries, the real Vite proxy, the real
 * policy in front of Ollama and the vault.
 *
 * Everything else in `tests/` stubs fetch. This one does not: it forwards the
 * app's own root-relative calls to a running dev server, so the request that
 * reaches the model is the request the browser would make, including the
 * proxy-policy refusals.
 *
 * Run it with the local services up:
 *
 *     npm run dev:mock &            # or the real Ollama
 *     npm run dev:server &          # vault API, optional
 *     npm run dev &
 *     npm run test:live
 *
 * It skips cleanly when nothing is listening, so `npm test` stays offline.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { listModels, showModel, getCapabilities } from '../src/lib/ollama.js'
import { askLocal } from '../src/lib/ask.js'
import { buildBridgeMessages } from '../src/lib/vision.js'
import { extractStreamingArtifacts } from '../src/lib/artifacts.js'
import { vaultGet } from '../src/lib/vault.js'

const ORIGIN = process.env.LIVE_ORIGIN || 'http://127.0.0.1:5173'
const realFetch = globalThis.fetch

async function reachable() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const response = await realFetch(ORIGIN, { signal: controller.signal })
    clearTimeout(timer)
    return response.ok
  } catch { return false }
}

const live = await reachable()
if (!live) {
  test('live stack', { skip: `no dev server on ${ORIGIN} — start it with \`npm run dev\` (and \`npm run dev:mock\` for a model)` }, () => {})
}

// Root-relative URLs are what the browser uses; in Node they need the origin.
globalThis.fetch = (input, init) => realFetch(typeof input === 'string' && input.startsWith('/') ? `${ORIGIN}${input}` : input, init)

test('the model list arrives through the app proxy, cloud entries excluded', { skip: !live }, async () => {
  const data = await listModels()
  assert.ok(Array.isArray(data.models) && data.models.length > 0, 'no local models were listed')
  assert.ok(data.models.every(model => !/:cloud|cloud$/i.test(model.name)), 'a cloud model reached the picker')
})

test('capabilities are read from the model, not from its name', { skip: !live }, async () => {
  const names = (await listModels()).models.map(model => model.name)
  const visionName = names.find(name => /vl|vision/i.test(name))
  if (!visionName) return
  const metadata = await showModel(visionName)
  assert.equal(getCapabilities(metadata).vision, true, `${visionName} did not report vision`)
})

test('a real stream is turned into a live artifact before it finishes', { skip: !live }, async () => {
  const seen = []
  const chunks = []
  const pid = 'live-check'
  await askLocal({
    model: process.env.LIVE_MODEL || 'qwen2.5:3b',
    messages: [{ role: 'user', content: 'build me a chart dashboard' }],
    timeoutMs: 60_000,
    onChunk: piece => {
      chunks.push(piece.content.length)
      const live = extractStreamingArtifacts(piece.content, { requested: true, messageId: pid, chatId: 'c', title: 'Dashboard' })
      if (live.length) seen.push(live[0].partial)
    },
  })
  assert.ok(chunks.length > 3, 'the reply did not arrive as a stream')
  assert.ok(seen.length > 0, 'no artifact was visible while the document was still being written')
  assert.ok(seen.includes(true), 'the live artifact was never marked partial during the stream')
})

test('the vision bridge gets a description back from a vision model', { skip: !live }, async () => {
  const names = (await listModels()).models.map(model => model.name)
  const visionName = names.find(name => /vl|vision/i.test(name))
  if (!visionName) return
  const { content } = await askLocal({
    model: visionName,
    messages: buildBridgeMessages({ images: ['QUJD'], userText: 'what is on screen?' }),
    timeoutMs: 60_000,
  })
  assert.ok(content.length > 40, 'the bridge returned nothing usable')
})

test('the region rewriter answers with an element, not a document', { skip: !live }, async () => {
  const { content } = await askLocal({
    model: process.env.LIVE_MODEL || 'qwen2.5:3b',
    messages: [
      { role: 'system', content: 'You are a precise HTML editor. You change exactly one element and return only that element.' },
      { role: 'user', content: 'Current element:\n<button class="cell" id="c4">X</button>\nThe person\'s instruction about this element: make it blue' },
    ],
    timeoutMs: 60_000,
  })
  assert.match(content.trim(), /^<button/, 'the rewriter did not return a bare element')
})

test('the proxy still refuses what the UI never needs', { skip: !live }, async () => {
  const pull = await fetch('/api/ollama/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'evil:latest' }) })
  assert.equal(pull.status, 403, 'model pull must be refused')
  // Percent-encoded, so the HTTP client does not normalise it away before the
  // request is sent — this is the form that actually reaches the vault API.
  const escape = await fetch('/api/vault/%2e%2e%2f%2e%2e%2fetc/passwd')
  assert.equal(escape.status, 403, `a path escape returned ${escape.status}`)
})

test('the vault API answers, or the app is told it is offline', { skip: !live }, async () => {
  const status = await vaultGet('/status').catch(error => ({ offline: error.message }))
  assert.ok(status.ok === true || typeof status.offline === 'string')
})
