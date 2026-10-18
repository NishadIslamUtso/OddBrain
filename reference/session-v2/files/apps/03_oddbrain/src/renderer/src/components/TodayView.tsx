import { useEffect, useState } from 'react'
import { useLook } from '../ui/LookContext'
import { ArrowRight, Clock, FileText, MessageSquare, Shapes, Sun } from 'lucide-react'
import { vaultGet } from '@shared/lib/vault'
import { isToday, todaysArtifacts, todaysChats, worthDoing, type Suggestion, type TodayArtifact, type TodayChat } from '@shared/lib/today'
import { isDemo, bridge } from '@/platform/bridge'

/**
 * Today (07) — the landing screen.
 *
 * One honest page: what happened today (counted from real records), what is
 * worth doing next (each suggestion comes from one of those records — never
 * an invented task), and today's conversations, creations and reading. It is
 * the first screen the app opens onto, so it is also the app's handshake: a
 * page that invents activity would be the one lie this app cannot survive.
 */

type MapEntry = { at?: string; title?: string; kind?: string; provider?: string; host?: string }
type MapReply = { available?: boolean; error?: string; entries?: MapEntry[] }

const kindBadge = (kind: string | undefined): string => {
  if (kind === 'conversation') return 'conversation'
  if (kind === 'visit') return 'visit'
  return 'page'
}

const timeOfDay = (value: string | number | undefined): string => {
  const date = new Date(value ?? '')
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function Stat({ value, label, Icon }: { value: string | number; label: string; Icon: typeof Clock }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-muted">
        <Icon size={14} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold leading-none text-ink">{value}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">{label}</span>
      </span>
    </div>
  )
}

function SuggestionRow({ suggestion, onOpenChat, onView }: {
  suggestion: Suggestion
  onOpenChat: (chatId: string) => void
  onView: (view: 'chat' | 'artifacts') => void
}) {
  const go = (): void => {
    if (suggestion.action === 'open-chat' && suggestion.chatId) onOpenChat(suggestion.chatId)
    else if (suggestion.action === 'artifacts') onView('artifacts')
    else onView('chat')
  }
  return (
    <button
      type="button"
      onClick={go}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink">{suggestion.label}</span>
        <span className="mt-0.5 block truncate text-[12px] text-muted">{suggestion.detail}</span>
      </span>
      <ArrowRight size={14} className="shrink-0 text-muted" aria-hidden />
    </button>
  )
}

