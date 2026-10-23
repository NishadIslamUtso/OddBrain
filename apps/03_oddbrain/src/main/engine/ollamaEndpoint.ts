const ROUTE = /^api\/(?:tags|version|pull|delete)$/

/** Build only the small Ollama route set from an owner-configured HTTP origin. */
export function ollamaEndpoint(raw: string, route: string): string {
  if (!ROUTE.test(route)) throw Error('Unsupported Ollama route.')
  const url = new URL(String(raw || '').trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw Error('The Ollama address must be an HTTP(S) URL without credentials, a query or a fragment.')
  }
  if (!url.hostname || url.hostname.length > 253 || url.port.length > 5 || /[\x00-\x20\\]/.test(url.href)) {
    throw Error('The Ollama address is invalid.')
  }
  const basePath = url.pathname.replace(/\/+$/, '')
  url.pathname = `${basePath}/${route}`
  return url.toString()
}
