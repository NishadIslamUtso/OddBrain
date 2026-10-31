import { sampleEnabled } from '@shared/lib/sampleWorkspace'
import { useEffect, useMemo, useState } from 'react'
import { vaultGet } from '@shared/lib/vault'
import CopyText from '../ui/CopyText'
import { isDemo } from '../platform/bridge'

/**
 * Capture sources — what was read and when.
 *
 * The vault already holds every conversation the app kept and everything the
 * browser extension captured. This is the surface that lets a person *see* it:
 * a timeline of days, the sites that appear most, and every entry behind them.
 *
 * Three rules decide everything here:
 *
 *   1. **The map is the vault.** No entry is invented, nothing is summarised into
 *      a claim the sources do not support, and a visit is labelled as a visit —
 *      the vault writes "visit metadata is not proof of reading" beside each one,
 *      and this surface does not contradict it.
 *   2. **The numbers describe the list.** Filtering happens in the app's own
 *      process, so the counts that come back are the counts of the rows on screen.
 *      A total that disagrees with its own list is worse than no total.
 *   3. **Nothing is retried at the person.** With no vault, or none reachable, the
 *      surface says so in one sentence and stays quiet.
 *
 * Clicking a site filters to it; clicking an entry opens it in place — where it is
 * on disk, when it happened, how much was kept, and whether it is a capture or
 * only a visit. There are no buttons that pretend to do something they cannot.
 */

type Entry = {
  id: string
  kind: 'conversation' | 'page' | 'visit'
  title: string
  url: string
  host: string
  provider: string
  at: string
  path: string
  bytes: number
  completeness: string
}

type MapReply = {
  ok?: boolean
  available?: boolean
  vault?: string
  entries?: Entry[]
  summary?: {
    total: number
    capped: boolean
    kinds: Record<string, number>
    hosts: { host: string; count: number; lastAt: string }[]
    days: { date: string; count: number }[]
  }
  error?: string
}

const RANGES = [
  { id: 7, label: 'Last 7 days' },
  { id: 30, label: 'Last 30 days' },
  { id: 0, label: 'Everything' },
] as const

const KINDS = [
  { id: '', label: 'All' },
  { id: 'conversation', label: 'Conversations' },
  { id: 'page', label: 'Pages' },
  { id: 'visit', label: 'Visits' },
] as const

const KIND_LABEL: Record<string, string> = {
  conversation: 'conversation',
  page: 'page',
  visit: 'visit',
}

