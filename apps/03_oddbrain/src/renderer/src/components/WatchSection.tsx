import { Eye, EyeOff } from 'lucide-react'
import { startWatching, stopWatching, useWatch } from '@/state/watch'
import { WATCH_NOTE } from '@shared/lib/watchMode'
import { getEngineApi } from '@/platform/bridge'
import { useState } from 'react'

/**
 * Watch a folder: the order runs itself when the files change. The runs are
 * ordinary turns in the chat — same cards, same Stop — and the watcher's
 * limits are printed right here, not discovered by surprise.
 */
export default function WatchSection() {
  const watch = useWatch()
  const [order, setOrder] = useState('')
  const [starting, setStarting] = useState(false)

  const start = async (): Promise<void> => {
    setStarting(true)
    // The folder is the engine's own working folder — the one it already
    // has the right to read. No second picker, no new permissions.
    const read = await getEngineApi().read()
    const folder = read.engine.workspace ?? ''
    const ok = await startWatching(folder, order)
    setStarting(false)
    if (ok) setOrder('')
  }

  return (
    <section aria-label="Watch a folder" className="rounded-xl border border-line bg-card p-2">
      <header className="flex items-center gap-2">
        {watch.active ? <Eye size={13} className="text-ok" aria-hidden /> : <EyeOff size={13} className="text-muted" aria-hidden />}
        <h2 className="text-[12.5px] font-medium text-ink">Watch a folder</h2>
        {watch.active ? (
          <span className="text-[11.5px] text-muted">· watching {watch.folder.split(/[\\/]/).filter(Boolean).at(-1)} · {watch.runs} {watch.runs === 1 ? 'run' : 'runs'}{watch.lastFired ? ` · last: ${watch.lastFired.slice(0, 40)}` : ''}</span>
        ) : null}
        {watch.active ? (
          <button
            type="button"
            onClick={() => void stopWatching()}
            className="ml-auto h-7 rounded-lg border border-line px-2.5 text-[11.5px] text-muted hover:text-ink"
          >
            Stop watching
          </button>
        ) : null}
      </header>

      {watch.active ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          The saved order runs in the chat when this folder's files change: “{watch.order}”.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{WATCH_NOTE}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              value={order}
              onChange={event => setOrder(event.target.value)}
              placeholder="the order to run on a change — summarise what changed in one line"
              aria-label="Watch order"
              className="min-w-[240px] flex-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={() => void start()}
              disabled={starting || !order.trim()}
              className={`h-8 rounded-lg px-3 text-[12px] font-medium ${order.trim() && !starting ? 'bg-accent text-[var(--accent-ink)] hover:bg-accent/90' : 'bg-white/[0.06] text-muted'}`}
            >
              {starting ? 'Starting…' : 'Watch the working folder'}
            </button>
          </div>
        </>
      )}
      {watch.error ? <p className="mt-2 text-[11.5px] text-warn">{watch.error}</p> : null}
    </section>
  )
}
