import { useEffect, useState } from 'react'
import { Brain, Trash2 } from 'lucide-react'
import { buildMemoryOrder } from '@shared/lib/memory'
import { chooseMemoryFolder, clearMemoryNotice, loadMemory, removeMemory, runMemoryPass, useMemory } from '@/state/memory'

/**
 * The Memory pane: what the engine has remembered, in his vault, every line
 * visible. Run a pass on press; the writes ride the permission cards. A
 * memory file can be deleted whole — the lines are markdown in his vault,
 * editable anywhere he edits notes.
 */
export default function MemorySection() {
  const memory = useMemory()
  const [confirming, setConfirming] = useState('')

  useEffect(() => {
    if (!memory.loaded) void loadMemory()
  }, [memory.loaded])

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-5">
      <header>
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <Brain size={15} aria-hidden />
          Memory
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          What the engine remembers between sessions, kept as plain markdown at{' '}
          <code className="text-ink">{memory.folder || '06 Review/Memory'}</code> — at the location shown above. By default it follows the working folder; an explicit folder can be selected independently. A pass asks the
          engine to note decisions, preferences, facts and open work — and its writes ride the same permission cards as every edit: you see the
          diff before it lands. Everything here is yours to read, edit, or delete.
        </p>
      </header>

      <div className="ob-form-line" style={{ marginTop: 14 }}><button type="button" className="ob-small-button" onClick={() => void chooseMemoryFolder()}>Change memory folder</button><button type="button" className="ob-small-button" onClick={() => void chooseMemoryFolder(true)}>Use working-folder default</button><button type="button" className="ob-text-button" onClick={() => window.dispatchEvent(new Event('app:show-journal'))}>View in turn journal</button></div><p className="ob-control-scope">Choosing a different folder changes where new memory is read/written. Existing notes are not moved or overwritten.</p>
      {memory.status ? (
        <p role="status" className="mt-3 rounded-lg border border-line bg-bg px-3 py-2 text-[12px] text-ink">
          {memory.status}
          <button type="button" onClick={clearMemoryNotice} aria-label="Clear" className="ml-2 text-muted hover:text-ink">×</button>
        </p>
      ) : null}
      {memory.error ? <p className="mt-3 text-[12px] text-warn">{memory.error}</p> : null}

      <div className="mt-4 rounded-xl border border-line bg-card px-3 py-3">
        <p className="text-[12px] font-medium text-ink">Run a pass now</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">It sends this work order, as a normal turn in the chat:</p>
        <pre className="mt-1.5 max-h-[120px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg p-2.5 text-[11.5px] leading-relaxed text-muted">
          {buildMemoryOrder(memory.folder)}
        </pre>
        <button
          type="button"
          onClick={() => void runMemoryPass()}
          disabled={memory.running}
          className={`mt-2 h-8 rounded-lg px-3 text-[12px] font-medium ${memory.running ? 'bg-white/[0.06] text-muted' : 'bg-accent text-[var(--accent-ink)] hover:bg-accent/90'}`}
        >
          {memory.running ? 'Sending…' : 'Send the memory pass'}
        </button>
      </div>

      <ul className="mt-4 space-y-2" aria-label="Memory files">
        {memory.files.map(file => (
          <li key={file.path} className="rounded-xl border border-line bg-card px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">
                  {file.name}
                  <span className="ml-2 text-[11px] font-normal text-muted">{file.updated.slice(0, 16).replace('T', ' ')}</span>
                </p>
                <pre className="mt-1 max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-muted">
                  {file.content}
                </pre>
                {file.clipped ? <p className="mt-1 text-[11px] text-warn">Cut at the read cap — the file itself holds more.</p> : null}
              </div>
              {confirming === file.path ? (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => { setConfirming(''); void removeMemory(file.path) }}
                    className="rounded-lg border border-warn px-2 py-1 text-[11px] text-warn hover:bg-warn/10"
                  >
                    Really remove
                  </button>
                  <button type="button" onClick={() => setConfirming('')} className="text-[11px] text-muted hover:text-ink">Keep it</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(file.path)}
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 rounded-lg border border-line p-1.5 text-muted hover:text-warn"
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
        {memory.loaded && memory.files.length === 0 && !memory.error ? (
          <li className="rounded-xl border border-line bg-card px-3 py-3 text-[12.5px] text-muted">
            Nothing remembered yet. Run a pass after some real work, and what matters lands here — visibly.
          </li>
        ) : null}
      </ul>

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        The lines are markdown in the folder shown above. Edit them in any notes app. The engine is instructed to append under dated headings
        without rewriting earlier lines; check the completed turn and file to confirm what happened.
      </p>
    </div>
  )
}
