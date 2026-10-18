/**
 * preview-server.cjs — static host for the built app, with the two local API
 * proxies. No Vite, no HMR, no host allowlist, no CSP response headers.
 *
 * This exists because a dev server behind a forwarding preview proxy has a lot
 * of moving parts (host checking, the HMR websocket, a module graph of hundreds
 * of requests). When the preview shows a blank page this is the fallback that
 * removes all of them: two static files and two server-side proxies.
 *
 * Local only. The browser never talks to Ollama or the vault API directly.
 */
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

// `dist` and `node_modules` are NOT captured by this sandbox's snapshots, so
// they vanish whenever it resets. The preview build goes to `preview-dist`,
// which persists. Falls back to `dist` for a normal local build.
const ROOT = [path.resolve(__dirname, '..', 'preview-dist'), path.resolve(__dirname, '..', 'dist')]
  .find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || path.resolve(__dirname, '..', 'preview-dist')
const PORT = Number(process.env.PORT || 4173)
const HOST = process.env.HOST || '0.0.0.0'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/** Forward /api/ollama/* to /api/* on Ollama and /api/vault/* to the vault API. */
function proxy(request, response, target, prefix, rewrite) {
  const url = new URL(request.url, 'http://localhost')
  url.pathname = rewrite(url.pathname.slice(prefix.length) || '/')
  const upstream = http.request(
    { hostname: target.hostname, port: target.port, path: url.pathname + url.search, method: request.method,
      headers: { ...request.headers, host: `${target.hostname}:${target.port}` } },
    (up) => {
      response.writeHead(up.statusCode || 502, up.headers)
      up.pipe(response)
    },
  )
  upstream.on('error', (error) => {
    response.writeHead(502, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: `${target.label} is not reachable on ${target.hostname}:${target.port}. ${error.message}` }))
  })
  request.pipe(upstream)
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  // Ollama serves its routes under /api; the vault API serves them at the root.
  if (pathname.startsWith('/api/ollama/')) return proxy(request, response, { hostname: '127.0.0.1', port: 11434, label: 'Ollama' }, '/api/ollama', (rest) => `/api${rest}`)
  if (pathname.startsWith('/api/vault/')) return proxy(request, response, { hostname: '127.0.0.1', port: 8765, label: 'The vault API' }, '/api/vault', (rest) => rest)

  const candidate = path.join(ROOT, pathname)
  const file = candidate.startsWith(ROOT) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(ROOT, 'index.html') // SPA fallback

  if (!fs.existsSync(file)) {
    // Never answer with a blank page — a silent white screen is undiagnosable.
    response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return response.end(`<!doctype html><html><head><title>AI ASSistant — not built</title></head>
<body style="font:14px/1.6 system-ui,sans-serif;padding:32px;max-width:44rem">
<h1>The app is built, but the build output is missing.</h1>
<p>Looked for <code>preview-dist/index.html</code> and <code>dist/index.html</code>.
Neither exists. This sandbox does not keep <code>dist/</code> or <code>node_modules/</code>
between resets, which is why the preview can go blank.</p>
<p>Rebuild with:</p><pre>npm install &amp;&amp; npm run build:preview</pre>
</body></html>`)
  }
  response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(response)
})

server.listen(PORT, HOST, () => {
  console.log(`AI ASSistant (built)  ->  http://${HOST}:${PORT}`)
  console.log(`serving               ->  ${ROOT}`)
  console.log('proxy /api/ollama/*   ->  127.0.0.1:11434/api/*')
  console.log('proxy /api/vault/*    ->  127.0.0.1:8765/*')
})
server.on('error', (error) => {
  console.error(`Preview server could not start: ${error.message}`)
  process.exitCode = 1
})
