import { useEffect, useState } from 'react'
import { RefreshCw, X, CalendarDays } from 'lucide-react'
import Dialog from './Dialog.jsx'
import { vault } from '../lib/vault.js'

/**
 * TodayView — P8 from the living TODO.
 * Ported from the brain01 branch (the only branch that actually built it) and
 * re-themed onto this build's CSS variables.
 *
 * Surfaces: Current Snapshot, Open Loops, due follow-ups with
 * answer / skip / snooze / stop, and today's journal draft.
 * Everything is read from the vault — nothing is invented, and an empty
 * section says it is empty instead of fabricating content.
 */
export default function TodayView({ onClose, onAsk }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setData(await vault.today())
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const d = data || {}
  const followups = d.followups || []

  return (
    <Dialog title="Today" onClose={onClose} className="w-[900px] max-w-[calc(100vw-32px)] h-[600px] max-h-[calc(100vh-32px)]">
      <div className="flex items-center gap-2 px-5 h-9 shrink-0 border-b border-[var(--border)]">
        <CalendarDays size={13} className="text-[var(--text-3)]" />
        <span className="text-[12px] text-[var(--text-3)]">
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 gap-[18px] content-start">
        <Card title="Current snapshot">
          {loading ? (
            <Muted>Loading…</Muted>
          ) : d.snapshot ? (
            <Pre>{d.snapshot}</Pre>
          ) : (
            <Muted>No 04 Working Memory/Current Snapshot.md yet.</Muted>
          )}
        </Card>

        <Card title="Open loops">
          {loading ? (
            <Muted>Loading…</Muted>
          ) : d.openLoops ? (
            <Pre>{d.openLoops}</Pre>
          ) : (
            <Muted>No 04 Working Memory/Open Loops.md yet.</Muted>
          )}
        </Card>

        <Card title="Due follow-ups">
          {followups.length === 0 ? (
            <Muted>Nothing due. Silence is not resolution — check again later.</Muted>
          ) : (
            followups.map((f, i) => (
              <div
                key={i}
                className="rounded-lg p-2.5 mb-2 bg-[var(--bg-elev)] border border-[var(--border)]"
              >
                <div className="text-[13px] text-[var(--text-2)]">{f.topic}</div>
                {f.next_check ? (
                  <div className="text-[11.5px] mt-[3px] text-[var(--text-3)]">
                    Next check: {f.next_check}
                  </div>
                ) : null}
                {f.last_update ? (
                  <div className="text-[11.5px] text-[var(--text-3)]">Last: {f.last_update}</div>
                ) : null}
                <div className="flex gap-1.5 mt-2">
                  {['Answer', 'Skip', 'Snooze', 'Stop'].map((a) => (
                    <button
                      key={a}
                      onClick={() =>
                        onAsk?.(a === 'Answer' ? f.topic : `${a} follow-up: ${f.topic}`)
                      }
                      className="rounded-md px-2 py-[3px] text-[11.5px] bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[var(--text-2)] hover:text-[var(--text)]"
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </Card>

        <Card title="Journal draft">
          {d.journal ? (
            <Pre>{d.journal}</Pre>
          ) : (
            <Muted>
              No journal entry for today yet — it would be written to{' '}
              <code className="font-mono">{d.journalPath || '08 Journal/&lt;year&gt;/&lt;date&gt;.md'}</code>
            </Muted>
          )}
        </Card>
      </div>

      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
        <div className="text-[12px] text-[var(--text-3)] truncate">
          {data?.vault ? `Vault: ${data.vault}` : 'Vault API offline (127.0.0.1:8765)'}
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-active)]"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
    </Dialog>
  )
}

const Card = ({ title, children }) => (
  <div className="rounded-[10px] p-3.5 border border-[var(--border)] bg-[var(--bg-elev)]">
    <div className="text-[13px] mb-2 text-[var(--text)]">{title}</div>
    {children}
  </div>
)
const Muted = ({ children }) => (
  <div className="text-[12px] text-[var(--text-3)] leading-5">{children}</div>
)
const Pre = ({ children }) => (
  <pre className="whitespace-pre-wrap text-[12px] leading-[18px] text-[var(--text-2)] font-sans">
    {children}
  </pre>
)
