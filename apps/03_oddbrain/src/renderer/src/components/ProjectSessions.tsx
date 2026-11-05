import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FolderOpen, Link2, RefreshCw, Trash2, X } from 'lucide-react'
import { useEngine } from '@/state/engine'
import { bridge } from '@/platform/bridge'
import { AGY_APPROVAL_CHOICES, AGY_APPROVAL_NOTE } from '@shared/lib/engineApproval'
import { linkFiles, markDone, normalizeBoard, scopeBoard, unlinkFile, type SessionsBoard } from '@shared/lib/sessionsBoard'

/**
 * ProjectSessions — the engine's resumable threads for one folder, with the
 * owner's linked files and the one completion control ("Done").
 *
 * This is the useful heart of the retired Code screen, relocated: it lives
 * inside the project whose folder it describes (and, during migration, on
 * the legacy Code landing). Continuing is real — the engine resumes the
 * thread by its own id, which is shown and never rewritten here. Done is
 * equally real: the engine forgets the resume id, the card stays as
 * history, and the next launch in that folder starts clean.
 *
 * The approval quick-set beside it speaks each engine's own language:
 * agy gets Part 1's native wording (no approval cards exist on that
 * connection), Claude Code gets its own mode names. Neither list borrows
 * the other's promises.
 */

const leaf = (folder: string): string => folder.split(/[\\/]/).filter(Boolean).at(-1) ?? folder

const CLAUDE_CHOICES: Array<{ id: 'ask' | 'plan' | 'edits' | 'full'; label: string; note: string }> = [
  { id: 'ask', label: 'Ask me', note: 'Every step beyond reading asks you first.' },
  { id: 'plan', label: 'Plan first', note: 'It investigates and proposes; nothing changes until you approve the plan.' },
  { id: 'edits', label: 'Auto-edits', note: 'Files change unasked; other commands still ask.' },
  { id: 'full', label: 'Full speed', note: 'Everything runs unasked. The engine’s own deny rules and guarded deletions still hold.' },
]