export default function TodayView({
  chats,
  artifacts,
  artifactsLoading,
  onOpenChat,
  onNew,
  onView,
  onOpenMaps,
}: {
  chats: TodayChat[]
  artifacts: TodayArtifact[]
  artifactsLoading: boolean
  onOpenChat: (chatId: string) => void
  onNew: () => void
  onView: (view: 'chat' | 'artifacts') => void
  onOpenMaps?: () => void
}) {
  const look = useLook()
  const [entries, setEntries] = useState<MapEntry[]>([])
  const [mapsState, setMapsState] = useState<'loading' | 'ready' | 'empty' | 'missing'>('loading')
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [snapshotState, setSnapshotState] = useState<'loading' | 'ready' | 'empty' | 'missing'>('loading')

  // The reading list is the vault's own record of what was browsed and asked
  // today — the same source Browsing Maps shows, asked for one day of it.
  useEffect(() => {
    if (isDemo) {
      setMapsState('missing')
      return
    }
    let cancelled = false
    const controller = new AbortController()
    vaultGet('/sources?days=1', controller.signal)
      .then((reply: MapReply) => {
        if (cancelled) return
        if (reply?.available === false) {
          setMapsState('missing')
          return
        }
        const list = Array.isArray(reply?.entries) ? reply.entries : []
        setEntries(list)
        setMapsState(list.length ? 'ready' : 'empty')
      })
      .catch(() => {
        if (!cancelled) setMapsState('missing')
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  // Current Snapshot is 04 Working Memory/Current Snapshot.md in the vault -
  // the engine's own short-term memory, read here through the /today door.
  useEffect(() => {
    if (isDemo) {
      setSnapshotState('missing')
      return
    }
    let cancelled = false
    const controller = new AbortController()
    vaultGet('/today', controller.signal)
      .then((reply: { snapshot?: string; available?: boolean }) => {
        if (cancelled) return
        if (reply?.available === false || typeof reply?.snapshot !== 'string') {
          setSnapshotState('missing')
          return
        }
        // The card is already titled, so the document's own H1 is elided.
        const body = reply.snapshot.trim().replace(/^#\s+.*\n+/, '')
        setSnapshot(body)
        setSnapshotState(body ? 'ready' : 'empty')
      })
      .catch(() => {
        if (!cancelled) setSnapshotState('missing')
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  const now = new Date()
  const conversations = todaysChats(chats, now)
  const made = todaysArtifacts(artifacts, now)
  const suggestions = worthDoing(chats, artifacts, now)
  const reads = entries.filter((entry) => isToday(entry.at, now))
  const day = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  // A brand-new day reads one quiet line, not five separate "nothing yet"s:
  // the sections stay for a PARTIAL day, where each has something honest to say.
  const mapsQuiet = mapsState === 'empty' || (mapsState === 'ready' && reads.length === 0)
  const allQuiet = !conversations.length && !made.length && mapsQuiet && snapshotState === 'empty'

  if (look.layout === 'bento') return <div className="ob-bento-today" aria-label="Today">
    <header><h1>Today</h1><span>{day}</span><button type="button" className="ob-small-button" onClick={onNew}>New chat</button></header>
    <div className="ob-bento-grid"><section>
      <h2>Continue</h2>{chats[0] ? <button type="button" className="ob-continue" onClick={() => onOpenChat(chats[0].id)}><strong>{chats[0].title}</strong><span>Open conversation<ArrowRight size={14} /></span></button> : <p className="ob-empty-line">No conversations yet.</p>}
      {suggestions.length ? <><h2>Worth doing</h2>{suggestions.map((suggestion, index) => <SuggestionRow key={index} suggestion={suggestion} onOpenChat={onOpenChat} onView={onView} />)}</> : null}
      <h2>Today's conversations</h2>{conversations.length ? conversations.map(chat => <button type="button" className="ob-dashboard-record" key={chat.id} onClick={() => onOpenChat(chat.id)}><MessageSquare size={14} /><span>{chat.title}</span><ArrowRight size={14} /></button>) : <p className="ob-empty-line">No conversations today.</p>}
    </section><aside>
      <h2>Current snapshot</h2>{snapshot ? <p className="ob-snapshot-text">{snapshot}</p> : <p className="ob-empty-line">{snapshotState === 'missing' ? 'No vault snapshot available.' : 'No snapshot yet.'}</p>}
      <h2>Recently made</h2>{made.length ? made.map(item => <button type="button" className="ob-dashboard-record" key={item.id} onClick={() => onView('artifacts')}><Shapes size={14} /><span>{item.title}</span><ArrowRight size={14} /></button>) : <p className="ob-empty-line">No artifacts today.</p>}
      <h2>Saved sources</h2>{reads.length ? reads.map((entry, index) => <p className="ob-dashboard-source" key={index}><span>{entry.title || entry.host || 'Untitled source'}</span><small>{kindBadge(entry.kind)} · {timeOfDay(entry.at)}</small></p>) : <p className="ob-empty-line">{mapsState === 'missing' ? 'No vault sources available.' : 'No sources today.'}</p>}
      {onOpenMaps ? <button type="button" className="ob-text-button" onClick={onOpenMaps}>Browsing maps<ArrowRight size={14} /></button> : null}
    </aside></div>
  </div>

  return (
    <div className="flex-1 overflow-y-auto" aria-label="Today">
      <div className="mx-auto w-full max-w-[var(--chat-width)] px-4 py-8">
        <header className="flex items-center gap-2.5">
          <Sun size={18} className="text-muted" aria-hidden />
          <h1 className="text-[20px] font-semibold text-ink">Today</h1>
          <span className="text-[12.5px] text-muted">{day}</span>
          <button
            type="button"
            onClick={onNew}
            className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] transition-colors hover:bg-accent/90"
          >
            New chat
          </button>
        </header>

        {/* Quick actions: only doors the app really has, wired to real handlers.
            New chat lives once, in the header above. */}
        <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Quick actions">
          <button
            type="button"
            onClick={() => onView('artifacts')}
            className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-white/[0.04]"
          >
            Artifacts
          </button>
          <button
            type="button"
            onClick={() => { void bridge.app?.openVaultFolder?.() }}
            className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-white/[0.04]"
          >
            Open vault folder
          </button>
        </div>

        {/* The day, counted from real records only. */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Stat value={conversations.length} label="conversations" Icon={MessageSquare} />
          <Stat value={artifactsLoading ? '…' : made.length} label="artifacts made" Icon={Shapes} />
          <Stat value={mapsState === 'ready' ? reads.length : '—'} label="pages & asks read" Icon={Clock} />
        </div>

        <section className="mt-6" aria-label="Worth doing next">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Worth doing next</h2>
          <div className="mt-2 flex flex-col gap-1.5">
            {suggestions.map((suggestion) => (
              <SuggestionRow key={suggestion.label} suggestion={suggestion} onOpenChat={onOpenChat} onView={onView} />
            ))}
          </div>
        </section>

        {allQuiet ? (
          <section className="mt-6" aria-label="So far today">
            <div className="rounded-xl border border-line bg-card px-4 py-6 text-center">
              <p className="text-[13px] text-ink">A quiet day so far.</p>
              <p className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-muted">
                Today&rsquo;s conversations, work and reading will fill this page in as they happen.
              </p>
            </div>
          </section>
        ) : (
          <>
        <section className="mt-6" aria-label="Current snapshot">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Current snapshot</h2>
          {snapshotState === 'ready' ? (
            <div className="mt-2 rounded-xl border border-line bg-card px-3.5 py-3">
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{snapshot}</p>
            </div>
          ) : snapshotState === 'empty' ? (
            <p className="mt-2 text-[12.5px] text-muted">
              The snapshot is empty - the engine writes it in 04 Working Memory as it works.
            </p>
          ) : snapshotState === 'loading' ? (
            <p className="mt-2 text-[12.5px] text-muted">Reading the vault…</p>
          ) : (
            <p className="mt-2 text-[12.5px] text-muted">No vault connected - pick a folder in Settings.</p>
          )}
        </section>

        <section className="mt-6" aria-label="Today's conversations">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Conversations today</h2>
          {conversations.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {conversations.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => onOpenChat(chat.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <MessageSquare size={13} className="shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                      {chat.title || 'Untitled conversation'}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">{timeOfDay(chat.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-muted">No conversations yet today.</p>
          )}
        </section>

        <section className="mt-6" aria-label="Made today">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Made today</h2>
          {made.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {made.map((artifact) => (
                <li key={artifact.id}>
                  <button
                    type="button"
                    onClick={() => onView('artifacts')}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <FileText size={13} className="shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                      {artifact.title || 'Untitled artifact'}
                    </span>
                    <span className="shrink-0 rounded-md border border-line px-1.5 text-[10.5px] text-muted">
                      {artifact.type}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">{timeOfDay(artifact.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-muted">Nothing made yet today.</p>
          )}
        </section>

        <section className="mt-6" aria-label="Read today">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Read today</h2>
          {mapsState === 'loading' ? (
            <p className="mt-2 text-[12.5px] text-muted">Asking the vault…</p>
          ) : mapsState !== 'ready' ? (
            <p className="mt-2 text-[12.5px] text-muted">
              {mapsState === 'missing'
                ? 'The vault has no reading record here (the desktop app with a vault keeps it).'
                : 'Nothing was read or asked today.'}
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {reads.map((entry, index) => (
                <li
                  key={`${entry.at}-${index}`}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {entry.title || 'Untitled'}
                  </span>
                  <span className="shrink-0 rounded-md border border-line px-1.5 text-[10.5px] text-muted">
                    {kindBadge(entry.kind)}
                  </span>
                  <span className="w-24 shrink-0 truncate text-right text-[11px] text-muted">
                    {entry.provider || entry.host || ''}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{timeOfDay(entry.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
          </>
        )}
      </div>
    </div>
  )
}
