import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import proxyPolicy from './server/proxy-policy.cjs'
// Vite marks built assets `crossorigin`. Behind a forwarding preview proxy that
// can fail CORS and leave a blank page. The assets are same-origin, so drop it.
const stripCrossorigin = {
  name: 'strip-crossorigin',
  enforce: 'post',
  transformIndexHtml: (html) => html.replace(/\s+crossorigin(?:="")?/g, ''),
}

const localApiBoundary = {
  name: 'local-api-boundary',
  configureServer(server) { server.middlewares.use(proxyPolicy.protectLocalApi) },
  configurePreviewServer(server) { server.middlewares.use(proxyPolicy.protectLocalApi) },
}

// The browser always uses this origin. This also works behind Arena's HTTPS
// preview; 127.0.0.1 below refers to the machine running Vite, never the browser.
const proxy = {
  '/api/ollama': {
    target: proxyPolicy.localTarget(process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434', 'OLLAMA_API_URL'),
    changeOrigin: true,
    rewrite: path => path.replace(/^\/api\/ollama/, '/api'),
    configure(proxy) {
      proxy.on('proxyReq', request => {
        // This is a server-to-server local request, not a browser CORS request.
        request.removeHeader('origin'); request.removeHeader('cookie'); request.removeHeader('authorization')
      })
      proxy.on('error', (_error, _request, response) => {
        if (response && !response.headersSent && response.writeHead) {
          response.writeHead(503, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ error: 'Ollama is not reachable on this machine at port 11434. Start the existing Ollama installation; no model download is needed.' }))
        }
      })
    },
  },
  '/api/vault': {
    target: proxyPolicy.localTarget(process.env.VAULT_API_URL || 'http://127.0.0.1:8765', 'VAULT_API_URL'),
    changeOrigin: true,
    rewrite: path => path.replace(/^\/api\/vault/, '') || '/',
    configure(proxy) {
      proxy.on('proxyReq', request => { request.removeHeader('cookie'); request.removeHeader('authorization') })
    },
  },
}

// A sandboxed artifact cannot navigate its frame to an external site either.
// Inline srcdoc still works with frame-src 'none'; ALL frame navigations,
// including same-origin API URLs and blob escapes, are denied.
const headers = { 'Content-Security-Policy': "frame-src 'none'; object-src 'none'; base-uri 'self'" }
// Behind the HTTPS preview proxy the browser must reach the HMR socket on 443,
// not on the dev port; otherwise the client cannot connect. Only applied when
// previewing from another host, so a normal local run is untouched.
const hmr = process.env.ALLOW_PREVIEW_ORIGINS === '1' ? { clientPort: 443 } : undefined

export default defineConfig({
  // Relative asset URLs, so the built app also works when it is served from a
  // path prefix rather than a domain root. With absolute /assets/... a preview
  // served under a subpath 404s every asset and shows a blank white page.
  base: './',
  plugins: [localApiBoundary, stripCrossorigin, react()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'], proxy, headers, hmr },
  preview: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'], proxy, headers },
})
