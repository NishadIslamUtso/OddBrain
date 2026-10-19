/**
 * One search over everything the vault holds.
 *
 * The Vault screen used to have two searches: a filter over file names, and
 * `grep` over contents that stopped at the first matching line of each file and
 * returned whatever the directory walk happened to reach first. Neither could
 * answer the question the app exists for — "where did I talk about this?" — and
 * neither searched the captured conversations, because their text lives in one
 * file per message.
 *
 * So this is a small ranked search, and it is deliberately explainable:
 *
 *   - every word must appear somewhere in the file (AND), like Obsidian's
 *     default search, so a second word narrows instead of scattering;
 *   - the whole phrase, the title and the path are worth more than one
 *     occurrence deep in a paragraph;
 *   - a match in a captured message reports the conversation it belongs to,
 *     the role that said it and the link back to the original;
 *   - work is bounded (files, bytes, result count) and the answer says when a
 *     bound was reached. A search that quietly looked at half the vault and
 *     said nothing is worse than no search.
 *
 * There is no index on disk and no embedding. A vault of this app's size fits
 * in a bounded head-read, and a cache keyed by path, size and a minute keeps a
 * typed query from re-reading the same files on every keystroke. When that stops
 * being true, the honest upgrade is an index with a visible status — not a
 * silent slowdown.
 */
import type { VaultFiles } from './files'

export type SearchKind = 'note' | 'conversation' | 'message'

export type SearchHit = {
  /** Vault-relative path of the file that matched. */
  path: string
  kind: SearchKind
  /** A note's file name, or a conversation's own title. */
  title: string
  /** 1-based line in that file. */
  line: number
  /** Higher is a better match. Stable for the same vault and query. */
  score: number
  /** How many times the words occur in the part of the file that was read. */
  matches: number
  /** The line to show, already trimmed, with the first match marked. */
  snippet: { text: string; start: number; end: number }
  /** Present for a captured conversation or one of its messages. */
  conversation?: { title: string; provider: string; url: string; at: string }
  /** True when only the first part of the file was read. */
  partial?: boolean
}

export type SearchAnswer = {
  ok: true
  query: string
  terms: string[]
  hits: SearchHit[]
  /** What the walk actually did, so "no results" can be told apart from "no look". */
  scanned: { files: number; bytes: number; capped: boolean; partial: number }
}

export type SearchRequest = {
  query: string
  limit?: number
  /** Conversations older than this many days are skipped. Notes are not dated. */
  days?: number
  kind?: 'all' | 'note' | 'conversation'
}

/** What one file is read as, before ranking. */
type Read = { text: string; size: number; partial: boolean }

const HEAD_BYTES = 64 * 1024
const TOTAL_BYTES = 24 * 1024 * 1024
const MAX_FILES = 4000
const CACHE_BYTES = 32 * 1024 * 1024
const CACHE_MS = 60_000
const MAX_HITS = 100
const PER_CONVERSATION = 3
const SNIPPET_CHARS = 180

const conversationPattern = /^02 Sources\/Conversations\/(?:Browser|App)\/([a-f0-9]{64})\/(conversation|messages\/[a-f0-9]{64})\.(md|json)$/

const fold = (value: string): string => value.toLowerCase()

/**
 * Words as a person means them: split on whitespace, strip the punctuation that
 * arrives with a copied phrase, keep one-character words (`a`, `I`, `2`).
 */
export function searchTerms(query: string): string[] {
  return [...new Set(
    fold(query)
      .split(/\s+/)
      .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter(Boolean)
  )]
}

/**
 * The text after a YAML frontmatter block, and how many lines were skipped so a
 * reported line number still points into the real file. Captured messages carry
 * their metadata there; matching a URL in the header is not a content match.
 */
function bodyOf(text: string): { body: string; skipped: number } {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return { body: text, skipped: 0 }
  const close = text.indexOf('\n---', 3)
  if (close === -1) return { body: text, skipped: 0 }
  const after = text.indexOf('\n', close + 4)
  const cut = after === -1 ? text.length : after + 1
  return { body: text.slice(cut), skipped: text.slice(0, cut).split('\n').length - 1 }
}

function countOf(hay: string, needle: string): number {
  let count = 0
  let at = hay.indexOf(needle)
  while (at !== -1 && count < 50) {
    count += 1
    at = hay.indexOf(needle, at + needle.length)
  }
  return count
}

