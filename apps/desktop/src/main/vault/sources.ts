/**
 * The map of what was read and when.
 *
 * The vault is the record, and this reads it: every conversation the app kept,
 * every page the browser extension captured, and every visit it logged. Nothing
 * here writes, creates or guesses — a map that invented a visit would be worse
 * than an empty map.
 *
 * Three shapes of evidence, and they are read for exactly what each one says:
 *
 *   `02 Sources/Conversations/<provider>/<year>/<id>-<hash>.md`  — frontmatter
 *   `02 Sources/Web Pages/<year>/web-<hash>.md`                  — frontmatter
 *   `02 Sources/Browser Activity/<year>/<month>.jsonl`           — one JSON object
 *                                                                  per line
 *
 * Two rules worth knowing, both of them the vault's own rules rather than new
 * ones here:
 *
 * - A jsonl line with a `source_id` is the *record of a page capture that already
 *   has a file*. The page file is the entry; counting both would double every
 *   capture, so those lines are skipped.
 * - A visit is not proof of reading. That sentence is written into the vault by
 *   the capture itself and it is repeated here, because a map of "what you read"
 *   must not claim more than the evidence it drew.
 *
 * Reading is bounded: files are walked up to a limit and only the head of each is
 * read, so an enormous vault produces a capped map with said-so rather than a
 * spinner. The monthly jsonl files are read from the start and only complete
 * lines are used.
 */
import { dhakaParts, splitDocument } from './text'
import type { VaultFiles } from './files'

export type SourceKind = 'conversation' | 'page' | 'visit'

export type SourceEntry = {
  /** Stable per entry: the vault path, or the line's own identity for a visit. */
  id: string
  kind: SourceKind
  title: string
  url: string
  /** The site, lower-cased and without `www.`, or '' for a capture with no URL. */
  host: string
  provider: string
  /** When it happened: `captured_at` for a capture, `visited_at` for a visit. */
  at: string
  /** Vault-relative path of the file (or the jsonl file for a visit). */
  path: string
  /** Bytes of the source file, when it has one of its own. */
  bytes: number
  /** 'full' | 'partial' | 'visit-only' | 'content-captured' — as captured, never improved. */
  completeness: string
}

export type SourceSummary = {
  total: number
  /** True when the walk stopped at its limit: the map is real but incomplete. */
  capped: boolean
  kinds: Record<SourceKind, number>
  hosts: { host: string; count: number; lastAt: string }[]
  days: { date: string; count: number }[]
}

export type SourceMap = { entries: SourceEntry[]; summary: SourceSummary }

/** Enough for a map of a real vault; a cap the person can see rather than a hang. */
const FILE_LIMIT = 4000
const ENTRY_LIMIT = 800
/** The monthly activity files are appended to forever; read the start of each. */
const ACTIVITY_HEAD_BYTES = 256 * 1024

