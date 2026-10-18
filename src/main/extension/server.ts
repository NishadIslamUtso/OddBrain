import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { BODY_LIMIT, readBody } from '../api/body'
import { handleVaultRequest } from '../vault/routes'
import type { VaultService } from '../vault/service'

/**
 * The extension port.
 *
 * The browser extension is a separate program. It cannot use the app's own API:
 * that one is served to the window and answers only its own origin, on purpose.
 * So the extension gets a socket of its own — on a fixed port, because it has no
 * way to discover a dynamic one.
 *
 * What makes opening a port acceptable is how narrow it is. This listener
 * answers the capture side of the vault and nothing else:
 *
 *   - no chat and no model routes, so an extension can never spend a saved key
 *   - no settings, so it cannot change how the app is configured
 *   - no export, so it cannot ask for the whole vault in one response
 *   - JSON writes only, same 20 MB ceiling as the app, loopback only
 *
 * One more thing it does: it asks permission. `mayCapture` is read on every
 * request, so switching browser captures off in Settings > Agent access stops
 * them immediately — the origin rule decides who may ask, the permission decides
 * whether there is anything to answer with.
 *
 * And who it answers: the ORIGIN rule says which browsers may talk, and the
 * PAIRING TOKEN says which extension may. An extension's id does not exist
 * until the person installs it, so the origin cannot be an allowlist — every
 * installed extension would pass it, including ones the person never asked
 * to read their vault. So every request carries `x-oddbrain-pair: <token>`,
 * a secret generated on this machine for this install; without it the port
 * refuses with a sentence saying why. The token lives in the app's own
 * folder, and the extension's pairing screen (ships with the extension's
 * first release) is how it crosses over. A web page can pass neither test:
 * script cannot set its own `Origin` header, and a page sending one gets a
 * refusal.
 */

/** Fixed, so the extension can find the app without asking anybody. */
export const DEFAULT_EXTENSION_PORT = 8765

/**
 * The whole surface, method by method. Anything not in this table is a 404, so a
 * route added to the vault later is not reachable from here by accident.
 */
export const EXTENSION_ROUTES = new Map<string, string[]>([
  ['/', ['GET']],
  ['/health', ['GET']],
  ['/status', ['GET']],
  ['/context', ['GET']],
  ['/capsules', ['GET']],
  ['/grep', ['GET']],
  ['/onui', ['GET']],
  ['/links', ['GET']],
  ['/blacklist', ['GET', 'POST']],
  ['/capture', ['POST']],
])

export type ExtensionApi = {
  port: number
  url: string
  /** The per-install pairing secret the extension must present. */
  pairToken: string
  /** False when the port was already taken: the app keeps running, and says so. */
  listening: boolean
  error: string
  close: () => Promise<void>
  /** Swap the pairing secret (Rotate in Settings): the old one stops working immediately. */
  setPairToken: (next: string) => void
}

const header = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? '' : value ?? ''

/** Loopback, with no credentials in the URL — the same rule the app holds itself to. */
const isLoopback = (hostname: string): boolean =>
  ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)

/**
 * Decide who may talk to this port. Pure, so the rule can be tested without a
 * socket, and so there is exactly one place that decides.
 */
export function extensionOrigin(
  originHeader: string | string[] | undefined,
  port: number
): { allowed: boolean; allow: string; error: string } {
  const origin = header(originHeader).trim()
  const refuse = (error: string): { allowed: boolean; allow: string; error: string } => ({
    allowed: false,
    allow: '',
    error,
  })
  if (!origin) {
    return refuse(
      'This port answers the OddBrain browser extension, which always says where it is calling from. Nothing was written.'
    )
  }
  if (origin.startsWith('chrome-extension://')) return { allowed: true, allow: origin, error: '' }
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return refuse('That origin is not a URL, so this port will not answer it.')
  }
  // The app's own window, and a person poking at it with curl during development.
  // The port has to match this listener's, so nobody else's loopback service can
  // borrow the permission — and it has to be plain http, because that is what
  // this listener speaks: an https origin claiming this port is a different
  // service that happens to have taken the number.
  if (parsed.protocol === 'http:' && isLoopback(parsed.hostname) && String(parsed.port || '') === String(port)) {
    return { allowed: true, allow: origin, error: '' }
  }
  return refuse(
    'Only the OddBrain browser extension may post captures to this port. A web page cannot: this refusal is not sent to pages, it is sent to whoever asked.'
  )
}

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

/**
 * Start the port. It resolves either way: a busy port is not a crash, it is a
 * fact the Settings pane shows and the log states.
 */
