'use strict'
// Shared probe harness: builds the REAL VideoStudio service (bundled, unmodified) against a fake native Kdenlive.
const fs = require('node:fs')
const path = require('node:path')
const { startFake } = require('./fake-kdenlive.cjs')
const { WORK, OUT } = require('./paths.cjs')
const { createVideoStudioService } = require(path.join(OUT, 'video-service.cjs'))

fs.mkdirSync(WORK, { recursive: true })
const results = []
const C = { PASS: '\x1b[32mPASS\x1b[0m', DEFECT: '\x1b[31mDEFECT\x1b[0m', INFO: '\x1b[36mINFO\x1b[0m', WARN: '\x1b[33mWARN\x1b[0m' }
function record(id, title, verdict, detail) {
  results.push({ id, title, verdict, detail })
  console.log(`[${C[verdict] || verdict}] ${id} ${title}`)
  for (const line of String(detail).split('\n')) console.log(`          ${line}`)
}

async function world(opts = {}) {
  const root = fs.mkdtempSync(path.join(WORK, 'w-'))
  const userData = path.join(root, 'userData'); fs.mkdirSync(userData, { recursive: true })
  const projectFolder = path.join(root, 'project'); fs.mkdirSync(projectFolder, { recursive: true })
  const kdenlive = path.join(root, 'kdenlive')
  fs.writeFileSync(kdenlive, '#!/bin/sh\necho "kdenlive 26.08.0 (fake binary for audit)"\n', { mode: 0o755 })
  // The 2026-10-22 build refuses an editor endpoint that does not require a bearer token, so probes save one by default.
  // Tests that need the old behaviour pass `token` explicitly (A10) or `noToken: true`.
  const defaultToken = 'audit-token', token = opts.noToken ? '' : (opts.token === undefined ? defaultToken : opts.token)
  const editorFolder = opts.editorFolder ? (fs.mkdirSync(opts.editorFolder, { recursive: true }), opts.editorFolder) : projectFolder
  const fake = opts.noFake ? null : await startFake({ token, projectFolder: editorFolder, renderSample: opts.renderSample })
  const store = new Map(Object.entries(opts.keys || {}))
  if (!opts.noToken && opts.token === undefined) store.set('oddbrain-kdenlive-mcp', defaultToken)
  const keyStore = { encryption: 'os', has: id => store.has(id), persisted: id => store.has(id), get: id => store.get(id) || '', set: (id, v) => store.set(id, v), clear: id => store.delete(id), ids: () => [...store.keys()] }
  const clock = { t: Date.UTC(2026, 9, 21, 12, 0, 0) }
  const svc = createVideoStudioService({
    file: path.join(userData, 'video-studio.json'),
    keys: () => keyStore,
    fetchImpl: opts.fetchImpl,
    runCommand: opts.runCommand,
    analyzeVideo: opts.analyzeVideo,
    expandVideoEvidence: opts.expandVideoEvidence,
    assertRemote: async () => {},
    now: () => clock.t,
    launch: () => {},
  })
  await svc.update({ kdenlive, projectFolder, ...(fake ? { mcpUrl: fake.url } : {}), ...(opts.ytDlp ? { ytDlp: opts.ytDlp } : {}) })
  return { svc, fake, root, userData, projectFolder, kdenlive, keyStore, clock, advance: ms => { clock.t += ms } }
}

let rpcId = 1
async function ai(svc, session, method, params) {
  const reply = await svc.aiMcp({ jsonrpc: '2.0', id: rpcId++, method, params }, session)
  return reply
}
/** Minimal MCP client against the service's AI-facing review server (what Claude Code would do). */
async function aiClient(svc) {
  const init = await ai(svc, '', 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'probe', version: '1' } })
  const session = init.session
  await svc.aiMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, session)
  const call = async (name, args = {}) => {
    const r = await ai(svc, session, 'tools/call', { name, arguments: args })
    if (r.body?.error) return { error: r.body.error.message, status: r.status, raw: r }
    const text = r.body.result.content.find(c => c.type === 'text')?.text
    return { data: text ? JSON.parse(text) : null, content: r.body.result.content, status: r.status, isError: r.body.result.isError }
  }
  return { session, init, call, list: () => ai(svc, session, 'tools/list', {}) }
}

module.exports = { world, record, results, aiClient, ai, fs, path }
