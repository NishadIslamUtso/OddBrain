import { Mascot } from '../motion/Mascot'
import { useEffect, useState } from 'react'

import { FilePlus2, MessageSquare, Play, Plus, Trash2, X } from 'lucide-react'
import useProjects from '@/state/projects'
import { bridge } from '@/platform/bridge'
import { chatsOf, newReferenceId, type Project } from '@shared/lib/projects'
import type { Chat } from '@shared/types'
import ProjectSessions from './ProjectSessions'
import ProjectContextPanel from './ProjectContextPanel'

/**
 * Projects — the owner's named homes for related work, Claude-app style.
 *
 * A project holds: its chats, the instruction the owner wrote, optional
 * goals, reference files the owner attached (originals stay on disk —
 * the project keeps paths and explicit context choices, never copies),
 * and an optional working folder. No Git, GitHub or folder is required:
 * a research project is chats, instruction, goals and references alone.
 *
 * The retired Code screen's useful controls live here now, scoped to the
 * project's own folder: the session board with its resume ids, linked
 * files and Done, plus the engine-aware approval quick-set. What a chat
 * may see of the project is inspectable in "What a chat can see" — the
 * same bundle the resolver (shared/lib/projectContext.ts) describes for
 * Part 4, so nothing is implied that is not listed there.
 */

const leaf = (folder: string): string => folder.split(/[\\/]/).filter(Boolean).at(-1) ?? folder

type ArtifactLite = { id: string; title: string; type?: string; chatId?: string }