/**
 * The best line to show: the one containing the most of the words, earliest on
 * a tie. Whole lines, trimmed around the first match rather than cut at the
 * left edge, so a hit in a long paragraph still shows the words that matched.
 */
function snippetOf(body: string, terms: string[]): { line: number; text: string; start: number; end: number; matches: number } {
  const lines = body.split('\n')
  let best = { index: -1, found: 0 }
  let matches = 0
  for (let index = 0; index < lines.length; index += 1) {
    const hay = fold(lines[index])
    let found = 0
    for (const term of terms) {
      const count = countOf(hay, term)
      if (count) found += 1
      matches += count
    }
    if (found > best.found) best = { index, found }
  }
  const raw = (best.index >= 0 ? lines[best.index] : lines.find(line => line.trim()) || '').trimEnd()
  const hay = fold(raw)
  let anchor = -1
  for (const term of terms) {
    const at = hay.indexOf(term)
    if (at !== -1 && (anchor === -1 || at < anchor)) anchor = at
  }
  if (anchor === -1) anchor = 0
  const from = Math.max(0, Math.min(anchor - 60, raw.length - SNIPPET_CHARS))
  const prefix = from > 0 ? '…' : ''
  const suffix = from + SNIPPET_CHARS < raw.length ? '…' : ''
  const text = prefix + raw.slice(from, from + SNIPPET_CHARS).trim() + suffix
  const first = terms
    .map(term => ({ term, at: fold(text).indexOf(term) }))
    .filter(hit => hit.at !== -1)
    .sort((a, b) => a.at - b.at)[0]
  return {
    line: best.index + 1,
    text,
    start: first?.at ?? 0,
    end: first ? first.at + first.term.length : 0,
    matches,
  }
}

export type ConversationContext = {
  title: string
  provider: string
  url: string
  at: string
  /** The message's own role, when the file is one message. */
  role?: string
}

const messagePath = /^(02 Sources\/Conversations\/(?:Browser|App)\/[a-f0-9]{64})\/messages\/([a-f0-9]{64})\.md$/

/**
 * The conversation a captured file belongs to, for the preview that opens it.
 *
 * A message shown without the chat it came from is a sentence with no author:
 * the file has the words, `conversation.json` has the provider, title and URL,
 * and the sibling JSON record has the role and the time.
 */
export function conversationContext(files: VaultFiles, path: string): ConversationContext | undefined {
  const message = messagePath.exec(path)
  const base = message ? message[1] : path.endsWith('/conversation.md') && /^02 Sources\/Conversations\/(?:Browser|App)\/[a-f0-9]{64}\/conversation\.md$/.test(path)
    ? path.replace(/\/conversation\.md$/, '')
    : ''
  if (!base) return undefined
  let meta: Record<string, unknown>
  try {
    meta = JSON.parse(files.readHead(`${base}/conversation.json`, 64 * 1024)) as Record<string, unknown>
  } catch {
    return undefined
  }
  const context: ConversationContext = {
    title: String(meta.title || ''),
    provider: String(meta.provider || ''),
    url: String(meta.url || ''),
    at: String(meta.updated_at || meta.observed_at || ''),
  }
  if (message) {
    try {
      const record = JSON.parse(files.readHead(`${base}/messages/${message[2]}.json`, 64 * 1024)) as { message?: { role?: unknown; timestamp?: unknown } }
      if (record.message && typeof record.message.role === 'string') context.role = record.message.role
    } catch {
      // The Markdown preview is still readable; the role is an extra.
    }
  }
  return context
}

