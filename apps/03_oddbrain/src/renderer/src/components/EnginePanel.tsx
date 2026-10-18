import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import SpeakButton from '../ui/SpeakButton'
import { useLook } from '../ui/LookContext'
import { Copy, Eye, Handshake, ListOrdered, Minimize2, Pencil, Wrench, FilePen, Terminal, Search, CircleCheck, TriangleAlert, Square, X } from 'lucide-react'
import { buildHandoff, handoffFileName } from '@shared/lib/handoff'
import { PHASE_LABEL, phaseFromTurn, WAITING_LOADER, type MotionRole } from '@shared/lib/motionKit'
import { Mascot } from '../motion/Mascot'
import { BRIEF_ORDER } from '@shared/lib/compact'
import { modelLabel } from '@shared/lib/engine'
import { THINKING_OPEN_EVENT, setThinkingOpen, thinkingOpenNow } from '@shared/lib/thinkingOpen'
import { bridge } from '@/platform/bridge'
import { useEngine, type EngineItem } from '@/state/engine'
import { cancelBrief, clearCompactNotice, finishCompact, useCompact, writeBrief } from '@/state/compact'
import { formatTotals, turnCopyText } from '@shared/lib/turnCopy'
import { clearReviewError, runReview, useReview } from '@/state/review'

/**
 * The engine's work order, drawn where the conversation can see it.
 *
 * The engine is not a chat partner: it is a worker. Its turn reads as a card —
 * what was asked, what it touched, what it needs approved, how it ended — in
 * the same visual language as the rest of the app (the same tokens, the same
 * rounded cards, nothing new invented).
 */
type Kept = { copy: string; original: string; at: string; existed?: boolean }

