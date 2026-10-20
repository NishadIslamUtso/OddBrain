/**
 * Source checking — what the app does with the links a reply already contains.
 *
 * Nothing here searches the web or asks a model anything. A citation exists only
 * because the answer text contained that link; checking it means opening that
 * exact address once, from this machine, and recording what the server returned.
 * A receipt says "this page answered at this time with this size and digest" —
 * never that the model read it, and never that it supports the claim.
 */

export const MAX_SOURCE_LINKS = 8

export type SourceCheckEntry = {
  url: string
  checkedAt: string
  state: 'retrieved' | 'refused' | 'unreachable'
  reason?: string
  status?: number
  finalUrl?: string
  mime?: string
  bytes?: number
  sha256?: string
  title?: string
}

export type SourceCheckRecord = {
  id: string
  transcriptId: string
  chatId: string
  at: string
  /** The opening words of the question this answer belongs to, not the whole chat. */
  questionStart: string
  entries: SourceCheckEntry[]
}

export type SourceCheckReview = {
  token: string
  urls: string[]
  /** Links refused before any request, kept so the owner sees why. */
  refused: Array<{ url: string; reason: string }>
  expiresAt: number
  explanation: string
}

export type SourceCheckAnswer = { denied: true; answer: string } | { denied: false; record: SourceCheckRecord }

export type SourceCheckBridge = {
  preview(input: { transcriptId: string; chatId: string; questionStart: string; urls: string[] }): Promise<SourceCheckReview>
  decide(token: string, decision: 'allow' | 'deny'): Promise<SourceCheckAnswer>
  read(transcriptId: string): Promise<{ records: SourceCheckRecord[]; notice: string }>
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** Why this address must not be requested. Empty when it is an ordinary public https link. */
export function sourceUrlProblem(raw: unknown): string {
  if (typeof raw !== 'string' || !raw || raw.length > 2_048) return 'That is not a link OddBrain can check.'
  let url: URL
  try { url = new URL(raw) } catch { return 'That is not a valid address.' }
  if (url.protocol !== 'https:') return 'Only https links are checked. Nothing was requested.'
  if (url.username || url.password) return 'Links carrying embedded credentials are refused.'
  if (url.port && url.port !== '443') return 'Only the standard https port is checked.'
  let host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (!host || host.length > 253) return 'That host is not valid.'
  if (host === 'localhost' || host === 'localhost.localdomain' || /\.(localhost|local|internal|home\.arpa|lan|arpa)$/.test(host)) return 'Local network names are refused.'
  const v4 = host.match(IPV4)
  if (v4) {
    const [a, b] = v4.slice(1).map(Number)
    if (v4.slice(1).some(part => Number(part) > 255)) return 'That address is not valid.'
    if (a === 0 || a === 10 || a === 127 || a >= 224) return 'Private, loopback and reserved addresses are refused.'
    if (a === 100 && b >= 64 && b <= 127) return 'Private, loopback and reserved addresses are refused.'
    if (a === 169 && b === 254) return 'Private, loopback and reserved addresses are refused.'
    if (a === 172 && b >= 16 && b <= 31) return 'Private, loopback and reserved addresses are refused.'
    if (a === 192 && (b === 168 || b === 0)) return 'Private, loopback and reserved addresses are refused.'
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return 'Private, loopback and reserved addresses are refused.'
    if (a === 203 && b === 0) return 'Private, loopback and reserved addresses are refused.'
    return ''
  }
  if (host.includes(':')) {
    const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) return sourceUrlProblem(`https://${mapped[1]}/`)
    if (host === '::' || host === '::1') return 'Private, loopback and reserved addresses are refused.'
    if (/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(host)) return 'Private, loopback and reserved addresses are refused.'
    return ''
  }
  if (!host.includes('.')) return 'A single-word host cannot be checked.'
  return ''
}

/** The exact list of links that will be requested, with the ones that are refused. */
export function planSourceUrls(raw: unknown): { urls: string[]; refused: Array<{ url: string; reason: string }> } {
  if (!Array.isArray(raw)) throw Error('Sources must be sent as a list of links.')
  if (raw.length > MAX_SOURCE_LINKS) throw Error(`At most ${MAX_SOURCE_LINKS} links are checked at once. Nothing was requested.`)
  const urls: string[] = [], refused: Array<{ url: string; reason: string }> = []
  for (const value of raw) {
    const url = typeof value === 'string' ? value.trim() : ''
    if (!url) continue
    const reason = sourceUrlProblem(url)
    if (reason) refused.push({ url: url.slice(0, 2_048), reason })
    else if (!urls.includes(url)) urls.push(url)
  }
  return { urls, refused }
}

/** A page's own title, bounded and stripped. Never invented when there is none. */
export function pageTitle(body: string): string {
  const match = /<title\b[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(String(body).slice(0, 200_000))
  if (!match) return ''
  return match[1]
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\s\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]+/g, ' ')
    .trim()
    .slice(0, 200)
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
/** A recorded link may be one that was refused (http, private host); it must still be a real http(s) address. */
const isLink = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value || value.length > 2_048) return false
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' } catch { return false }
}

export function validSourceCheckEntry(value: unknown): value is SourceCheckEntry {
  const entry = value as SourceCheckEntry
  if (!entry || typeof entry !== 'object' || !isLink(entry.url) || typeof entry.checkedAt !== 'string' || !entry.checkedAt) return false
  const meta = (entry.status === undefined || isCount(entry.status)) && (entry.status === undefined || (entry.status as number) <= 599) && (entry.finalUrl === undefined || (typeof entry.finalUrl === 'string' && sourceUrlProblem(entry.finalUrl) === ''))
  if (entry.state === 'refused') return meta && typeof entry.reason === 'string' && !!entry.reason && entry.bytes === undefined && entry.sha256 === undefined && entry.title === undefined
  if (entry.state === 'unreachable') return meta && typeof entry.reason === 'string' && !!entry.reason && entry.bytes === undefined && entry.sha256 === undefined && entry.title === undefined
  if (entry.state !== 'retrieved' || !isCount(entry.status) || !(entry.status as number) || (entry.status as number) > 599 || sourceUrlProblem(entry.url) !== '') return false
  return typeof entry.finalUrl === 'string' && sourceUrlProblem(entry.finalUrl) === '' && typeof entry.mime === 'string' && !!entry.mime && isCount(entry.bytes) && (entry.bytes as number) > 0 && typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256) && typeof entry.title === 'string' && entry.title.length <= 200
}

export function validSourceCheckRecord(value: unknown): value is SourceCheckRecord {
  const record = value as SourceCheckRecord
  return !!record && typeof record === 'object' && typeof record.id === 'string' && /^\d{13}-[a-f0-9-]{36}$/.test(record.id) &&
    typeof record.transcriptId === 'string' && /^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(record.transcriptId) &&
    typeof record.chatId === 'string' && (record.chatId === '' || /^[a-zA-Z0-9_.:-]{1,256}$/.test(record.chatId)) &&
    typeof record.at === 'string' && !Number.isNaN(Date.parse(record.at)) &&
    typeof record.questionStart === 'string' && record.questionStart.length <= 300 &&
    Array.isArray(record.entries) && record.entries.length > 0 && record.entries.length <= MAX_SOURCE_LINKS && record.entries.every(validSourceCheckEntry)
}
