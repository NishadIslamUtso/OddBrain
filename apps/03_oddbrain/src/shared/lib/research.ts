/**
 * Fetching one page the owner names, as a source — not as an answer.
 *
 * Research in this app means: the owner picks a URL, the app retrieves it once,
 * writes the exact response's readable text into the vault's Sources folder
 * with its fingerprint, and never asks a model to summarize it. A fetched page
 * is evidence with a time and a hash. It is not proof the page is true, current
 * after the moment it was fetched, or representative of its site.
 *
 * Address rules exist because "fetch this URL" in a desktop app is also a
 * request to reach whatever the URL points at:
 *
 *   - https anywhere public; http only for this machine (a local docs server);
 *   - no credentials in the URL, no fragments;
 *   - private, loopback (except the local-http allowance), link-local and
 *     unique-local addresses are refused, including after a redirect.
 *
 * The shared rule below is what the screen shows before a request is made; the
 * main process repeats it and additionally resolves the host, so a name that
 * points inside the network is refused even though the text looked harmless.
 */

export type ResearchReply = {
  ok: boolean
  answer: string
  /** Vault-relative path of the written source, when one was written. */
  source?: string
  /** The URL the bytes actually came from, after redirects. */
  url?: string
  title?: string
  bytes?: number
  sha256?: string
  /** True when the readable text was cut at this app's limit. */
  truncated?: boolean
  /** True when an identical capture was already in the vault. */
  duplicate?: boolean
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** A URL this app is willing to fetch, or the reason it is not. */
export function researchUrlProblem(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'Paste a page address first.'
  const value = raw.trim()
  if (value.length > 2048) return 'That address is too long.'
  if (/[\u0000-\u001f\u007f]/.test(value)) return 'That address contains control characters.'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'That is not a full address. Include https:// (or http:// for a page on this machine).'
  }
  if (url.username || url.password) return 'Put credentials in the site itself; this app will not send a login in a URL.'
  if (url.hash) return 'Remove the #part from the address; it never reaches the server.'
  const loopback = LOOPBACK.has(url.hostname) || LOOPBACK.has(url.host)
  if (url.protocol === 'https:') return ''
  if (url.protocol === 'http:') return loopback ? '' : 'Use https://. Plain http is allowed only for a page on this machine.'
  return 'Only https pages (and http on this machine) can be fetched.'
}

/** True for IP literals and names that are not public internet destinations. */
export function privateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number)
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true
    if (host.startsWith('::ffff:')) return privateHost(host.slice(7))
    return false
  }
  // A host without a dot is a local name on most networks; refuse it rather
  // than guess which one the OS will resolve.
  return !host.includes('.')
}

/** A short, honest label for where a fetched page came from. */
export function researchSummary(reply: ResearchReply): string {
  if (!reply.ok) return reply.answer
  const size = typeof reply.bytes === 'number' ? `${reply.bytes.toLocaleString()} bytes` : ''
  const where = reply.source ? `Saved as ${reply.source}` : 'Saved'
  const notes = [
    reply.duplicate ? 'The same bytes were already in the vault; no second file was written.' : '',
    reply.truncated ? 'The readable text was longer than this app stores and was cut at the limit.' : '',
  ].filter(Boolean)
  return [where, size].filter(Boolean).join(' · ') + '.' + (notes.length ? ` ${notes.join(' ')}` : '')
}
