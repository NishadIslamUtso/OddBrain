/**
 * One page, fetched once, kept as a source.
 *
 * The owner names the address; this module retrieves it, writes what the server
 * actually returned into the vault's `02 Sources/Web Pages` folder (the same
 * place the browser extension's captures live), and reports the fingerprint.
 *
 * What it never does:
 *   - summarize, interpret or "extract facts" with a model;
 *   - follow a redirect to http, to a private address, or more than three hops;
 *   - keep a page whose type is not readable text;
 *   - read an unbounded response (2 MB of bytes, 300,000 characters of text);
 *   - retry, guess, or claim the page is true or still current.
 *
 * The host is resolved before connecting and every address must be public, so a
 * name that looks fine but points inside the network is refused. A local page
 * (`http://localhost`) is allowed for a docs server on this machine, which is
 * the one case where "private" is the owner's own intent.
 */
import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { boundedResponse } from '../network/boundedResponse'
import { privateHost, researchUrlProblem, researchSummary, withoutInvisible, UNTRUSTED_CONTENT_NOTICE, type ResearchReply } from '../../shared/lib/research'

export const MAX_RESPONSE_BYTES = 2_000_000
export const MAX_TEXT_CHARS = 300_000
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 20_000
const READABLE = /^(?:text\/html|application\/xhtml\+xml|text\/plain|text\/markdown|application\/json|text\/csv|application\/xml|text\/xml)\b/i

type Capture = (data: Record<string, unknown>) => { ok?: boolean; source?: string; duplicate?: boolean; skipped?: boolean; reason?: string }

export type FetchDeps = {
  fetchImpl?: typeof fetch
  capture: Capture
  clock?: () => Date
  /** Defaults to the OS resolver; tests replace it. */
  resolve?: (hostname: string) => Promise<string[]>
}

/**
 * The named entities that actually change a word, and nothing guessed. An
 * unknown entity is kept as written: dropping it would silently alter the
 * page's text, and the point of a source is that its text is not altered.
 */
const NAMED: Array<[string, string]> = [
  ['quot', '"'],
  ['amp', '&'],
  ['apos', "'"],
  ['lt', '<'],
  ['gt', '>'],
  ['nbsp', '\xa0'],
  ['iexcl', '¡'],
  ['cent', '¢'],
  ['pound', '£'],
  ['yen', '¥'],
  ['sect', '§'],
  ['copy', '©'],
  ['laquo', '«'],
  ['reg', '®'],
  ['deg', '°'],
  ['plusmn', '±'],
  ['micro', 'µ'],
  ['para', '¶'],
  ['middot', '·'],
  ['raquo', '»'],
  ['frac14', '¼'],
  ['frac12', '½'],
  ['frac34', '¾'],
  ['iquest', '¿'],
  ['Agrave', 'À'],
  ['Aacute', 'Á'],
  ['Acirc', 'Â'],
  ['Atilde', 'Ã'],
  ['Auml', 'Ä'],
  ['Aring', 'Å'],
  ['AElig', 'Æ'],
  ['Ccedil', 'Ç'],
  ['Egrave', 'È'],
  ['Eacute', 'É'],
  ['Ecirc', 'Ê'],
  ['Euml', 'Ë'],
  ['Igrave', 'Ì'],
  ['Iacute', 'Í'],
  ['Icirc', 'Î'],
  ['Iuml', 'Ï'],
  ['Ntilde', 'Ñ'],
  ['Ograve', 'Ò'],
  ['Oacute', 'Ó'],
  ['Ocirc', 'Ô'],
  ['Otilde', 'Õ'],
  ['Ouml', 'Ö'],
  ['Oslash', 'Ø'],
  ['Ugrave', 'Ù'],
  ['Uacute', 'Ú'],
  ['Ucirc', 'Û'],
  ['Uuml', 'Ü'],
  ['Yacute', 'Ý'],
  ['szlig', 'ß'],
  ['agrave', 'à'],
  ['aacute', 'á'],
  ['acirc', 'â'],
  ['atilde', 'ã'],
  ['auml', 'ä'],
  ['aring', 'å'],
  ['aelig', 'æ'],
  ['ccedil', 'ç'],
  ['egrave', 'è'],
  ['eacute', 'é'],
  ['ecirc', 'ê'],
  ['euml', 'ë'],
  ['igrave', 'ì'],
  ['iacute', 'í'],
  ['icirc', 'î'],
  ['iuml', 'ï'],
  ['ntilde', 'ñ'],
  ['ograve', 'ò'],
  ['oacute', 'ó'],
  ['ocirc', 'ô'],
  ['otilde', 'õ'],
  ['ouml', 'ö'],
  ['oslash', 'ø'],
  ['ugrave', 'ù'],
  ['uacute', 'ú'],
  ['ucirc', 'û'],
  ['uuml', 'ü'],
  ['yacute', 'ý'],
  ['thorn', 'þ'],
  ['yuml', 'ÿ'],
  ['times', '×'],
  ['divide', '÷'],
  ['ndash', '–'],
  ['mdash', '—'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['hellip', '…'],
  ['euro', '€'],
  ['trade', '™'],
  ['larr', '←'],
  ['rarr', '→'],
]
const entity: Record<string, string> = Object.fromEntries(NAMED)

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    if (name.toLowerCase().startsWith('#x')) {
      const code = Number.parseInt(name.slice(2), 16)
      return Number.isSafeInteger(code) && code > 8 && code < 0x110000 ? String.fromCodePoint(code) : whole
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10)
      return Number.isSafeInteger(code) && code > 8 && code < 0x110000 ? String.fromCodePoint(code) : whole
    }
    return entity[name.toLowerCase()] ?? whole
  })
}

