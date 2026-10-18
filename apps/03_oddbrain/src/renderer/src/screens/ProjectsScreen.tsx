import { useState } from 'react'
import { ArrowRight, FolderClosed, Pencil, Plus } from 'lucide-react'
import type { Workspace } from '../../../shared/workspace'
import { newProject, renameProject } from '../../../shared/workspace'
import { newId, now } from '../data/useWorkspace'

type Props = {
  data: Workspace
  update: (change: (data: Workspace) => Workspace) => Promise<boolean>
  onChat: (id: string) => void
  notice: (text: string) => void
}
export function ProjectsScreen({ data, update, onChat, notice }: Props) {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const create = async (): Promise<void> => {
    const ok = await update((before) => newProject(before, newId(), name, now()))
    if (ok) {
      setName('')
      notice('Project saved in this workspace.')
    }
  }
  return (
    <section className="scroll-screen" aria-label="Projects" data-find-scroll>
      <div className="screen-content">
        <div className="screen-heading">
          <div>
            <h1>Projects</h1>
            <p>Keep related conversations together.</p>
          </div>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <input
            aria-label="New project name"
            placeholder="Name a project"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
          />
          <button type="submit" className="primary-small" disabled={!name.trim()}>
            <Plus size={15} /> New project
          </button>
        </form>
        {data.projects.length ? (
          <div className="project-grid">
            {data.projects.map((project) => {
              const chats = data.chats.filter((chat) => chat.projectId === project.id)
              return (
                <article className="project-card" key={project.id}>
                  <div className="project-icon">
                    <FolderClosed size={19} />
                  </div>
                  <div className="project-details">
                    {editing === project.id ? (
                      <form
                        className="project-rename"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void update((before) => renameProject(before, project.id, draft)).then((ok) => {
                            if (ok) {
                              setEditing(null)
                              notice('Project renamed.')
                            }
                          })
                        }}
                      >
                        <input
                          autoFocus
                          aria-label="Project name"
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          maxLength={80}
                        />
                        <button type="submit">Save</button>
                        <button type="button" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <h2>
                        {project.name}
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Rename ${project.name}`}
                          onClick={() => {
                            setEditing(project.id)
                            setDraft(project.name)
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                      </h2>
                    )}
                    <p className="quiet">
                      {chats.length} conversation{chats.length === 1 ? '' : 's'} · created{' '}
                      {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {chats.length ? (
                    <ul className="project-chats">
                      {chats.map((chat) => (
                        <li key={chat.id}>
                          <button type="button" onClick={() => onChat(chat.id)}>
                            {chat.title}
                            <ArrowRight size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="quiet project-empty">
                      Choose this project in a chat to link a conversation.
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty-card">
            <FolderClosed size={23} />
            <h2>No projects yet.</h2>
            <p>
              Create a project and assign a conversation from the chat composer. Project names are saved,
              not just displayed.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