export default function ProjectSessions({
  focusFolder = '',
  onClearFocus,
  showWorkspace = false,
}: {
  /** Scope the board to this folder (a project's). Empty shows every folder. */
  focusFolder?: string
  onClearFocus?: () => void
  /** Also show the global workspace picker (legacy landing only). */
  showWorkspace?: boolean
}) {
  const engine = useEngine()
  const [sessions, setSessions] = useState<Array<{ workspace: string; sessionId: string }>>([])
  const [board, setBoard] = useState<SessionsBoard>({ continuing: {}, done: [] })
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const epoch = useRef(0), writing = useRef(false)
  const [ready, setReady] = useState(false)
  const load = useCallback((): void => {
    const own = ++epoch.current; setLoading(true); setReady(false)
    void Promise.all([bridge.engine.sessions(), bridge.engine.boardRead()]).then(([list, value]) => {
      if (own !== epoch.current) return
      setSessions(list); setBoard(normalizeBoard(value)); setReady(true)
    }).catch(() => { if (own === epoch.current) setNotice('Sessions or the board could not be read. Previous results are read-only; refresh before editing. Originals were not changed.') })
      .finally(() => { if (own === epoch.current) setLoading(false) })
  }, [engine.settings.id])
  useEffect(() => { load(); return () => { epoch.current++ } }, [load])

  const persist = async (next: SessionsBoard): Promise<boolean> => {
    if (!ready) { setNotice('Refresh the session board before editing.'); return false }
    try {
      const answer = await bridge.engine.boardWrite(next, board)
      if (!answer.ok) throw Error('The board could not be saved or changed in another view. Refresh before editing; no newer board was replaced.')
      setBoard(next); return true
    } catch (error) { setNotice((error as Error).message); setReady(false); return false }
  }
  const changeBoard = async (next: SessionsBoard) => {
    if (writing.current) return
    writing.current = true
    try { await persist(next) } finally { writing.current = false }
  }
  const linkFilesTo = async (workspace: string): Promise<void> => {
    if (writing.current || !ready) return
    writing.current = true; const own = epoch.current
    try {
      const paths = await bridge.engine.pickFiles()
      if (!paths.length || own !== epoch.current) return
      const { board: next, added } = linkFiles(board, workspace, paths)
      if (added && await persist(next)) setNotice(added === 1 ? 'One file linked to the thread.' : `${added} files linked to the thread.`)
    } catch (error) { setNotice((error as Error).message) }
    finally { writing.current = false }
  }
  const finish = async (workspace: string, sessionId: string): Promise<void> => {
    if (writing.current || !ready) return
    writing.current = true
    try {
      // Check capacity BEFORE forgetting an ID, never after it is gone.
      const next = markDone(board, workspace, sessionId, new Date().toISOString())
      const answer = await bridge.engine.forgetSession(workspace)
      if (!answer.ok) { setNotice('The resume ID was not forgotten. Stop active work and retry; the board was not marked done.'); return }
      if (!await persist(next)) { setNotice(`The automatic resume choice was forgotten, but the board could not be saved. Keep this native ID: ${sessionId}. Refresh before editing.`); return }
      setNotice('Saved resume ID forgotten. Native history and app transcripts are not deleted.')
      load()
    } catch (error) { setNotice((error as Error).message) }
    finally { writing.current = false }
  }

  const workspace = engine.settings.workspace
  const choices = engine.settings.id === 'agy' ? AGY_APPROVAL_CHOICES : CLAUDE_CHOICES
  const view = scopeBoard(sessions, board.done, focusFolder)

  return (
    <section aria-label="Sessions" className="flex flex-col gap-3">
      {showWorkspace ? (
        <div className="rounded-xl border border-line bg-card p-3.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Workspace</h3>
          <p className="mt-1.5 truncate text-[13.5px] text-ink" title={workspace || undefined}>
            {workspace || 'the vault (default)'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void engine.pickWorkspace().then(load)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-muted hover:text-ink"
            >
              <FolderOpen size={11} aria-hidden /> Choose folder…
            </button>
            {workspace ? (
              <button
                type="button"
                onClick={() => void engine.setWorkspace('').then(answer => { if (answer.ok) load(); else setNotice(answer.answer) }).catch(() => setNotice('The working folder could not be changed.'))}
                className="rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-muted hover:text-ink"
              >
                Back to the vault
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (!workspace) {
                  setNotice('The vault is the workplace; choose a folder first to open one.')
                  return
                }
                void bridge.engine.openFolder(workspace)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-muted hover:text-ink"
            >
              <ExternalLink size={11} aria-hidden /> Open folder
            </button>
          </div>
        </div>
      ) : null}

      {/* The approval quick-set, in the active engine's own words. */}
      <div>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Approval">
          {choices.map((step) => {
            const active = (engine.settings.approval ?? 'ask') === step.id
            return (
              <button
                key={step.id}
                type="button"
                role="radio"
                aria-checked={active}
                title={step.note}
                onClick={() => void engine.setApproval(step.id)}
                className={`rounded-lg px-2.5 py-1 text-[11.5px] transition-colors ${
                  active ? 'bg-accent text-[var(--accent-ink)]' : 'border border-line text-muted hover:text-ink'
                }`}
              >
                {step.label}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          {engine.settings.id === 'agy' ? AGY_APPROVAL_NOTE : 'These are the engine’s own modes. The app adds no rules of its own.'}
        </p>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Session board</h3>
          <button type="button" onClick={load} aria-label="Refresh sessions" className="rounded-lg p-1 text-muted hover:text-ink">
            <RefreshCw size={11} aria-hidden />
          </button>
          {view.scoped && onClearFocus ? (
            <button
              type="button"
              onClick={onClearFocus}
              className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-ink"
            >
              Show all folders
            </button>
          ) : null}
        </div>
        {notice ? (
          <p className="mt-1.5 text-[12px] text-muted" role="status">
            {notice}
          </p>
        ) : null}
        {loading ? (
          <p className="mt-2 text-[12.5px] text-muted">Reading the board…</p>
        ) : view.sessions.length === 0 && view.done.length === 0 ? (
          <p className="mt-2 text-[11.5px] text-muted">
            No threads yet. Tasks run in a working folder appear here and can be resumed later.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-panel p-2.5">
              <p className="px-0.5 text-[11px] font-medium text-muted">Continuing · {view.sessions.length}</p>
              {view.sessions.length === 0 ? (
                <p className="mt-2 px-0.5 text-[11.5px] text-muted">Nothing to resume. A thread appears when the engine works in a folder.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {view.sessions.map(({ workspace: ws, sessionId }) => {
                    const files = board.continuing[ws]?.files ?? []
                    return (
                      <li key={ws} className="rounded-lg border border-line bg-card px-3 py-2.5">
                        <div className="flex items-center gap-2">

                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={ws}>
                            {leaf(ws)}
                          </span>
                          <span className="max-w-[50%] break-all font-mono text-[10px] text-muted">{sessionId}</span>
                        </div>
                        {files.length ? (
                          <ul className="mt-1.5 flex flex-col gap-0.5">
                            {files.map((path) => (
                              <li key={path} className="flex min-w-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  title={`Copy the path: ${path}`}
                                  aria-label={`Copy the path of ${leaf(path)}`}
                                  onClick={() => {
                                    if (!navigator.clipboard) { setNotice('Clipboard access is unavailable.'); return }
                                    void navigator.clipboard.writeText(path).then(() => setNotice(`${leaf(path)} — path copied; add it to the composer by name.`)).catch(() => setNotice('The path could not be copied.'))
                                  }}
                                  className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left font-mono text-[10.5px] text-muted hover:text-ink"
                                >
                                  {leaf(path)}
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Unlink ${leaf(path)}`}
                                  title="Remove this link"
                                  onClick={() => void changeBoard(unlinkFile(board, ws, path))}
                                  className="shrink-0 rounded p-0.5 text-muted hover:text-warn"
                                >
                                  <X size={10} aria-hidden />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => linkFilesTo(ws)}
                            title="Link the files this thread touches"
                            className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-muted hover:text-ink"
                          >
                            <Link2 size={10} aria-hidden /> Link files
                          </button>
                          <button
                            type="button"
                            onClick={() => void bridge.engine.openFolder(ws)}
                            title={`Open ${ws} in the file manager`}
                            aria-label={`Open the folder of ${leaf(ws)}`}
                            className="rounded-lg border border-line p-1.5 text-muted hover:text-ink"
                          >
                            <ExternalLink size={10} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => finish(ws, sessionId)}
                            title="Done: the engine forgets this thread; the next launch starts clean"
                            className="ml-auto rounded-lg border border-line px-2 py-1 text-[11px] text-muted hover:text-ink"
                          >
                            Done
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-line bg-panel p-2.5">
              <p className="px-0.5 text-[11px] font-medium text-muted">Done · {view.done.length}</p>
              {view.done.length === 0 ? (
                <p className="mt-2 px-0.5 text-[11.5px] text-muted">Nothing finished yet. “Done” forgets the saved automatic-resume choice; it does not delete native history.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {view.done.map((card) => (
                    <li key={`${card.workspace}:${card.sessionId}`} className="rounded-lg border border-line bg-card px-3 py-2.5 opacity-75">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted" title={card.workspace}>
                          {leaf(card.workspace)}
                        </span>
                        <span className="max-w-[50%] break-all font-mono text-[10px] text-muted">{card.sessionId}</span>
                        <button
                          type="button"
                          aria-label={`Drop the finished card of ${leaf(card.workspace)}`}
                          title="Remove this history card"
                          onClick={() => void changeBoard({ ...board, done: board.done.filter((entry) => entry !== card) })}
                          className="shrink-0 rounded p-0.5 text-muted hover:text-warn"
                        >
                          <Trash2 size={11} aria-hidden />
                        </button>
                      </div>
                      {card.endedAt ? <p className="mt-0.5 text-[10.5px] text-muted">finished {card.endedAt.slice(0, 10)}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">
          Threads continue automatically: the next task in the same folder picks up where this one ended. “Done” forgets that automatic-resume choice. Recorded transcripts and native history remain separate.
        </p>
      </div>
    </section>
  )
}