/** Readable text and title from an HTML page, without running anything in it. */
export function readableHtml(html: string, limit = MAX_TEXT_CHARS): { title: string; text: string; truncated: boolean; hiddenRemoved: number; invisibleRemoved: number } {
  const titleMatch = /<title[^>]*>([\s\S]{0,500}?)<\/title>/i.exec(html)
  const social = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']{0,300})["']/i.exec(html)
  const title = decodeEntities((titleMatch?.[1] ?? social?.[1] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 200)
  // A human never reads these, but a model reading the text does: one-pixel
  // white text, `hidden`, display:none. They are dropped before extraction and
  // counted, never quietly carried into the vault as if they were page text.
  let hiddenRemoved = 0
  const HIDDEN = /<(\w+)\b[^>]*\b(?:hidden|aria-hidden\s*=\s*["']?true["']?)[^>]*>[\s\S]*?<\/\1\s*>/gi
  const HIDDEN_STYLE = /<(\w+)\b[^>]*\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:\.0+)?(?:px|em|rem|pt)?\b|opacity\s*:\s*0(?:\.0+)?\b|color\s*:\s*(?:transparent|#fff(?:fff)?\b)|height\s*:\s*0|width\s*:\s*0)[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(HIDDEN, () => { hiddenRemoved += 1; return ' ' })
    .replace(HIDDEN_STYLE, () => { hiddenRemoved += 1; return ' ' })
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|blockquote|pre|td|th)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '· ')
    .replace(/<[^>]{0,4000}>/g, ' ')
  const decoded = decodeEntities(body)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t\f\v\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const invisible = withoutInvisible(decoded)
  const text = invisible.text
  return { title, text: text.slice(0, limit), truncated: text.length > limit, hiddenRemoved, invisibleRemoved: invisible.removed }
}