export default function ProjectsView({
  chats,
  focusId = '',
  onClearFocus,
  onOpenChat,
  onNewChatInProject,
  onWorkHere,
  onOpenArtifact,
}: {
  chats: Chat[]
  focusId?: string
  onClearFocus?: () => void
  onOpenChat: (chatId: string) => void
  onNewChatInProject: (projectId: string) => void
  onWorkHere: (folder: string) => void
  /** Open one of this project's artifacts (coordinator wires the focus). */
  onOpenArtifact?: (artifactId: string) => void
  /**
   * @deprecated The Code screen is retired; the session board is inline
   * below. Accepted (and ignored) until the coordinator removes the prop.
   */
  onViewBoard?: (folder: string) => void
}) {
  // The engine's own threads, counted against each project's folder — the
  // real resumable sessions, not a decoration.
  const [threads, setThreads] = useState<Record<string, number>>({})
  // Outputs made by this project's chats, from the existing artifact store.
  const [artifacts, setArtifacts] = useState<ArtifactLite[]>([])
  useEffect(() => {
    let cancelled = false
    bridge.engine
      .sessions()
      .then((list) => {
        if (cancelled) return
        const counts: Record<string, number> = {}
        for (const session of list) counts[session.workspace] = (counts[session.workspace] ?? 0) + 1
        setThreads(counts)
      })
      .catch(() => {})
    bridge.artifacts
      .list()
      .then((answer) => {
        if (!cancelled && answer.ok) setArtifacts(answer.items as ArtifactLite[])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const { projects, loading, create, update, remove } = useProjects(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draftInstruction, setDraftInstruction] = useState('')
  const [editName, setEditName] = useState('')
  const [draftFolder, setDraftFolder] = useState('')
  const [draftGoals, setDraftGoals] = useState<string[]>([])
  const [newGoal, setNewGoal] = useState('')
  const [openSessions, setOpenSessions] = useState<string | null>(null)
  const [openContext, setOpenContext] = useState<string | null>(null)

  const startEdit = (project: Project): void => {
    setEditing(project.id)
    setEditName(project.name)
    setDraftInstruction(project.instruction)
    setDraftFolder(project.folder)
    setDraftGoals(project.goals)
    setNewGoal('')
  }

  const saveEdit = (id: string): void => {
    const goals = [...draftGoals, newGoal.trim()].filter(Boolean).slice(0, 12)
    update(id, { name: editName.trim() || projects.find((p) => p.id === id)?.name || 'Project', instruction: draftInstruction, folder: draftFolder.trim(), goals })
    setEditing(null)
  }

  const addReferences = (project: Project): void => {
    void bridge.engine.pickFiles().then((paths) => {
      if (!paths.length) return
      const known = new Set(project.references.map((reference) => reference.path))
      const added = paths
        .filter((path) => !known.has(path))
        .map((path) => ({
          id: newReferenceId(),
          path,
          label: leaf(path),
          addedAt: new Date().toISOString(),
          // New references never join context by default; the owner says so.
          includeInContext: false,
        }))
      if (added.length) update(project.id, { references: [...project.references, ...added].slice(0, 40) })
    })
  }

  const toggleReference = (project: Project, referenceId: string, include: boolean): void => {
    update(project.id, {
      references: project.references.map((reference) => (reference.id === referenceId ? { ...reference, includeInContext: include } : reference)),
    })
  }

  return (
    <div className="ob-workspace-page ob-projects-view flex-1 overflow-y-auto" aria-label="Projects">
      <div className="mx-auto w-full max-w-[var(--chat-width)] px-4 py-8">
        <header className="ob-screen-header flex items-center gap-2.5">
          <Mascot motion="architect" size={32} static />
          <h1 className="text-[20px] font-semibold text-ink">Projects</h1>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] transition-colors hover:bg-accent/90"
          >
            <Plus size={13} aria-hidden /> New project
          </button>
        </header>
        <p className="mt-1.5 max-w-[62ch] text-[12px] leading-relaxed text-muted">
          Related chats, instructions, goals and reference files in one home. A folder is optional — a project works
          without one, and nothing here needs Git.
        </p>

        {focusId && onClearFocus ? (
          <button type="button" className="ob-text-button" onClick={onClearFocus}>
            All projects
          </button>
        ) : null}
        {creating ? (
          <form
            className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-card p-2.5"
            onSubmit={(event) => {
              event.preventDefault()
              if (name.trim()) {
                create(name.trim())
                setName('')
                setCreating(false)
              }
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="What is this project called?"
              aria-label="Project name"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent/60"
            />
            <button type="submit" disabled={!name.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] disabled:opacity-50">
              Create
            </button>
            <button type="button" onClick={() => setCreating(false)} aria-label="Cancel" className="rounded-lg border border-line p-2 text-muted hover:text-ink">
              <X size={13} />
            </button>
          </form>
        ) : null}

        {loading ? (
          <p className="mt-6 text-[12.5px] text-muted">Reading the projects…</p>
        ) : projects.length === 0 ? (
          <div className="ob-screen-empty">
            <Mascot motion="architect" size={88} static />
            <h2>No projects yet</h2>
            <p>Keep related chats, instructions and reference files together. A working folder is optional.</p>
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {projects
              .filter((p) => !focusId || !projects.some((x) => x.id === focusId) || p.id === focusId)
              .map((project) => {
                const projectChats = chatsOf(chats, project.id)
                const chatIds = new Set(projectChats.map((chat) => chat.id))
                const projectArtifacts = artifacts.filter((item) => item.chatId && chatIds.has(item.chatId))
                const editingThis = editing === project.id
                const sessionsOpen = openSessions === project.id
                const contextOpen = openContext === project.id
                return (
                  <li key={project.id} className="rounded-xl border border-line bg-card p-3.5">
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-[14px] font-medium text-ink">{project.name}</h2>
                      <span className="rounded-md border border-line px-1.5 text-[10.5px] text-muted">
                        {projectChats.length} {projectChats.length === 1 ? 'chat' : 'chats'}
                      </span>
                      {project.folder ? (
                        <span className="truncate rounded-md border border-line px-1.5 text-[10.5px] text-muted" title={project.folder}>
                          {leaf(project.folder)}
                        </span>
                      ) : null}
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onNewChatInProject(project.id)}
                          className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11.5px] text-muted hover:text-ink"
                        >
                          <MessageSquare size={11} aria-hidden /> New chat
                        </button>
                        <button
                          type="button"
                          onClick={() => onWorkHere(project.folder)}
                          disabled={!project.folder}
                          title={project.folder ? `Point the engine at ${project.folder}` : 'Set a folder first — the chats above work without one'}
                          className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11.5px] text-muted hover:text-ink disabled:opacity-40"
                        >
                          <Play size={11} aria-hidden /> Work here
                        </button>
                        <button type="button" onClick={() => remove(project.id)} aria-label={`Delete ${project.name}`} className="rounded-lg p-1.5 text-muted hover:text-warn">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {editingThis ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <input aria-label="Project name" value={editName} maxLength={80} onChange={(e) => setEditName(e.target.value)} className="h-8 rounded-lg border border-line bg-bg px-2.5 text-[12.5px]" />
                        <textarea
                          value={draftInstruction}
                          onChange={(event) => setDraftInstruction(event.target.value)}
                          rows={3}
                          placeholder="The instruction for this project: what it is, how its work should be done."
                          aria-label={`Instruction for ${project.name}`}
                          className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-accent/60"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            value={draftFolder}
                            onChange={(event) => setDraftFolder(event.target.value)}
                            placeholder="Folder on this machine (optional)"
                            aria-label={`Folder for ${project.name}`}
                            spellCheck={false}
                            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 text-[12px] text-ink outline-none placeholder:text-muted focus:border-accent/60"
                          />
                        </div>
                        <div>
                          <p className="text-[11px] font-medium text-muted">Goals</p>
                          {draftGoals.map((goal, index) => (
                            <div key={`${goal}-${index}`} className="mt-1 flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12px] text-ink">{goal}</span>
                              <button
                                type="button"
                                aria-label={`Remove goal ${goal}`}
                                onClick={() => setDraftGoals(draftGoals.filter((_, entry) => entry !== index))}
                                className="rounded-lg p-1.5 text-muted hover:text-warn"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                          <input
                            value={newGoal}
                            onChange={(event) => setNewGoal(event.target.value)}
                            placeholder="Add a goal (saved with the project)"
                            aria-label={`New goal for ${project.name}`}
                            className="mt-1.5 h-8 w-full rounded-lg border border-line bg-bg px-2.5 text-[12px] text-ink outline-none placeholder:text-muted focus:border-accent/60"
                          />
                        </div>
                        <div>
                          <button type="button" onClick={() => saveEdit(project.id)} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-[var(--accent-ink)]">
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2.5">
                        <button
                          type="button"
                          onClick={() => startEdit(project)}
                          className="block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:bg-white/[0.04]"
                          title="Edit the name, instruction, folder and goals"
                        >
                          {project.instruction || 'Add an instruction for this project…'}
                        </button>
                        {project.goals.length ? (
                          <ul className="mt-1 flex flex-col gap-0.5 px-2" aria-label={`Goals of ${project.name}`}>
                            {project.goals.map((goal) => (
                              <li key={goal} className="truncate text-[11.5px] text-muted">
                                · {goal}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {projectChats.length ? (
                          <ul className="mt-1.5 flex flex-col">
                            {projectChats.slice(0, 5).map((chat) => (
                              <li key={chat.id}>
                                <button
                                  type="button"
                                  onClick={() => onOpenChat(chat.id)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04]"
                                >
                                  <MessageSquare size={11} className="shrink-0 text-muted" aria-hidden />
                                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{chat.title}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-2 py-1 text-[11.5px] text-muted">No chats in this project yet.</p>
                        )}
                      </div>
                    )}

                    {/* References: the owner's files, originals untouched. */}
                    <div className="mt-3 border-t border-line pt-2.5">
                      <div className="flex items-center gap-2 px-0.5">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">References</h3>
                        <button
                          type="button"
                          onClick={() => addReferences(project)}
                          className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-muted hover:text-ink"
                        >
                          <FilePlus2 size={10} aria-hidden /> Add files…
                        </button>
                      </div>
                      {project.references.length ? (
                        <ul className="mt-1.5 flex flex-col">
                          {project.references.map((reference) => (
                            <li key={reference.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.04]">
                              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted" title={reference.path}>
                                {reference.label}
                              </span>
                              <span className="shrink-0 text-[10px] text-muted">{reference.includeInContext ? 'in context' : 'not in context'}</span>
                              <button
                                type="button"
                                aria-label={`Remove reference ${reference.label}`}
                                onClick={() => update(project.id, { references: project.references.filter((entry) => entry.id !== reference.id) })}
                                className="shrink-0 rounded p-0.5 text-muted hover:text-warn"
                              >
                                <X size={10} aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-2 py-1 text-[11.5px] text-muted">No reference files yet. Originals stay where they are; the project keeps the path.</p>
                      )}
                    </div>

                    {/* Outputs from this project's chats (the existing artifact store). */}
                    {projectArtifacts.length ? (
                      <div className="mt-3 border-t border-line pt-2.5">
                        <h3 className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Outputs</h3>
                        <ul className="mt-1.5 flex flex-col">
                          {projectArtifacts.slice(0, 5).map((item) => (
                            <li key={item.id}>
                              {onOpenArtifact ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenArtifact(item.id)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/[0.04]"
                                >
                                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{item.title}</span>
                                  {item.type ? <span className="shrink-0 text-[10px] uppercase text-muted">{item.type}</span> : null}
                                </button>
                              ) : (
                                <span className="flex items-center gap-2 px-2 py-1">
                                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{item.title}</span>
                                  {item.type ? <span className="shrink-0 text-[10px] uppercase text-muted">{item.type}</span> : null}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                      <button
                        type="button"
                        aria-expanded={contextOpen}
                        onClick={() => setOpenContext(contextOpen ? null : project.id)}
                        className="rounded-lg border border-line px-2 py-1 text-[11px] text-muted hover:text-ink"
                      >
                        What a chat can see
                      </button>
                      {project.folder ? (
                        <button
                          type="button"
                          aria-expanded={sessionsOpen}
                          onClick={() => setOpenSessions(sessionsOpen ? null : project.id)}
                          className="rounded-lg border border-line px-2 py-1 text-[11px] text-muted hover:text-ink"
                        >
                          Sessions{(threads[project.folder] ?? 0) > 0 ? ` · ${threads[project.folder]}` : ''}
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted">Sessions appear when a working folder is set.</span>
                      )}
                    </div>
                    {contextOpen ? (
                      <div className="mt-2">
                        <ProjectContextPanel project={project} onToggleReference={(referenceId, include) => toggleReference(project, referenceId, include)} />
                      </div>
                    ) : null}
                    {sessionsOpen && project.folder ? (
                      <div className="mt-2">
                        <ProjectSessions focusFolder={project.folder} />
                      </div>
                    ) : null}
                  </li>
                )
              })}
          </ul>
        )}
      </div>
    </div>
  )
}