function when(at: string): string {
  const parsed = new Date(at)
  if (Number.isNaN(parsed.getTime())) return at
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** What a row is called. A visit with no title is known by its address, shown
 *  without the scheme — the site itself is in the column beside it. */
function label(entry: Entry): string {
  if (entry.title && entry.title !== entry.url) return entry.title
  return entry.url.replace(/^https?:\/\/(www\.)?/i, '') || entry.path
}

function size(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MemoryMap({ open, onClose, embedded = false }: { open: boolean; onClose: () => void; embedded?: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [summary, setSummary] = useState<MapReply['summary'] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'missing' | 'offline'>('loading')
  const [problem, setProblem] = useState('')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const [days, setDays] = useState<number>(30)
  const [host, setHost] = useState('')
  const [opened, setOpened] = useState('')

  // One request per change of the filters, one state per answer. The vault is
  // asked for what is on screen rather than filtered here, so the counts above
  // the list are always the counts of the list.
  useEffect(() => {
    if (!open || (isDemo && !sampleEnabled())) return
    let cancelled = false
    const controller = new AbortController()
    setState(current => (current === 'ready' ? 'ready' : 'loading'))
    const params = new URLSearchParams()
    const needle = [query.trim(), host].filter(Boolean).join(' ')
    if (needle) params.set('q', needle)
    if (kind) params.set('kind', kind)
    if (days) params.set('days', String(days))
    vaultGet(`/sources${params.size ? `?${params}` : ''}`, controller.signal)
      .then((reply: MapReply) => {
        if (cancelled) return
        if (reply?.available === false) {
          setState('missing')
          setProblem(String(reply.error || 'No vault was found.'))
          return
        }
        const list = Array.isArray(reply?.entries) ? reply.entries : []
        setEntries(list)
        setSummary(reply.summary || null)
        setProblem('')
        setState(list.length ? 'ready' : 'empty')
      })
      .catch((failure: Error) => {
        if (cancelled) return
        setState('offline')
        setProblem(failure.message)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, query, kind, days, host])

  useEffect(() => {
    if (!open) return
    if (embedded) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, embedded])

  // Days, from the entries themselves — the summary lists them, and each day's
  // rows are the ones the server sent, nothing regrouped behind its back.
  const byDay = useMemo(() => {
    const groups = new Map<string, Entry[]>()
    for (const entry of entries) {
      const day = new Date(entry.at)
      const key = Number.isNaN(day.getTime()) ? 'Unknown date' : day.toLocaleDateString()
      groups.set(key, [...(groups.get(key) || []), entry])
    }
    return [...groups.entries()]
  }, [entries])

  if (!open) return null

  const topHosts = summary?.hosts?.slice(0, 8) || []
  const busiest = topHosts[0]?.count || 1

  return (
    <div className={embedded ? "ob-embedded-map flex flex-col bg-bg" : "absolute inset-0 z-40 flex flex-col bg-bg"} role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : true} aria-label="Capture sources">
      {!embedded ? <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <h1 className="text-[15px] font-medium">Capture sources</h1>
        {summary ? (
          <span className="text-[12px] text-muted">
            {summary.total} {summary.total === 1 ? 'entry' : 'entries'}
            {summary.capped ? ' (this vault is large: the map shows the newest it could read)' : ''}
          </span>
        ) : null}
        <button
          type="button"
          className="ml-auto rounded-lg px-2 py-1 text-muted hover:bg-white/[0.06] hover:text-ink"
          onClick={onClose}
          aria-label="Close capture sources"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l10 10M15 5 5 15" />
          </svg>
        </button>
      </header> : null}

      {isDemo && !sampleEnabled() ? (
        <div className="p-5">
          <p className="max-w-[560px] text-[12.5px] leading-relaxed text-muted">
            There is no vault behind this window. The map is drawn from what the app kept on your own machine: your
            conversations, and the pages the browser extension captured. Run the desktop app to see it.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* The controls, and the map of sites. */}
          <aside className="flex w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-panel p-3">
            <input
              className="w-full rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px] outline-none focus:border-accent"
              value={query}
              onChange={event => {
                setQuery(event.target.value)
                setHost('')
              }}
              placeholder="Find a title, site or provider"
              aria-label="Search sources"
              spellCheck={false}
            />

            <div className="flex flex-wrap gap-1">
              {KINDS.map(option => (
                <button
                  key={option.id || 'all'}
                  type="button"
                  onClick={() => setKind(option.id)}
                  aria-pressed={kind === option.id}
                  aria-label={`Show: ${option.label}`}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] ${
                    kind === option.id ? 'border-accent/60 bg-accent/15 text-ink' : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {option.label}
                  {summary && option.id ? ` ${summary.kinds[option.id] ?? 0}` : ''}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              {RANGES.map(range => (
                <button
                  key={range.id}
                  type="button"
                  onClick={() => setDays(range.id)}
                  aria-pressed={days === range.id}
                  aria-label={range.label}
                  className={`rounded-lg px-2.5 py-1.5 text-left text-[12px] ${
                    days === range.id ? 'bg-accent/15 text-ink' : 'text-muted hover:bg-white/[0.06] hover:text-ink'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>

            <div className="min-h-0">
              <div className="px-1 pb-1 text-[11px] text-muted">Sites</div>
              {topHosts.length === 0 ? (
                <p className="px-1 text-[11.5px] text-muted">Nothing yet.</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {topHosts.map(item => (
                    <li key={item.host}>
                      <button
                        type="button"
                        onClick={() => {
                          setHost(host === item.host ? '' : item.host)
                          setQuery('')
                        }}
                        aria-pressed={host === item.host}
                        aria-label={`Site: ${item.host}`}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left ${
                          host === item.host ? 'bg-accent/15 text-ink' : 'text-muted hover:bg-white/[0.06] hover:text-ink'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-[12px]">{item.host}</span>
                        {/* A bar, not a chart: its length is the count against the busiest site. */}
                        <span
                          aria-hidden="true"
                          className="h-1.5 shrink-0 rounded-full bg-accent/50"
                          style={{ width: `${Math.max(4, Math.round((item.count / busiest) * 48))}px` }}
                        />
                        <span className="w-[22px] shrink-0 text-right text-[11px]">{item.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {host ? (
                <button
                  type="button"
                  className="mt-1 w-full rounded-lg px-2 py-1 text-left text-[11.5px] text-muted hover:text-ink"
                  onClick={() => setHost('')}
                  aria-label="Clear the site filter"
                >
                  Clear the site filter
                </button>
              ) : null}
            </div>
          </aside>

          {/* The timeline. */}
          <section className="min-w-0 flex-1 overflow-y-auto">
            {state === 'missing' || state === 'offline' ? (
              <div className="p-5">
                <p className="max-w-[560px] text-[12.5px] leading-relaxed text-muted">
                  {state === 'missing'
                    ? `${problem} Point the app at a vault in Settings to see the map.`
                    : 'The vault could not be read just now. Nothing is being changed, and the map will be read again when you open this again.'}
                </p>
              </div>
            ) : state === 'empty' ? (
              <div className="p-5">
                <p className="max-w-[560px] text-[12.5px] leading-relaxed text-muted">
                  {query || host || kind
                    ? 'Nothing matches that. Clear the filters to see everything the vault holds.'
                    : 'Nothing is here yet. Conversations this app keeps appear as you have them, and pages appear once the browser extension is installed. It has the port to post to, but has not been run yet.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5 p-5">
                {byDay.map(([day, rows]) => (
                  <div key={day} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-[12.5px]">{day}</h2>
                      <span className="text-[11px] text-muted">
                        {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    <ul className="flex flex-col">
                      {rows.map(entry => (
                        <li key={entry.id} className="border-t border-line/60">
                          <button
                            type="button"
                            className="flex w-full items-baseline gap-2 px-1 py-1.5 text-left"
                            onClick={() => setOpened(opened === entry.id ? '' : entry.id)}
                            aria-expanded={opened === entry.id}
                            aria-label={`Source: ${entry.title}`}
                          >
                            <span className="w-[74px] shrink-0 text-[11px] text-muted">{when(entry.at)}</span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px]">{label(entry)}</span>
                            <span className="shrink-0 rounded-md border border-line px-1.5 text-[10.5px] text-muted">
                              {KIND_LABEL[entry.kind]}
                            </span>
                            <span className="w-[96px] shrink-0 truncate text-right text-[11px] text-muted">
                              {entry.host || entry.provider}
                            </span>
                          </button>
                          {opened === entry.id ? (
                            <div className="px-1 pb-2 pl-[82px] text-[11.5px] leading-relaxed text-muted">
                              {entry.url ? <div className="break-all">{entry.url}</div> : null}<CopyText text={JSON.stringify(entry, null, 2)} label="Copy source details" />
                              <div className="break-all">{entry.path}</div>
                              <div>
                                {size(entry.bytes) ? `${size(entry.bytes)} · ` : ''}
                                {entry.completeness}
                                {entry.kind === 'visit'
                                  ? ', a visit says the page was opened, not that it was read'
                                  : ''}
                              </div>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
