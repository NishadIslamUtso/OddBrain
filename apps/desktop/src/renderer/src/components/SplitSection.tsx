import { useEffect, useState } from 'react'
import { ListOrdered, X } from 'lucide-react'
import { SPLIT_ORDER } from '@shared/lib/split'
import { breakDown, clearSplitError, dismissSplit, resumeFrom, runSteps, stageSplit, useSplit } from '@/state/split'

/**
 * Split: the flagship sequencer. The engine writes the steps; the app runs
 * them one by one as normal work orders — the same cards, the same throttle,
 * nothing hidden. The checklist below IS the record of the run.
 */
export default function SplitSection() {
  const split = useSplit()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const hear = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail || ''
      if (!detail.trim()) return
      stageSplit(detail)
      setOpen(true)
    }
    window.addEventListener('app:split', hear)
    return () => window.removeEventListener('app:split', hear)
  }, [])

  if (!open || split.phase === 'idle') return null
  const busy = split.phase === 'splitting' || split.phase === 'running'

  const close = (): void => {
    if (busy) return
    dismissSplit()
    setOpen(false)
  }

  return (
    <section aria-label="Split work order" className="mx-auto mb-3 w-full max-w-[var(--chat-width)] rounded-xl border border-line bg-card px-4 py-3">
      <header className="flex items-center gap-2">
        <ListOrdered size={13} className="text-muted" aria-hidden />
        <h2 className="text-[12px] font-medium text-muted">Split work order · the engine plans, the app runs step by step</h2>
        {!busy ? (
          <button type="button" onClick={close} aria-label="Close" className="ml-auto text-muted hover:text-ink">
            <X size={13} />
          </button>
        ) : null}
      </header>

      <p className="mt-1.5 line-clamp-3 text-[12.5px] text-muted">▸ {split.order}</p>
      {split.error ? (
        <p className="mt-1.5 text-[11.5px] text-warn">
          {split.error}
          <button type="button" onClick={clearSplitError} aria-label="Dismiss" className="ml-2 text-muted hover:text-ink">×</button>
        </p>
      ) : null}

      {split.phase === 'draft' || split.phase === 'splitting' ? (
        <div className="mt-2 rounded-lg border border-line bg-bg p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">What will be sent</p>
          <pre className="mt-1.5 max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink">
            {SPLIT_ORDER}
            {split.order}
          </pre>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void breakDown()}
              disabled={split.phase === 'splitting'}
              className={`h-7 rounded-lg px-3 text-[12px] font-medium ${split.phase === 'splitting' ? 'bg-white/[0.06] text-muted' : 'bg-accent text-[var(--accent-ink)] hover:bg-accent/90'}`}
            >
              {split.phase === 'splitting' ? 'Breaking it down…' : 'Break it down'}
            </button>
          </div>
        </div>
      ) : null}

      {split.steps.length ? (
        <ol className="mt-2 space-y-1.5" aria-label="The steps">
          {split.steps.map((step, index) => (
            <li key={index} className={`rounded-lg border px-2.5 py-1.5 ${step.state === 'done' ? 'border-ok' : step.state === 'failed' ? 'border-warn' : 'border-line'} bg-bg`}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[12.5px] text-ink">
                  <span className="mr-1.5" aria-hidden>{step.state === 'done' ? '✓' : step.state === 'failed' ? '✗' : step.state === 'running' ? '…' : '·'}</span>
                  {step.text}
                </p>
                {step.state === 'failed' && split.phase === 'finished' ? (
                  <button
                    type="button"
                    onClick={() => void resumeFrom(index)}
                    className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-[11px] text-ink hover:border-ok"
                  >
                    Retry step {index + 1}
                  </button>
                ) : null}
              </div>
              {step.note ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{step.note}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {split.phase === 'ready' ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          <p className="flex-1 text-[11px] leading-snug text-muted">
            The steps run in order, in this session, as normal turns: the engine still asks before it acts, and Stop works on the running step.
          </p>
          <button
            type="button"
            onClick={() => void runSteps()}
            className="h-7 rounded-lg bg-accent px-3 text-[12px] font-medium text-[var(--accent-ink)] hover:bg-accent/90"
          >
            Run the steps
          </button>
        </div>
      ) : null}

      {split.phase === 'running' ? (
        <p className="mt-2 text-[11.5px] text-muted" aria-live="polite">Running the steps in order… Stop is on the engine card.</p>
      ) : null}

      {split.phase === 'finished' ? (
        <p className="mt-2 text-[11.5px] text-ink">{split.summary}</p>
      ) : null}
    </section>
  )
}