export function startExtensionApi(options: {
  port?: number
  vault: VaultService
  host?: string
  /**
   * Whether captures are allowed at all, read on every request. Absent means yes:
   * a caller that has not been told about permissions (a test) is not silently
   * blocked, and the app always passes the real answer.
   */
  mayCapture?: () => boolean
  /**
   * The per-install pairing secret. Absent means one is generated for this
   * run; production hands the persisted one so a paired extension keeps
   * working across restarts.
   */
  pairToken?: string
}): Promise<ExtensionApi> {
  const wanted = options.port ?? DEFAULT_EXTENSION_PORT
  const host = options.host || '127.0.0.1'
  const service = options.vault
  const mayCapture = (): boolean => (options.mayCapture ? options.mayCapture() : true)
  let pairToken = options.pairToken ?? randomBytes(24).toString('hex')

  const server = createServer((request, response) => {
    void handle(request, response).catch(error => {
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'application/json' })
      }
      response.end(
        JSON.stringify({
          ok: false,
          error: `The extension port could not handle that request (${(error as Error).message}).`,
        })
      )
    })
  })

  function send(
    response: ServerResponse,
    status: number,
    body: unknown,
    origin: string,
    extra: Record<string, string> = {}
  ): void {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(origin ? cors(origin) : {}),
      ...extra,
    })
    response.end(JSON.stringify(body))
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const port = currentPort()
    const decision = extensionOrigin(request.headers.origin, port)
    if (!decision.allowed) {
      // No CORS headers on a refusal: the browser is not told this port exists.
      send(response, 403, { ok: false, error: decision.error }, '')
      return
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors(decision.allow))
      response.end()
      return
    }

    const url = new URL(request.url || '/', `http://${host}:${port}`)
    const route = url.pathname.replace(/\/+$/, '') || '/'
    const allowedMethods = EXTENSION_ROUTES.get(route)
    if (!allowedMethods) {
      send(
        response,
        404,
        {
          ok: false,
          error: `${route} is not one of the routes the extension may use (${[...EXTENSION_ROUTES.keys()].join(', ')}).`,
        },
        decision.allow
      )
      return
    }
    if (!allowedMethods.includes(request.method || '')) {
      send(
        response,
        405,
        {
          ok: false,
          error: `${request.method} is not a method ${route} answers. It answers ${allowedMethods.join(' and ')}.`,
        },
        decision.allow,
        { Allow: allowedMethods.join(', ') }
      )
      return
    }

    // The pairing gate: the origin proves a BROWSER extension is asking, the
    // token proves it is THIS person's extension.
    const presented = header(request.headers['x-oddbrain-pair'])
    const expected = Buffer.from(pairToken)
    const got = Buffer.from(presented)
    const same = got.length === expected.length && timingSafeEqual(got, expected)
    if (!same) {
      send(
        response,
        401,
        {
          ok: false,
          error:
            'This extension is not paired with OddBrain yet. Open OddBrain, choose Settings > Plugins > Agent access, copy the pairing token, and paste it into the extension popup (or send it as the x-oddbrain-pair header).',
        },
        decision.allow
      )
      return
    }

    // The app's own identity, and the one route the extension uses to decide
    // whether the app is there at all. Deliberately cheap: no counting files.
    if (route === '/' || route === '/health') {
      send(
        response,
        200,
        {
          ok: true,
          app: 'OddBrain',
          port,
          vault: service.root,
          available: service.available(),
          // So the extension can say "the app has captures switched off" instead
          // of retrying a request that will keep being refused.
          captures: mayCapture(),
          timezone: 'Asia/Dhaka',
          message: 'The browser extension posts captures here. Nothing else is served on this port.',
        },
        decision.allow
      )
      return
    }

    let body: unknown
    if (request.method === 'POST') {
      let text: string
      try {
        text = await readBody(request, BODY_LIMIT)
      } catch (error) {
        send(response, 413, { ok: false, error: (error as Error).message }, decision.allow)
        return
      }
      try {
        body = text ? JSON.parse(text) : {}
      } catch {
        send(response, 400, { ok: false, error: 'That request was not valid JSON.' }, decision.allow)
        return
      }
      if (!/^application\/json(?:\s*;|$)/i.test(header(request.headers['content-type']))) {
        // Checked after parsing so the refusal is about the header, not the body:
        // a form post is refused even when it happens to be valid JSON.
        send(
          response,
          415,
          { ok: false, error: 'Captures have to be application/json, not a browser form.' },
          decision.allow
        )
        return
      }
    }

    // The one permission this port acts on. Reading the never-check list is still
    // allowed while captures are off: the list is what keeps a site private, and
    // the popup has to be able to show it.
    if (route === '/capture' && !mayCapture()) {
      send(
        response,
        403,
        {
          ok: false,
          skipped: true,
          reason: 'captures-off',
          error: 'Captures from the browser extension are switched off in Settings > Agent access.',
        },
        decision.allow
      )
      return
    }

    const reply = handleVaultRequest(service, {
      route,
      method: request.method || 'GET',
      query: url.searchParams,
      body,
    })
    send(response, reply.status, reply.body, decision.allow)
  }

  let live: { port: number } = { port: wanted }
  const currentPort = (): number => live.port

  return new Promise<ExtensionApi>(resolve => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      const reason =
        error.code === 'EADDRINUSE'
          ? `Port ${wanted} is already in use by something else, so the browser extension cannot reach this app right now.`
          : `The extension port could not be opened (${error.message}).`
      console.log(`[extension] ${reason}`)
      resolve({
        port: wanted,
        url: `http://${host}:${wanted}`,
        pairToken,
        listening: false,
        error: reason,
        close: async () => {},
        setPairToken: (next: string) => { pairToken = next },
      })
    })
    // Loopback only, like everything else in this app. This port is part of the
    // app, not part of the network.
    server.listen(wanted, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : wanted
      live = { port }
      resolve({
        port,
        url: `http://${host}:${port}`,
        pairToken,
        listening: true,
        error: '',
        close: () => new Promise<void>(done => server.close(() => done())),
        setPairToken: (next: string) => { pairToken = next },
      })
    })
  })
}
