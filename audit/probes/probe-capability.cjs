'use strict'
// Real HTTP against the real local API server: the AI connector path must carry the secret capability.
const path = require('node:path'), fs = require('node:fs')
const { APP_ROOT, WORK, OUT } = require('./paths.cjs')
const esbuild = require(path.join(APP_ROOT, 'node_modules/esbuild'))
fs.mkdirSync(OUT, { recursive: true })
esbuild.buildSync({ entryPoints: [path.join(APP_ROOT, 'src/main/api/server.ts')], bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(OUT, 'api-server.cjs'), logLevel: 'error' })
const { startLocalApi } = require(path.join(OUT, 'api-server.cjs'))
const hex = 'a'.repeat(64)
const post = (port, p, body, headers = {}) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, text: (await r.text()).slice(0, 110) }))
;(async () => {
  const seen = []
  const api = await startLocalApi({ port: 0, videoMcpPath: `/api/video-studio-mcp/${hex}`, videoMcp: async (req, session) => { seen.push(req.method); return { status: 200, body: { jsonrpc: '2.0', id: req.id, result: { ok: true } } } } })
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }
  const rows = [
    ['no capability (old URL)', await post(api.port, '/api/video-studio-mcp', init)],
    ['wrong capability', await post(api.port, `/api/video-studio-mcp/${'b'.repeat(64)}`, init)],
    ['prefix only', await post(api.port, `/api/video-studio-mcp/${hex.slice(0, 63)}`, init)],
    ['correct capability', await post(api.port, `/api/video-studio-mcp/${hex}`, init)],
    ['correct capability + Origin header (a web page)', await post(api.port, `/api/video-studio-mcp/${hex}`, init, { origin: 'https://evil.example' })],
  ]
  const ok = rows[0][1].status === 403 && rows[1][1].status === 403 && rows[2][1].status === 403 && rows[3][1].status === 200 && rows[4][1].status === 403 && seen.length === 1
  console.log(`[${ok ? 'PASS' : 'DEFECT'}] C01 AI connector URL needs the secret capability\n` + rows.map(([n, r]) => `          ${n.padEnd(48)} -> HTTP ${r.status}`).join('\n') + `\n          requests that reached the review tools: ${seen.length} (expected 1)`)
  await api.close(); process.exit(0)
})().catch(e => { console.log('[DEFECT] C01 probe threw: ' + e.message); process.exit(0) })