/** Resolve every address for a public host; any private answer refuses. */
async function publicHost(hostname: string, resolve: NonNullable<FetchDeps['resolve']>): Promise<void> {
  if (privateHost(hostname)) {
    // The one allowed private destination: this machine, over http.
    if (!LOOPBACK_HOSTS.has(hostname.toLowerCase())) throw Error('That address points inside a private network. Only public pages can be fetched.')
    return
  }
  const addresses = await resolve(hostname)
  if (!addresses.length) throw Error('The address did not resolve to anything.')
  for (const address of addresses) if (privateHost(address)) throw Error('That name resolves to a private address, so it was not fetched.')
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const textOf = (contentType: string, raw: string, limit: number): { title: string; text: string; truncated: boolean; hiddenRemoved: number; invisibleRemoved: number } => {
  if (/^text\/html|application\/xhtml\+xml/i.test(contentType)) return readableHtml(raw, limit)
  const invisible = withoutInvisible(raw.replace(/\r\n?/g, '\n').trim()), text = invisible.text
  return { title: '', text: text.slice(0, limit), truncated: text.length > limit, hiddenRemoved: 0, invisibleRemoved: invisible.removed }
}

/** Fetch one page and write it as a source. Cancellable; never retries. */
export async function fetchWebSource(rawUrl: unknown, deps: FetchDeps, signal?: AbortSignal): Promise<ResearchReply> {
  const complaint = researchUrlProblem(rawUrl)
  if (complaint) return { ok: false, answer: complaint }
  const fetchImpl = deps.fetchImpl ?? fetch
  const clock = deps.clock ?? (() => new Date())
  const resolve = deps.resolve ?? (async (hostname: string) => (await lookup(hostname, { all: true })).map(entry => entry.address))
  const started = clock()
  let url = new URL(String(rawUrl).trim())

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (signal?.aborted) return { ok: false, answer: 'Cancelled before the page was read.' }
    try {
      await publicHost(url.hostname, resolve)
    } catch (error) {
      return { ok: false, answer: `${error instanceof Error ? error.message : 'That address is not a public destination.'} Nothing was written.` }
    }
    let response: Response
    try {
      response = await fetchImpl(url.toString(), {
        redirect: 'manual',
        // No cookies, no referrer, no cached credentials: a fetch is not a visit.
        credentials: 'omit',
        headers: { Accept: 'text/html,text/plain,application/json,text/markdown;q=0.9,*/*;q=0.1', 'User-Agent': 'OddBrain/0.9 (source fetch; +local app)' },
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(TIMEOUT_MS)]),
      })
    } catch (error) {
      return { ok: false, answer: `The page could not be reached: ${error instanceof Error ? error.message : 'unknown network error'}. Nothing was written.` }
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) return { ok: false, answer: 'The site redirected without saying where. Nothing was written.' }
      const next = new URL(location, url)
      const complaintForNext = researchUrlProblem(next.toString())
      if (complaintForNext) return { ok: false, answer: `The site redirected to an address this app will not follow. ${complaintForNext}` }
      if (hop === MAX_REDIRECTS) return { ok: false, answer: 'The page redirected too many times. Nothing was written.' }
      url = next
      continue
    }
    if (!response.ok) return { ok: false, answer: `The site answered ${response.status}. Nothing was written.` }
    const contentType = (response.headers.get('content-type') || '').trim()
    if (!READABLE.test(contentType)) {
      return { ok: false, answer: `That address returned ${contentType || 'no content type'}, which is not readable text. Only pages, plain text, JSON or CSV are kept as sources.` }
    }
    let raw: string
    try {
      raw = await boundedResponse(response, MAX_RESPONSE_BYTES)
    } catch {
      return { ok: false, answer: `The page is larger than the ${(MAX_RESPONSE_BYTES / 1_000_000).toFixed(1)} MB fetch limit. Nothing was written; export the page yourself if you need it.` }
    }
    const bytes = Buffer.byteLength(raw, 'utf8')
    const sha256 = createHash('sha256').update(raw, 'utf8').digest('hex')
    const extracted = textOf(contentType, raw, MAX_TEXT_CHARS)
    if (!extracted.text) return { ok: false, answer: 'The page contained no readable text. Nothing was written.' }
    const at = clock().toISOString()
    const header = [
      `Fetched by OddBrain on ${at} from ${url.toString()}`,
      `HTTP ${response.status} · ${contentType} · ${bytes.toLocaleString()} bytes · sha256 ${sha256}`,
      `Text below was extracted from the response${/html/i.test(contentType) ? ' with HTML tags removed' : ''}. No summary or interpretation was added.`,
      UNTRUSTED_CONTENT_NOTICE,
      extracted.hiddenRemoved || extracted.invisibleRemoved
        ? `Removed before saving: ${extracted.hiddenRemoved.toLocaleString()} element(s) a reader would not see, ${extracted.invisibleRemoved.toLocaleString()} invisible or text-direction character(s). Neither is evidence of intent; both were dropped rather than followed.`
        : 'No hidden elements or invisible characters were found.',
      extracted.truncated ? `The readable text exceeded ${MAX_TEXT_CHARS.toLocaleString()} characters and was cut at that limit.` : 'The whole readable text is below.',
      'A fetched page is evidence of what this address returned at that moment, not proof that its claims are true.',
    ].join('\n')
    let written: ReturnType<Capture>
    try {
      written = deps.capture({
        type: 'web_page',
        url: url.toString(),
        title: extracted.title || url.hostname,
        content: `${header}\n\n---\n\n${extracted.text}`,
        completeness: extracted.truncated ? 'partial' : 'full',
        provider: 'web',
        captured_at: at,
      })
    } catch (error) {
      return { ok: false, answer: `${error instanceof Error ? error.message : 'The vault refused the capture.'} Nothing was written.` }
    }
    if (written?.skipped) {
      return { ok: false, answer: 'That address is on the vault’s never-check list, so it was not saved. The list is in the vault and wins over this screen.' }
    }
    if (!written?.source) return { ok: false, answer: 'The vault did not report a saved file, so this page is not claimed as a source.' }
    const reply: ResearchReply = {
      ok: true,
      answer: '',
      source: written.source,
      url: url.toString(),
      title: extracted.title || url.hostname,
      bytes,
      sha256,
      truncated: extracted.truncated,
      duplicate: Boolean(written.duplicate),
      hiddenRemoved: extracted.hiddenRemoved,
      invisibleRemoved: extracted.invisibleRemoved,
    }
    const elapsed = clock().getTime() - started.getTime()
    return { ...reply, answer: `${researchSummary(reply)}${Number.isFinite(elapsed) && elapsed >= 0 ? ` Fetched in ${elapsed.toLocaleString()} ms.` : ''}` }
  }
  return { ok: false, answer: 'The page redirected too many times. Nothing was written.' }
}
