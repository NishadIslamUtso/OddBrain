import { useEffect, useState } from 'react'

import { FolderOpen, MessageSquare, Play, Plus, SquareTerminal, Trash2, X } from 'lucide-react'
import useProjects from '@/state/projects'
import { bridge } from '@/platform/bridge'
import { chatsOf } from '@shared/lib/projects'
import type { Chat } from '@shared/types'

/**
 * Projects (04) — the owner's named homes for related work.
 *
 * A project holds three real things: its chats, the instruction the owner
 * wrote for it, and the folder the engine works in. "Work here" points the
 * engine at that folder through the app's own door — the owner's explicit
 * choice, never the window's. Nothing on this screen is decorative: every
 * count is counted, every button does what it says.
 */

const leaf = (folder: string): string => folder.split(/[\\/]/).filter(Boolean).at(-1) ?? folder

export default function ProjectsView({
  chats,
  onOpenChat,
  onNewChatInProject,
  onWorkHere,
  onViewBoard,
}: {
  chats: Chat[]
  onOpenChat: (chatId: string) => void
  onNewChatInProject: (projectId: string) => void
  onWorkHere: (folder: string) => void
  /** Open Code — the engine's workspace, throttle and thread board — on this project's folder. */
  onViewBoard: (folder: string) => void
}) {
  // The engine's own threads, counted against each project's folder — the
  // real resumable sessions, not a decoration.
  const [threads, setThreads] = useState<Record<string, number>>({})
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
    return () => {
      cancelled = true
    }
  }, [])
  const { projects, loading, create, update, remove } = useProjects(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draftInstruction, setDraftInstruction] = useState('')
  const [draftFolder, setDraftFolder] = useState('')

  const startEdit = (id: string, instruction: string, folder: string): void => {
    setEditing(id)
    setDraftInstruction(instruction)
    setDraftFolder(folder)
  }

  const saveEdit = (id: string): void => {
    update(id, { instruction: draftInstruction, folder: draftFolder.trim() })
    setEditing(null)
  }

  return (
    <div className="flex-1 overflow-y-auto" aria-label="Projects">
      <div className="mx-auto w-full max-w-[var(--chat-width)] px-4 py-8">
        <header className="flex items-center gap-2.5">
          <FolderOpen size={18} className="text-muted" aria-hidden />
          <h1 className="text-[20px] font-semibold text-ink">Projects</h1>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] transition-colors hover:bg-accent/90"
          >
            <Plus size={13} aria-hidden /> New project
          </button>
        </header>

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
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              aria-label="Cancel"
              className="rounded-lg border border-line p-2 text-muted hover:text-ink"
            >
              <X size={13} />
            </button>
          </form>
        ) : null}

        {loading ? (
          <p className="mt-6 text-[12.5px] text-muted">Reading the projects…</p>
        ) : projects.length === 0 ? (
          <p className="mt-6 text-[12.5px] text-muted">
            No projects yet. A project keeps its chats, its instruction and its folder in one place. One click starts
            the first.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {projects.map((project) => {
              const projectChats = chatsOf(chats, project.id)
              const editingThis = editing === project.id
              return (
                <li key={project.id} className="rounded-xl border border-line bg-card p-3.5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-[14px] font-medium text-ink">{project.name}</h2>
                    <span className="rounded-md border border-line px-1.5 text-[10.5px] text-muted">
                      {projectChats.length} {projectChats.length === 1 ? 'chat' : 'chats'}
                    </span>
                    {project.folder ? (
                      <span
                        className="truncate rounded-md border border-line px-1.5 text-[10.5px] text-muted"
                        title={project.folder}
                      >
                        {leaf(project.folder)}
                      </span>
                    ) : null}
                    {project.folder ? (
                      <button
                        type="button"
                        onClick={() => onViewBoard(project.folder)}
                        title={`Open this project's folder in Code${(threads[project.folder] ?? 0) > 0 ? `: ${threads[project.folder]} resumable ${(threads[project.folder] ?? 0) === 1 ? 'thread' : 'threads'}` : ''}`}
                        className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-muted hover:text-ink"
                      >
                        <SquareTerminal size={10} aria-hidden /> Code
                        {(threads[project.folder] ?? 0) > 0 ? (
                          <span className="text-muted">· {threads[project.folder]}</span>
                        ) : null}
                      </button>
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
                        title={project.folder ? `Point the engine at ${project.folder}` : 'Set a folder first'}
                        className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11.5px] text-muted hover:text-ink disabled:opacity-40"
                      >
                        <Play size={11} aria-hidden /> Work here
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(project.id)}
                        aria-label={`Delete ${project.name}`}
                        className="rounded-lg p-1.5 text-muted hover:text-warn"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {editingThis ? (
                    <div className="mt-3 flex flex-col gap-2">
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
                        <button
                          type="button"
                          onClick={() => saveEdit(project.id)}
                          className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-[var(--accent-ink)]"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() => startEdit(project.id, project.instruction, project.folder)}
                        className="block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:bg-white/[0.04]"
                        title="Edit the instruction and folder"
                      >
                        {project.instruction || 'Add an instruction for this project…'}
                      </button>
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
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
