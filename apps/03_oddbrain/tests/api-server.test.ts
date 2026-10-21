import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { startLocalApi, type LocalApi } from '../src/main/api/server'

/**
 * The local API, on a real port, with real requests.
 *
 * These are the guarantees the renderer relies on: the interface is served, the
 * model routes go through, the routes that do not exist are refused, and a
 * service that is not running answers with something the interface can show
 * instead of a hang.
 */

let root = ''

function makeRendererDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'oddbrain-renderer-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>shell</title>')
  return dir
}

async function start(overrides: Partial<Parameters<typeof startLocalApi>[0]> = {}): Promise<LocalApi> {
  root = root || makeRendererDir()
  return startLocalApi({
    // Port 0 means "any free port", so a test never fights the running app for one.
    port: 0,
    rendererDir: root,
    // Deliberately dead service: this is what an offline machine looks like.
    // The vault is not a URL any more — it runs in this process, and
    // tests/vault-http.test.ts is where its own routes are covered.
    ollamaUrl: 'http://127.0.0.1:9',
    ...overrides,
  })
}

test('serves the built interface, and falls back to it for unknown paths', async () => {
  const api = await start()
  try {
    const index = await fetch(`${api.url}/`)
    assert.equal(index.status, 200)
    assert.match(await index.text(), /<title>shell<\/title>/)
    const deep = await fetch(`${api.url}/some/client/route`)
    assert.equal(deep.status, 200, 'the app is a single page; unknown paths still render it')
  } finally {
    await api.close()
  }
})

test('refuses to serve anything outside the built interface', async () => {
  const api = await start()
  try {
    const escape = await fetch(`${api.url}/../../package.json`)
    assert.equal(escape.status, 200)
    assert.doesNotMatch(await escape.text(), /"electron-vite"/, 'a traversal must not reach the repo')
  } finally {
    await api.close()
  }
})

test('an unreachable local service answers with a sentence, not a hang', async () => {
  const api = await start()
  try {
    const response = await fetch(`${api.url}/api/ollama/tags`)
    assert.equal(response.status, 502)
    const body = (await response.json()) as { error: string }
    assert.match(body.error, /not reachable on this machine/)
    assert.match(body.error, /nothing was sent anywhere else/)
  } finally {
    await api.close()
  }
})

test('routes that are not on the list are refused before anything is forwarded', async () => {
  const api = await start()
  try {
    const pull = await fetch(`${api.url}/api/ollama/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    assert.equal(pull.status, 403, 'downloading a model is not something the interface may do')
    const weird = await fetch(`${api.url}/api/vault/arbitrary-path`)
    assert.equal(weird.status, 403)
  } finally {
    await api.close()
  }
})

test('the review-only video MCP accepts local clients but refuses browser origins and non-POST requests', async () => {
  let called = 0
  const api = await start({ videoMcp: async (request, session) => { called++; return { status: 200, session: session || 'session-1', body: { jsonrpc: '2.0', id: (request as any).id, result: { ok: true } } } } })
  try {
    const local = await fetch(`${api.url}/api/video-studio-mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) })
    assert.equal(local.status, 200); assert.equal(local.headers.get('mcp-session-id'), 'session-1'); assert.equal(called, 1)
    const browser = await fetch(`${api.url}/api/video-studio-mcp`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hostile.example' }, body: '{}' })
    assert.equal(browser.status, 403); assert.equal(called, 1)
    const get = await fetch(`${api.url}/api/video-studio-mcp`)
    assert.equal(get.status, 405); assert.equal(called, 1)
  } finally { await api.close() }
})

test('a write has to be JSON, so a web page cannot post a form at the local services', async () => {
  const api = await start()
  try {
    const form = await fetch(`${api.url}/api/ollama/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'model=x',
    })
    assert.equal(form.status, 415)
    const json = await fetch(`${api.url}/api/ollama/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    // Allowed through the boundary, then honestly 502 because nothing is listening.
    assert.equal(json.status, 502)
  } finally {
    await api.close()
  }
})
