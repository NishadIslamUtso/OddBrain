import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { localTarget, protectLocalApi } from './guard'
import { BODY_LIMIT, readBody } from './body'
import { handleVaultRequest } from '../vault/routes'
import type { VaultService } from '../vault/service'
import { parseCloudModel } from '../../shared/lib/providers'
import type { OllamaMessage, OllamaRecord } from '../../shared/types'

/**
 * The local API, inside the app.
 *
 * The renderer talks to `/api/ollama/*` and `/api/vault/*` on the same origin it
 * was served from. In the packaged app that is this server: it serves the built
 * interface AND forwards those two prefixes. That is why the renderer's fetch
 * calls are plain relative URLs — one code path, no port plumbing, no CORS, and
 * the guard in guard.ts sees a real Origin header instead of `null`.
 *
 * In dev the interface is served by Vite instead, and Vite's proxy forwards
 * /api to this same server (see electron.vite.config.ts), so the renderer still
 * cannot tell the difference.
 */

export type LocalApiOptions = {
  onInferenceActivity?: (busy: boolean) => void
  port: number
  /** Directory holding the built renderer. Omitted in dev, where Vite serves it. */
  rendererDir?: string
  ollamaUrl?: string
  /**
   * The vault, living in this process. It is not a URL and there is no second
   * server: captures are written by the same process that serves this API.
   */
  vault?: VaultService
  /**
   * Cloud providers, in this process and holding the keys. Absent until a key is
   * saved, and absent in tests that only exercise Ollama — a machine with no keys
   * has no cloud code path at all.
   */
  cloud?: CloudStream
  /** Local, review-only MCP tools for video evidence/library/plan proposals. */
  videoMcp?: (request: unknown, session: string) => Promise<{ status: number; body: unknown; session?: string }>
  /** Exact capability path written through owner-reviewed engine config. */
  videoMcpPath?: string
}

/**
 * What the API needs from the cloud client: a reply as the same records Ollama
 * produces. Deliberately narrow, so the server cannot reach a provider's key
 * material or its model list.
 */
export type CloudStream = {
  stream: (input: {
    model: string
    messages: OllamaMessage[]
    maxTokens: number
    signal?: AbortSignal
  }) => AsyncGenerator<OllamaRecord>
}

export type LocalApi = {
  port: number
  url: string
  close: () => Promise<void>
  /**
   * Point the vault routes at a different service, while the app runs. Settings
   * uses this: choosing a folder should not need a restart, and the interface
   * re-checks the status the moment it changes.
   */
  setVault: (vault: VaultService) => void
}

const OLLAMA_DEFAULT = 'http://127.0.0.1:11434'

/** How much of a reply a cloud provider is asked for. They all require a ceiling. */
const CLOUD_MAX_TOKENS = 4096

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

/**
 * Forward one request to a loopback service and stream the answer straight back.
 *
 * Streaming matters here and is not an optimisation: a reply arrives as NDJSON
 * records, and buffering the response would hold every token until the model
 * finished — the exact behaviour the interface exists to avoid.
 */
function forward(
  request: IncomingMessage,
  response: ServerResponse,
  target: string,
  toTargetPath: (rest: string) => string,
  label: string,
  bodyText?: string
): void {
  // request.url is a path ('/api/ollama/tags'), not an absolute URL, so it has
  // to be parsed against a base. Without one this throws inside the request
  // handler — which in a packaged app means the window never finishes loading.
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const upstream = httpRequest(
    {
      protocol: new URL(target).protocol,
      hostname: new URL(target).hostname,
      port: new URL(target).port,
      path: toTargetPath(url.pathname.replace(/^\/api\/ollama/, '') + url.search),
      method: request.method,
      headers: {
        ...request.headers,
        host: new URL(target).host,
        // A body that was read here (so the model could be looked at) is sent on
        // explicitly; the length is this body's, not the original's.
        ...(bodyText !== undefined ? { 'content-length': String(Buffer.byteLength(bodyText)) } : {}),
      },
    },
    upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode || 502, {
        'Content-Type': upstreamResponse.headers['content-type'] || 'application/json',
        // Streaming NDJSON must not be buffered by anything in between.
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      })
      upstreamResponse.pipe(response)
    }
  )
  upstream.on('error', () => {
    // Quiet by construction: the interface shows "offline" from the status code,
    // and nothing is written to the console that a user would have to interpret.
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json' })
    }
    response.end(
      JSON.stringify({
        error: `${label} is not reachable on this machine. Start it and try again, nothing was sent anywhere else.`,
      })
    )
  })
  // If the interface stops the request (a stopped reply), stop asking upstream.
  request.on('aborted', () => upstream.destroy())
  if (bodyText !== undefined) upstream.end(bodyText)
  else request.pipe(upstream)
}