export default function EnginePanel() {
  const engine = useEngine()
  const turn = engine.turn
  const [handed, setHanded] = useState('')
  // What the app kept before allowed writes this session, and what a restore said.
  const [kept, setKept] = useState<Kept[]>([])
  const [restored, setRestored] = useState('')
  const finished = turn?.state === 'done' || turn?.state === 'error'
  useEffect(() => {
    if (!finished) return
    void bridge.engine.checkpoints.list().then((answer) => {
      if (answer.ok) setKept(answer.checkpoints.slice(0, 3))
    })
  }, [finished])
  const phase: MotionRole = turn ? phaseFromTurn(turn) : 'resting'
  const [compacting, setCompacting] = useState(false)
  const compact = useCompact()
  const review = useReview()
  const [copied, setCopied] = useState(false)
  // The strip above the composer is collapsible, as the owner asked. It
  // always unfolds itself while a permission question waits — Allow/Deny
  // must never hide behind a fold. Remembered, so it stays as he left it.
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem('ai-assistant.engine-panel-open') !== '0'
    } catch {
      return true
    }
  })
  const setPanel = (open: boolean): void => {
    setPanelOpen(open)
    try {
      localStorage.setItem('ai-assistant.engine-panel-open', open ? '1' : '0')
    } catch {
      /* storage refused — the fold lives only for this visit */
    }
  }
  // No live turn: the card waits, but the record of earlier sessions still
  // shows — a fresh window should know what happened here before it opened.
  if (!turn) {
    return (
      <>
        {/* Live work seen from ANOTHER window: this window owns no turn, so it
            shows the machine's activity read-only — cards stay with the window
            that can answer them. */}
        {engine.ambient.busy ? (
          <section
            aria-label="Engine working in another window"
            className="mx-auto mb-3 flex w-full max-w-[var(--chat-width)] items-center gap-2 rounded-xl border border-line bg-card px-4 py-2"
          >
            <p className="text-[12px] text-muted">
              The engine is working in another window — <span className="text-ink">{engine.ambient.note || 'working'}</span>.
              Its cards are answered there; this window watches.
            </p>
          </section>
        ) : null}
        {engine.journal.length ? (
          <details aria-label="Earlier sessions" className="mx-auto mb-3 w-full max-w-[var(--chat-width)] rounded-xl border border-line bg-card px-4 py-2.5">
            <summary className="cursor-pointer text-[12px] font-medium text-muted">
              Earlier sessions on this machine ({engine.journal.length} {engine.journal.length === 1 ? 'turn' : 'turns'})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {engine.journal.slice(0, 10).map((entry, index) => (
                <li key={index} className="rounded-lg border border-line bg-bg px-2.5 py-1.5">
                  <p className="truncate text-[11.5px] text-ink">▸ {entry.prompt}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{entry.answer || '(nothing said)'}</p>
                  <p className="mt-0.5 text-[10.5px] text-muted">{entry.at.slice(0, 16).replace('T', ' ')}{entry.usage ? ` · ${entry.usage}` : ''}</p>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
              A record, not a transcript: the engine's own resume already carries the context forward.
            </p>
          </details>
        ) : null}
      </>
    )
  }

  // The handoff: the finished turn written into the vault as one document a
  // later session can continue from — and copied, so it can go anywhere.
  const handOff = (): void => {
    if (turn.state === 'running') return
    const markdown = buildHandoff({
      prompt: turn.prompt,
      items: turn.items,
      state: turn.state,
      sessionId: turn.sessionId,
      usage: turn.usage,
      engine: engine.settings.id,
      model: engine.settings.model,
      workspace: engine.settings.workspace,
      date: new Date().toISOString(),
    })
    const name = handoffFileName(new Date().toISOString(), turn.prompt).split('/').at(-1) ?? 'handoff.md'
    void bridge.vault.saveHandoff(name, markdown).then((answer) => {
      void navigator.clipboard?.writeText(markdown).catch(() => undefined)
      setHanded(answer.ok ? `Saved to the vault: ${answer.answer} (also copied)` : answer.answer)
    })
  }

  return (
    <>
    <section
      aria-label="Engine work"
      className="ob-engine-work mx-auto mb-3 w-full max-w-[var(--chat-width)] px-0 py-3"
    >
      <p className="ob-turn-prompt">
        {turn.prompt}
        {turn.pictures ? <span className="text-muted"> + {turn.pictures} picture{turn.pictures === 1 ? '' : 's'}</span> : null}
      </p>
      <header className="flex items-center gap-2">
        <button type="button" onClick={() => setPanel(!panelOpen)} aria-expanded={panelOpen || turn.permissions.length > 0} aria-label={panelOpen ? 'Collapse the engine strip' : 'Expand the engine strip'} className="shrink-0 text-muted hover:text-ink">
          {panelOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <details className="ob-task-meta"><summary>Task details</summary><p>
          Engine · {engine.settings.id} · {modelLabel(engine.settings.model)}
          {' · ' + (engine.settings.workspace ? engine.settings.workspace.split(/[\\/]/).filter(Boolean).at(-1) : 'vault')}
          {turn.state === 'running' ? ` · ${PHASE_LABEL[phase]}…` : turn.state === 'error' ? ' · stopped' : ' · done'}
          {` · ${formatTotals(engine.totals)}`}
                </p></details>
        {turn.state === 'running' ? (
          <button
            type="button"
            onClick={() => void engine.stop()}
            className="ml-auto flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            <Square size={10} /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={handOff}
            title="Write this finished task into the vault as a document any later session can continue from"
            className="ml-auto flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            <Handshake size={10} /> Hand off
          </button>
        )}
        {turn.state !== 'running' ? (
          <button
            type="button"
            onClick={() => setCompacting(true)}
            title="Compact: the engine pours this conversation into a brief, the session ends fresh, the brief rides along"
            className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            <Minimize2 size={10} /> Compact
          </button>
        ) : null}
        {turn.state !== 'running' ? (
          <button
            type="button"
            onClick={() => void runReview()}
            disabled={review.running}
            title="Review the completed text with a tool-free model call. No app actions or approvals are available."
            className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            <Eye size={10} /> Review
          </button>
        ) : null}
        {turn.state !== 'running' ? (
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(turnCopyText(turn.prompt, turn.items)).catch(() => undefined); setCopied(true) }}
            title="Copy this turn: the work order and the engine's words"
            aria-label="Copy this turn"
            className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            <Copy size={10} /> {copied ? 'Copied' : 'Copy'}
          </button>
        ) : null}
        {turn.state !== 'running' ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('app:draft', { detail: turn.prompt }))}
            title="Edit the work order: put it back in the composer, change what you want, send again"
            className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            <Pencil size={10} /> Edit
          </button>
        ) : null}
      </header>

      {(panelOpen || turn.permissions.length > 0) ? (<>
      {review.error ? (
        <p className="mt-1.5 text-[11.5px] text-warn">
          {review.error}
          <button type="button" onClick={clearReviewError} aria-label="Dismiss" className="ml-2 text-muted hover:text-ink">×</button>
        </p>
      ) : null}
      {review.line && !review.running ? (
        <p role="status" className="mt-1.5 rounded-lg border border-line bg-bg px-2 py-1 text-[11.5px] leading-relaxed text-ink">
          {review.line}
          {review.verdict?.kind === 'issues' ? (
            <span className="mt-1 block whitespace-pre-wrap text-muted">{review.verdict.lines.join('\n')}</span>
          ) : null}
      {review.running ? <p className="ob-control-scope" role="status">A text-only review is running. It cannot run app tools or answer approvals.</p> : null}
      {review.record ? <details className="ob-review-report"><summary>Review report · {review.record.model || 'not sent'} · {review.record.state}<span>{review.record.prompt}</span></summary><pre>{review.record.text || review.record.error}</pre><p className="ob-control-scope">Text evidence only; files and tests were not independently inspected.{review.record.clipped ? ' This report covers a bounded excerpt.' : ''}</p></details> : null}

        </p>
      ) : null}

      {engine.line.length ? (
        <div className="mt-1.5 rounded-lg border border-line bg-bg px-2 py-1.5" aria-label="Work waiting in the line">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[11.5px] font-medium text-ink">
              <ListOrdered size={10} aria-hidden /> In the line: {engine.line.length}
            </p>
            <button type="button" onClick={() => engine.clearLine()} className="text-[11px] text-muted hover:text-ink">Clear the line</button>
          </div>
          <ul className="mt-1 space-y-0.5">
            {engine.line.map(item => (
              <li key={item.id} className="flex items-start justify-between gap-2 text-[11.5px] text-muted">
                <span className="min-w-0 flex-1 truncate">▸ {item.prompt}</span>
                <button type="button" onClick={() => engine.removeFromLine(item.id)} aria-label="Remove from the line" className="shrink-0 text-muted hover:text-warn">×</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {compact.notice ? (
        <p role="status" className="mt-1.5 rounded-lg border border-line bg-bg px-2 py-1 text-[11.5px] leading-relaxed text-ink">
          {compact.notice}
          <button type="button" onClick={clearCompactNotice} aria-label="Dismiss" className="ml-2 text-muted hover:text-ink">×</button>
        </p>
      ) : null}



      <ul className="mt-2 flex flex-col gap-1.5">
        {turn.items.map((item, index) => {
          // The thinking block that is still being written stays unfolded;
          // once the answer starts (or the turn ends) it folds away.
          const live = turn.state === 'running' && item.kind === 'thinking' && index === turn.items.length - 1
          return <EngineItemRow key={`${index}-${live ? 'live' : 'kept'}`} item={item} live={live} pending={turn.state === 'running'} />
        })}
      </ul>

      {handed ? <p className="mt-1 text-[11px] text-muted">{handed}</p> : null}
      {finished && kept.length > 0 ? (
        <div className="mt-2 rounded-lg border border-line bg-bg p-2">
          <p className="text-[11px] text-muted">Kept before the engine changed a file, newest first:</p>
          <ul className="mt-1 flex flex-col gap-1">
            {kept.map(entry => (
              <li key={entry.copy || entry.original} className="flex items-center gap-2 text-[11.5px]">
                <span className="min-w-0 flex-1 truncate text-muted" title={entry.original}>
                  {entry.original.split(/[\\/]/).filter(Boolean).at(-1)} · {new Date(entry.at).toLocaleTimeString()}
                  {entry.existed === false ? ' · new file' : ''}
                </span>
                <button
                  type="button"
                  title={entry.existed === false
                    ? `Remove ${entry.original} — the engine created it; it did not exist before`
                    : `Put the older self of ${entry.original} back`}
                  onClick={() => {
                    // The original path rides along so the right ghost is the
                    // one undone — several files can be created in one turn.
                    void bridge.engine.checkpoints.restore(entry.copy, entry.original).then((answer) => {
                      setRestored(answer.answer)
                      if (answer.ok) setKept(current => current.filter(row => !(row.copy === entry.copy && row.original === entry.original)))
                    })
                  }}
                  className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
                >
                  {entry.existed === false ? 'Undo the creation' : 'Restore'}
                </button>
              </li>
            ))}
          </ul>
          {restored ? <p className="mt-1 text-[11px] text-muted">{restored}</p> : null}
        </div>
      ) : null}
      {turn.usage && turn.state !== 'running' ? (
        <p className="mt-2 text-[11px] text-muted" title="What the engine itself reported for this turn">
          {turn.usage.inTokens.toLocaleString()} in · {turn.usage.outTokens.toLocaleString()} out
          {turn.usage.durationMs !== null ? ` · ${(turn.usage.durationMs / 1000).toFixed(1)}s` : ''}
          {turn.usage.costUsd !== null ? ` · $${turn.usage.costUsd.toFixed(4)}` : ''}
          {turn.bumps ? ` · ${turn.bumps} bump${turn.bumps === 1 ? '' : 's'}, recovered` : ''}
        </p>
      ) : null}

      {turn.permissions.length > 0 ? (
        <div className="ob-permission-request mt-2.5 rounded-lg border border-line bg-bg p-2.5" tabIndex={-1} role="region" aria-label="Permission request">
          <p className="flex items-center gap-2 text-[12.5px] text-ink">
            <Mascot motion={WAITING_LOADER} size={20} />
            <span>
              The engine wants to use{' '}
              <span className="font-medium">{turn.permissions[0].tool}</span>
              {turn.permissions.length > 1 ? (
                <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-muted">
                  +{turn.permissions.length - 1} more waiting
                </span>
              ) : null}
            </span>
          </p>
          {turn.permissions[0].summary ? (
            <p className="mt-0.5 break-words font-mono text-[11.5px] text-muted">{turn.permissions[0].summary}</p>
          ) : null}
          {turn.permissions[0].detail ? <DiffBlock detail={turn.permissions[0].detail} /> : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void engine.answer(true)}
              className="rounded-lg border border-ok/50 px-2.5 py-1 text-[12px] text-ink hover:border-ok"
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => void engine.answer(false)}
              className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink"
            >
              Deny
            </button>
          </div>
        </div>
      ) : null}
      </>) : null}
    </section>
    {engine.journal.length ? (
      <details aria-label="Earlier sessions" className="mx-auto mb-3 w-full max-w-[var(--chat-width)] rounded-xl border border-line bg-card px-4 py-2.5">
        <summary className="cursor-pointer text-[12px] font-medium text-muted">
          Earlier sessions on this machine ({engine.journal.length} {engine.journal.length === 1 ? 'turn' : 'turns'})
        </summary>
        <ul className="mt-2 space-y-1.5">
          {engine.journal.slice(0, 10).map((entry, index) => (
            <li key={index} className="rounded-lg border border-line bg-bg px-2.5 py-1.5">
              <p className="truncate text-[11.5px] text-ink">▸ {entry.prompt}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{entry.answer || '(nothing said)'}</p>
              <p className="mt-0.5 text-[10.5px] text-muted">{entry.at.slice(0, 16).replace('T', ' ')}{entry.usage ? ` · ${entry.usage}` : ''}{entry.workspace ? ` · ${entry.workspace.split(/[\\/]/).filter(Boolean).at(-1)}` : ''}</p>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
          A record, not a transcript: the engine's own resume already carries the context forward. Clear it in Settings &gt; System.
        </p>
      </details>
    ) : null}
    {compacting ? <CompactDialog onClose={() => setCompacting(false)} /> : null}
    </>
  )
}

/** One line of the engine's story, with the icon that matches the act. */
function EngineItemRow({ item, live = false, pending = false }: { item: EngineItem; live?: boolean; pending?: boolean }) {
  const look = useLook()
  const [thinkingOpen, setOpen] = useState(thinkingOpenNow())
  useEffect(() => {
    const follow = (): void => setOpen(thinkingOpenNow())
    window.addEventListener(THINKING_OPEN_EVENT, follow)
    return () => window.removeEventListener(THINKING_OPEN_EVENT, follow)
  }, [])
  if (item.kind === 'thinking') {
    return (
      <li>
        <details
          open={thinkingOpen || (live && look.showThinking)}
          onToggle={event => { if (event.currentTarget.open !== (thinkingOpen || (live && look.showThinking))) setThinkingOpen(event.currentTarget.open) }}
          className="ob-thinking-block py-2"
        >
          <summary className="cursor-pointer text-[12px] text-muted">
            Thinking{live ? ', still going' : ''}
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-muted">
            {item.text}
          </p>
        </details>
      </li>
    )
  }
  if (item.kind === 'text') {
    if (pending && !look.streamReplies) return null
    return <li className="whitespace-pre-wrap break-words text-[length:var(--transcript-size,14.5px)] leading-[1.65] text-ink [font-family:var(--transcript-font)]">{item.text}{!pending ? <SpeakButton text={item.text} /> : null}</li>
  }
  if (item.kind === 'error') {
    return (
      <li className="flex items-start gap-1.5 text-[12.5px] text-warn">
        <TriangleAlert size={13} className="mt-0.5 shrink-0" />
        <span className="break-words">{item.text}</span>
      </li>
    )
  }
  if (item.kind === 'status') {
    return (
      <li className="flex items-center gap-1.5 text-[11.5px] text-muted">
        <CircleCheck size={12} className="shrink-0" /> {item.text}
      </li>
    )
  }
  return (
    <li className="flex items-start gap-1.5 text-[12.5px] text-muted">
      <ToolIcon name={item.name} />
      <span className="min-w-0">
        <span className="text-ink">{item.name}</span>
        {item.summary ? <span className="break-all font-mono text-[11.5px]"> {item.summary}</span> : null}
      </span>
    </li>
  )
}

function ToolIcon({ name }: { name: string }) {
  const className = 'mt-0.5 shrink-0'
  if (name === 'Bash' || name === 'bash') return <Terminal size={13} className={className} />
  if (name === 'Read' || name === 'Write' || name === 'Edit' || name === 'NotebookEdit')
    return <FilePen size={13} className={className} />
  if (name === 'Grep' || name === 'Glob') return <Search size={13} className={className} />
  return <Wrench size={13} className={className} />
}


/**
 * A permission card's detail, read for shape: when it carries a diff (the
 * engine's edit requests do), the changed lines are shown red and green so a
 * person can SEE the edit before allowing it — Nimbalyst's red/green review,
 * sized to our cards.
 *
 * The honesty line: the engine's own permission door allows or denies a whole
 * edit. A "hunk" cannot be half-applied through it, so there are no per-hunk
 * buttons here — only the full change, coloured, and one Allow / Deny pair
 * that means the whole change.
 */
export function DiffBlock({ detail }: { detail: string }) {
  const lines = detail.split('\n')
  const looksLikeDiff =
    lines.filter(line => /^(---|\+\+\+|@@|[+-])\s?/.test(line)).length >= 2 && lines.length >= 3
  if (!looksLikeDiff) {
    return (
      <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-panel p-2 font-mono text-[11px] leading-relaxed text-muted">
        {detail}
      </pre>
    )
  }
  return (
    <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre rounded-md border border-line bg-panel p-2 font-mono text-[11px] leading-relaxed">
      {lines.map((line, index) => {
        const kind = line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : line.startsWith('@@') ? 'hunk' : 'ctx'
        return (
          <div
            key={index}
            className={
              kind === 'add'
                ? 'bg-ok/10 text-ok'
                : kind === 'del'
                  ? 'bg-warn/10 text-warn'
                  : kind === 'hunk'
                    ? 'text-accent'
                    : 'text-muted'
            }
          >
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

/**
 * The Compact dialog, in two honest steps. Step one shows the work order and
 * lets the engine write the brief; step two shows the brief IN FULL and only
 * then ends the session. Cancel at any point and the conversation is exactly
 * as it was — a compaction that did not happen costs nothing.
 */
function CompactDialog({ onClose }: { onClose: () => void }) {
  const compact = useCompact()
  const engine = useEngine()
  const busy = compact.phase === 'briefing' || compact.phase === 'ending'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-label="Compact the conversation" onClick={() => { if (!busy) { cancelBrief(); onClose() } }}>
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-line bg-card p-5" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Compact the conversation</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Only the engine knows how full its head is. Compact asks it to pour what matters into a
              brief, ends this session, and hands the brief to the next one. The cards above stay here;
              nothing you can see is deleted.
            </p>
          </div>
          <button type="button" onClick={() => { if (!busy) { cancelBrief(); onClose() } }} aria-label="Close" className="text-muted hover:text-ink">
            <X size={15} />
          </button>
        </div>

        {compact.phase === 'idle' || compact.phase === 'briefing' ? (
          <>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-muted">What will be sent</p>
            <pre className="mt-1.5 max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg p-2.5 text-[12px] leading-relaxed text-ink">
              {BRIEF_ORDER}
            </pre>
            {compact.error ? <p className="mt-2 text-[11.5px] text-warn">{compact.error}</p> : null}
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-[11px] leading-snug text-muted">The engine writes the brief as a normal turn; nothing ends yet.</p>
              <button
                type="button"
                onClick={() => void writeBrief()}
                disabled={compact.phase === 'briefing'}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium ${compact.phase === 'briefing' ? 'bg-white/[0.06] text-muted' : 'bg-accent text-[var(--accent-ink)] hover:bg-accent/90'}`}
              >
                {compact.phase === 'briefing' ? 'Pouring…' : 'Write the brief'}
              </button>
            </div>
          </>
        ) : null}

        {compact.phase === 'ready' || compact.phase === 'ending' ? (
          <>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-muted">
              The brief, in full · {compact.words} words
            </p>
            <pre className="mt-1.5 max-h-[240px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg p-2.5 text-[12px] leading-relaxed text-ink">
              {compact.brief}
            </pre>
            {compact.error ? <p className="mt-2 text-[11.5px] text-warn">{compact.error}</p> : null}
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-[11px] leading-snug text-muted">
                Ending ends {engine.settings.id}'s session and forgets the resume thread. The brief rides with your next message.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => { cancelBrief(); onClose() }}
                  className="h-8 rounded-lg border border-line px-3 text-[12px] text-muted hover:text-ink"
                >
                  Keep the session
                </button>
                <button
                  type="button"
                  onClick={() => void finishCompact().then((ok) => { if (ok) onClose() })}
                  disabled={compact.phase === 'ending'}
                  className={`h-8 rounded-lg px-3 text-[12.5px] font-medium ${compact.phase === 'ending' ? 'bg-white/[0.06] text-muted' : 'bg-accent text-[var(--accent-ink)] hover:bg-accent/90'}`}
                >
                  {compact.phase === 'ending' ? 'Ending…' : 'Compact now'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