export function createVaultSearch(files: VaultFiles, now: () => number = Date.now) {
  const cache = new Map<string, { size: number; at: number; text: string }>()
  let cachedBytes = 0

  function read(path: string): Read | null {
    let size = 0
    try {
      size = files.size(path)
    } catch {
      return null
    }
    const at = now()
    const hit = cache.get(path)
    if (hit && hit.size === size && at - hit.at < CACHE_MS) {
      return { text: hit.text, size, partial: size > hit.text.length }
    }
    let text = ''
    try {
      text = files.readHead(path, HEAD_BYTES)
    } catch {
      return null
    }
    if (hit) {
      cachedBytes -= hit.text.length
      cache.delete(path)
    }
    cache.set(path, { size, at, text })
    cachedBytes += text.length
    // Oldest first; the map preserves insertion order.
    while (cachedBytes > CACHE_BYTES && cache.size > 1) {
      const oldest = cache.keys().next().value as string
      cachedBytes -= cache.get(oldest)!.text.length
      cache.delete(oldest)
    }
    return { text, size, partial: size > text.length }
  }

  function conversationOf(path: string): SearchHit['conversation'] | undefined {
    if (!conversationPattern.test(path)) return undefined
    const base = path.split('/').slice(0, -1).join('/').replace(/\/messages$/, '')
    const meta = read(`${base}/conversation.json`)
    if (!meta) return undefined
    try {
      const parsed = JSON.parse(meta.text) as Record<string, unknown>
      return {
        title: String(parsed.title || ''),
        provider: String(parsed.provider || ''),
        url: String(parsed.url || ''),
        at: String(parsed.updated_at || parsed.observed_at || ''),
      }
    } catch {
      return undefined
    }
  }

  function search(request: SearchRequest): SearchAnswer {
    const query = request.query.trim()
    const terms = searchTerms(query)
    const limit = Math.min(MAX_HITS, Math.max(1, Math.round(request.limit ?? 30)))
    const kind = request.kind || 'all'
    if (!terms.length) return { ok: true, query, terms, hits: [], scanned: { files: 0, bytes: 0, capped: false, partial: 0 } }

    const walk = files.walkFiles('', '.md', MAX_FILES)
    const hits: SearchHit[] = []
    let bytes = 0
    let partial = 0
    let scanned = 0
    let capped = walk.capped
    const perConversation = new Map<string, number>()

    for (const path of walk.files) {
      if (path === '00 System/Templates' || path.startsWith('00 System/Templates/')) continue
      const conversation = conversationOf(path)
      const fileKind: SearchKind = !conversation ? 'note' : path.includes('/messages/') ? 'message' : 'conversation'
      if (kind === 'note' && fileKind !== 'note') continue
      if (kind === 'conversation' && fileKind === 'note') continue
      if (request.days && conversation?.at) {
        const at = Date.parse(conversation.at)
        if (Number.isFinite(at) && now() - at > request.days * 86_400_000) continue
      }
      if (bytes > TOTAL_BYTES) {
        capped = true
        break
      }
      const file = read(path)
      if (!file) continue
      scanned += 1
      bytes += file.text.length
      if (file.partial) partial += 1
      const { body, skipped } = bodyOf(file.text)
      const hay = fold(body)
      if (!terms.every(term => hay.includes(term))) continue

      const title = conversation?.title || path.split('/').pop()!.replace(/\.md$/, '')
      const titleHay = fold(title)
      const pathHay = fold(path)
      let score = 0
      if (hay.includes(fold(query))) score += 8
      for (const term of terms) {
        if (titleHay.includes(term)) score += 6
        if (pathHay.includes(term)) score += 2
        score += Math.min(countOf(hay, term), 10)
      }
      // Words near each other say more than the same words on opposite pages.
      const positions = terms.map(term => hay.indexOf(term)).filter(at => at >= 0)
      if (positions.length > 1 && Math.max(...positions) - Math.min(...positions) < 400) score += 5
      if (conversation?.at && Number.isFinite(Date.parse(conversation.at))) {
        const age = now() - Date.parse(conversation.at)
        if (age < 7 * 86_400_000) score += 3
        else if (age < 30 * 86_400_000) score += 1
      }
      const snip = snippetOf(body, terms)
      const hit: SearchHit = {
        path,
        kind: fileKind,
        title,
        line: snip.line + skipped,
        score,
        matches: snip.matches,
        snippet: { text: snip.text, start: snip.start, end: snip.end },
        ...(conversation ? { conversation } : {}),
        ...(file.partial ? { partial: true } : {}),
      }
      hits.push(hit)
    }

    hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    // One long conversation may fill the answer; it should not fill all of it.
    // Applied after ranking, so the three kept are its best three, not the first
    // three the alphabet happened to reach.
    const kept: SearchHit[] = []
    for (const hit of hits) {
      if (hit.kind !== 'note') {
        const key = hit.path.split('/messages/')[0].replace(/\/conversation\.md$/, '')
        const used = perConversation.get(key) || 0
        if (used >= PER_CONVERSATION) continue
        perConversation.set(key, used + 1)
      }
      kept.push(hit)
      if (kept.length >= limit) break
    }
    return {
      ok: true,
      query,
      terms,
      hits: kept,
      scanned: { files: scanned, bytes, capped, partial },
    }
  }

  return { search }
}

export type VaultSearch = ReturnType<typeof createVaultSearch>