export function hostOf(url: string): string {
  const value = String(url || '').trim()
  if (!value) return ''
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

/** The day a timestamp belongs to in Dhaka, which is the vault's own calendar. */
export function dhakaDay(at: string): string {
  const parsed = new Date(at)
  if (Number.isNaN(parsed.getTime())) return ''
  return dhakaParts(parsed).date
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** One Markdown capture: frontmatter for what it is, the heading for its name. */
function entryFromDocument(
  head: string,
  path: string,
  kind: SourceKind,
  bytes: number
): SourceEntry | null {
  const { metadata, body } = splitDocument(head)
  const title = text(metadata.title) || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.split('/').pop() || path
  const at = text(metadata.captured_at)
  if (!at) return null
  const url = text(metadata.url)
  return {
    id: path,
    kind,
    title: title.slice(0, 300),
    url,
    host: hostOf(url),
    provider: text(metadata.provider),
    at,
    path,
    bytes,
    completeness: text(metadata.completeness) || 'full',
  }
}

export function createSourceMap(store: VaultFiles) {

  function entries(): { entries: SourceEntry[]; capped: boolean } {
    const found: SourceEntry[] = []
    let capped = false

    const conversations = store.walkFiles('02 Sources/Conversations', '.md', FILE_LIMIT)
    capped = capped || conversations.capped
    for (const relative of conversations.files) {
      const entry = entryFromDocument(
        store.readHead(relative),
        relative,
        'conversation',
        store.size(relative)
      )
      if (entry) found.push(entry)
    }

    const pages = store.walkFiles('02 Sources/Web Pages', '.md', FILE_LIMIT)
    capped = capped || pages.capped
    for (const relative of pages.files) {
      const entry = entryFromDocument(store.readHead(relative), relative, 'page', store.size(relative))
      if (entry) found.push(entry)
    }

    // Visits, newest month first. A month file is appended to forever, so only its
    // head is read and only complete lines are used: half a JSON object at the
    // cut is not a visit.
    const activity = store.walkFiles('02 Sources/Browser Activity', '.jsonl', 240)
    capped = capped || activity.capped
    for (const relative of activity.files.sort().reverse()) {
      const head = store.readHead(relative, ACTIVITY_HEAD_BYTES)
      if (!head) continue
      const lines = head.split('\n')
      if (!head.endsWith('\n')) lines.pop()
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let row: Record<string, unknown>
        try {
          row = JSON.parse(trimmed) as Record<string, unknown>
        } catch {
          continue
        }
        // A line that points at a captured page file is that file's record, not a
        // second thing that happened.
        if (text(row.source_id)) continue
        const at = text(row.visited_at) || text(row.captured_at)
        if (!at) continue
        const url = text(row.url)
        found.push({
          id: `${relative}#${at}#${url}`,
          kind: 'visit',
          title: text(row.title).slice(0, 300) || url,
          url,
          host: hostOf(url),
          provider: 'web',
          at,
          path: relative,
          bytes: 0,
          completeness: text(row.capture_status) || 'visit-only',
        })
      }
    }

    found.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.title.localeCompare(b.title)))
    if (found.length > ENTRY_LIMIT) {
      capped = true
      return { entries: found.slice(0, ENTRY_LIMIT), capped }
    }
    return { entries: found, capped }
  }

  function summary(all: SourceEntry[], capped: boolean): SourceSummary {
    const kinds: Record<SourceKind, number> = { conversation: 0, page: 0, visit: 0 }
    const hosts = new Map<string, { count: number; lastAt: string }>()
    const days = new Map<string, number>()
    for (const entry of all) {
      kinds[entry.kind] += 1
      if (entry.host) {
        const current = hosts.get(entry.host)
        hosts.set(entry.host, {
          count: (current?.count || 0) + 1,
          lastAt: current && current.lastAt > entry.at ? current.lastAt : entry.at,
        })
      }
      const day = dhakaDay(entry.at)
      if (day) days.set(day, (days.get(day) || 0) + 1)
    }
    return {
      total: all.length,
      capped,
      kinds,
      hosts: [...hosts.entries()]
        .map(([host, value]) => ({ host, ...value }))
        .sort((a, b) => b.count - a.count || (a.host < b.host ? -1 : 1))
        .slice(0, 60),
      days: [...days.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    }
  }

  /**
   * The map, filtered by who is asking. Filtering happens here rather than in the
   * interface so the summary always describes exactly the entries beside it — a
   * count that disagrees with its own list is worse than no count.
   */
  function read(options: { q?: string; kind?: string; days?: number } = {}): SourceMap {
    const { entries: all, capped } = entries()
    const needle = String(options.q || '').trim().toLowerCase()
    const kind = ['conversation', 'page', 'visit'].includes(String(options.kind))
      ? (String(options.kind) as SourceKind)
      : ''
    const days = Number(options.days) > 0 ? Number(options.days) : 0
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : ''

    const kept = all.filter(entry => {
      if (kind && entry.kind !== kind) return false
      if (since && entry.at < since) return false
      if (!needle) return true
      return (
        entry.title.toLowerCase().includes(needle) ||
        entry.host.includes(needle) ||
        entry.url.toLowerCase().includes(needle) ||
        entry.provider.toLowerCase().includes(needle)
      )
    })
    return { entries: kept, summary: summary(kept, capped) }
  }

  return { read }
}

export type SourceMapReader = ReturnType<typeof createSourceMap>