function serveStatic(file: string, response: ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  })
  createReadStream(file).pipe(response)
}

function handleStatic(
  rendererDir: string,
  request: IncomingMessage,
  response: ServerResponse
): void {
  const url = new URL(request.url || '/', 'http://localhost')
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = resolve(join(rendererDir, requested))
  // Never serve anything outside the built interface.
  if (!file.startsWith(resolve(rendererDir))) file = join(resolve(rendererDir), 'index.html')
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(resolve(rendererDir), 'index.html')
  if (!existsSync(file)) {
    response.writeHead(404, { 'Content-Type': 'text/plain' })
    response.end('The interface has not been built yet. Run npm run build.')
    return
  }
  serveStatic(file, response)
}

/** Start the API. Resolves once it is listening so the caller can load the window. */
export function startLocalApi(options: LocalApiOptions): Promise<LocalApi> {
  const ollama = localTarget(options.ollamaUrl || OLLAMA_DEFAULT, 'OLLAMA_API_URL')
  const cloud = options.cloud
  let vault = options.vault

  const server = createServer((request, response) => {
    try {
      handle(request, response)
    } catch (error) {
      // A bug in this file must cost one request, not the application. Anything
      // unexpected answers 500 with a sentence and is never retried silently.
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'application/json' })
      }
      response.end(
        JSON.stringify({
          error: `The local API could not handle that request (${(error as Error).message}).`,
        })
      )
    }
  })

  function handle(request: IncomingMessage, response: ServerResponse): void {
    const pathname = (request.url || '/').split('?')[0]
    if (pathname.startsWith('/api/video-studio-mcp')) {
      if (!options.videoMcpPath || pathname !== options.videoMcpPath) {
        response.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        response.end(JSON.stringify({ error: 'A current owner-reviewed Video Studio connector capability is required.' }))
        return
      }
      void handleVideoMcp(request, response)
      return
    }
    protectLocalApi(
      { url: request.url || '/', method: request.method, headers: request.headers },
      response,
      () => {
        if (pathname.startsWith('/api/ollama')) {
          if (request.method === 'POST' && /\/(chat|generate)$/.test(pathname)) {
            options.onInferenceActivity?.(true)
            let released = false
            const release = () => { if (!released) { released = true; options.onInferenceActivity?.(false) } }
            response.once('finish', release); response.once('close', release)
          }
          void handleOllama(request, response)
          return
        }
        if (pathname.startsWith('/api/vault')) {
          void handleVault(request, response).catch(error => {
            if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify({ ok: false, error: (error as Error).message }))
          })
          return
        }
        if (options.rendererDir) {
          handleStatic(options.rendererDir, request, response)
          return
        }
        response.writeHead(404, { 'Content-Type': 'text/plain' })
        response.end('Not found.')
      }
    )
  }

  async function handleVideoMcp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const host = String(request.headers.host || '').split(',')[0].trim()
    let hostname = ''
    try { hostname = new URL(`http://${host}`).hostname } catch {}
    const deny = (status: number, error: string): void => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ error })) }
    if (!options.videoMcp) { deny(503, 'Video review tools are not running.'); return }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) { deny(403, 'Video review tools accept only a literal loopback Host.'); return }
    if (request.headers.origin) { deny(403, 'Browser-origin requests cannot call Video Studio MCP tools.'); return }
    if (request.method !== 'POST') { deny(405, 'Video Studio MCP accepts POST only.'); return }
    if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] || ''))) { deny(415, 'Video Studio MCP requires application/json.'); return }
    let body: unknown
    try { body = JSON.parse(await readBody(request, BODY_LIMIT)) } catch (error) { deny(400, (error as Error).message || 'Invalid JSON request.'); return }
    try {
      const sessionHeader = request.headers['mcp-session-id'], session = Array.isArray(sessionHeader) ? sessionHeader[0] || '' : sessionHeader || ''
      const reply = await options.videoMcp(body, session)
      response.writeHead(reply.status, { ...(reply.body === '' ? {} : { 'Content-Type': 'application/json' }), 'Cache-Control': 'no-store', ...(reply.session ? { 'Mcp-Session-Id': reply.session } : {}) })
      response.end(reply.body === '' ? '' : JSON.stringify(reply.body))
    } catch (error) { deny(500, `Video Studio MCP failed safely: ${(error as Error).message}`) }
  }

  /**
   * Everything the interface asks of a model arrives here, and there is exactly
   * one address for it (`/api/ollama/...`) no matter who answers.
   *
   * A chat's model decides: `provider/model` for a provider whose key is saved,
   * anything else is Ollama's, unchanged. That is why the interface needed no new
   * streaming path and no new fetch — and why a cloud answer arrives as the same
   * records a local one does.
   */
  async function handleOllama(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const pass = (): void => forward(request, response, ollama, rest => `/api${rest}`, 'Ollama')
    if (request.method !== 'POST' || !url.pathname.endsWith('/chat') || !cloud) {
      pass()
      return
    }
    let text: string
    try {
      text = await readBody(request, BODY_LIMIT)
    } catch (error) {
      response.writeHead(413, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: (error as Error).message }))
      return
    }
    let body: { model?: string; messages?: OllamaMessage[] }
    try {
      body = text ? (JSON.parse(text) as { model?: string; messages?: OllamaMessage[] }) : {}
    } catch {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'That request was not valid JSON.' }))
      return
    }
    // Only a model that names a known provider with a saved key goes anywhere but
    // Ollama; everything else is forwarded byte for byte, as it always was.
    if (!parseCloudModel(body.model)) {
      forward(request, response, ollama, rest => `/api${rest}`, 'Ollama', text)
      return
    }
    await streamCloud(response, request, String(body.model), Array.isArray(body.messages) ? body.messages : [])
  }

  /**
   * One cloud reply, written as NDJSON records.
   *
   * The first record is awaited before the response starts, so a key that was
   * refused or a provider that cannot be reached still answers with a status and
   * a sentence — not a 200 that then dribbles an error. Once the reply has begun,
   * a later failure travels as a record, so the text already on screen is kept.
   */
  async function streamCloud(
    response: ServerResponse,
    request: IncomingMessage,
    model: string,
    messages: OllamaMessage[]
  ): Promise<void> {
    const controller = new AbortController()
    request.on('aborted', () => controller.abort())
    const stream = cloud!.stream({ model, messages, maxTokens: CLOUD_MAX_TOKENS, signal: controller.signal })
    const write = (record: OllamaRecord): void => {
      if (response.writableEnded || response.destroyed) return
      response.write(`${JSON.stringify(record)}\n`)
    }
    let first: IteratorResult<OllamaRecord>
    try {
      first = await stream.next()
    } catch (error) {
      if (response.destroyed) return
      const message = (error as Error).name === 'AbortError' ? 'The reply was stopped.' : (error as Error).message
      response.writeHead(502, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: message }))
      return
    }
    if (response.destroyed) return
    response.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    })
    try {
      if (!first.done) write(first.value)
      for (;;) {
        const next = await stream.next()
        if (next.done) break
        write(next.value)
      }
      response.end()
    } catch (error) {
      write({ error: (error as Error).message })
      response.end()
    }
  }

  /**
   * The vault's routes, answered here rather than forwarded anywhere. Every
   * reply is JSON, so the interface never has to guess what came back, and a
   * failure answers with a sentence instead of an empty 200.
   */
  async function handleVault(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!vault) {
      response.writeHead(503, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: 'The vault service is not running in this process.' }))
      return
    }
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    let body: unknown
    if (request.method === 'POST') {
      let text: string
      try {
        text = await readBody(request, BODY_LIMIT)
      } catch (error) {
        response.writeHead(413, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: (error as Error).message }))
        return
      }
      try {
        body = text ? JSON.parse(text) : {}
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'That request was not valid JSON.' }))
        return
      }
    }
    const reply = handleVaultRequest(vault, {
      route: url.pathname.replace(/^\/api\/vault/, ''),
      method: request.method || 'GET',
      query: url.searchParams,
      body,
      captureSource: 'oddbrain-app',
    })
    response.writeHead(reply.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(reply.body))
  }

  return new Promise<LocalApi>((resolvePromise, reject) => {
    const ready = (): void => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : options.port
      resolvePromise({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>(done => server.close(() => done())),
        setVault: next => {
          vault = next
        },
      })
    }
    const firstError = (error: NodeJS.ErrnoException): void => {
      if (error.code !== 'EADDRINUSE' || options.port === 0) { reject(error); return }
      // A stale process or another local app may own the preferred port. Let the
      // OS choose a free loopback port and serve the renderer from that exact
      // same origin; falling back to file:// would strand every relative API
      // request. No remote interface is ever tried.
      server.once('error', reject)
      server.listen(0, '127.0.0.1', ready)
    }
    server.once('error', firstError)
    // Loopback only. This server is not part of the network, it is part of the app.
    server.listen(options.port, '127.0.0.1', ready)
  })
}
