/**
 * The local API boundary.
 *
 * Everything the renderer is allowed to ask the machine for goes through here,
 * and nothing else does. This is a port of the old app's `server/proxy-policy.cjs`
 * — the route table, the origin rule and the JSON-writes-only rule are the same
 * rules, because they were the ones that had a test behind them.
 *
 * Why a boundary at all, when the model is on this machine anyway: Ollama's own
 * API can pull, delete and copy models. A web page in a browser — or a script
 * inside a rendered artifact — must not be able to drive any of that. So the app
 * exposes three routes, requires same-origin, and refuses form-encoded writes so
 * a page cannot CSRF the local services by submitting a form.
 */

/** Exactly the operations the interface needs. Add one only with a reason. */
export const LOCAL_API_ROUTES = new Map<string, string[]>([
  ['/api/ollama/tags', ['GET']],
  ['/api/ollama/show', ['POST']],
  ['/api/ollama/chat', ['POST']],
  ['/api/vault', ['GET']],
  ['/api/vault/', ['GET']],
  ['/api/vault/health', ['GET']],
  ['/api/vault/context', ['GET']],
  ['/api/vault/sources', ['GET']],
  ['/api/vault/capsules', ['GET']],
  // Content search — Cook This Prompt reads the vault through it.
  ['/api/vault/grep', ['GET']],
  ['/api/vault/recall', ['GET']],
  ['/api/vault/research', ['GET']],
  ['/api/vault/onui', ['GET']],
  ['/api/vault/links', ['GET']],
  // The Vault screen's file list, and one file's text for a preview.
  ['/api/vault/files', ['GET']],
  ['/api/vault/file', ['GET']],
  ['/api/vault/status', ['GET']],
  ['/api/vault/today', ['GET']],
  ['/api/vault/blacklist', ['GET', 'POST']],
  ['/api/vault/capture', ['POST']],
  ['/api/vault/export-zip', ['POST']],
])

/** Only the three fields this module reads, so tests can pass a plain object. */
export type BoundaryRequest = {
  url: string
  method?: string
  headers: Record<string, string | string[] | undefined>
}

export type BoundaryResponse = {
  writeHead: (status: number, headers?: Record<string, string>) => void
  end: (body?: string) => void
}

const header = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '')

/**
 * Decide whether a request may reach a local service. Writes the refusal itself,
 * so a caller cannot forget to.
 *
 * @returns true when the request was forwarded, false when it was answered here.
 */
export function protectLocalApi(
  request: BoundaryRequest,
  response: BoundaryResponse,
  next: () => void
): boolean {
  const pathname = request.url.split('?')[0]
  if (!pathname.startsWith('/api/ollama') && !pathname.startsWith('/api/vault')) {
    next()
    return true
  }
  const deny = (status: number, error: string): false => {
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error }))
    return false
  }
  if (!LOCAL_API_ROUTES.get(pathname)?.includes(request.method || '')) {
    return deny(
      403,
      `This local API operation is not enabled (${request.method || 'GET'} ${pathname}). No model downloads, deletes, shell or cloud actions are exposed.`
    )
  }
  const originHeader = header(request.headers.origin)
  if (originHeader) {
    let origin: URL
    try {
      origin = new URL(originHeader)
    } catch {
      return deny(403, 'Invalid API request origin.')
    }
    if (!['http:', 'https:'].includes(origin.protocol)) {
      return deny(403, 'Cross-origin API requests are not authorized.')
    }
    // Strict same-origin by default. A forwarded/preview host is only trusted
    // when ALLOW_PREVIEW_ORIGINS=1 is set explicitly, for running the dev server
    // behind a tunnel or a hosted preview.
    const host = header(request.headers['x-forwarded-host'] || request.headers.host)
      .split(',')[0]
      .trim()
    const preview = process.env.ALLOW_PREVIEW_ORIGINS === '1' && origin.hostname.endsWith('.e2b.app')
    if (!preview && origin.host !== host) {
      return deny(403, 'Cross-origin API requests are not authorized.')
    }
  }
  if (
    request.method === 'POST' &&
    !/^application\/json(?:\s*;|$)/i.test(header(request.headers['content-type']))
  ) {
    return deny(415, 'Local API writes require application/json, not browser forms.')
  }
  next()
  return true
}

/**
 * A remote destination is never allowed by accident: a service this app talks to
 * over plain HTTP must be on loopback and must not carry credentials in the URL.
 */
export function localTarget(value: string, label: string): string {
  const target = new URL(value)
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
    target.username ||
    target.password
  ) {
    throw new Error(
      `${label} must target an unauthenticated loopback service. Remote AI/vault destinations are not approved.`
    )
  }
  return value
}
