import { useEffect, useState } from 'react'
import { ArrowUp, Check, Copy, FolderClosed, Pencil, Save } from 'lucide-react'
import type { Chat, Workspace } from '../../../shared/workspace'
import { newChat, renameChat, saveNote } from '../../../shared/workspace'
import { Mascot } from '../components/Mascot'
import { newId, now } from '../data/useWorkspace'

type Props = {
  chat: Chat | null
  data: Workspace
  update: (change: (data: Workspace) => Workspace) => Promise<boolean>
  onOpen: (id: string) => void
  notice: (text: string) => void
}
const suggestions = [
  'A thought I want to keep',
  'An idea for my next project',
  'A question to revisit later',
]
function greeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'Morning, friend.' : hour < 17 ? 'Afternoon, friend.' : 'Evening, friend.'
}

export function ChatScreen({ chat, data, update, onOpen, notice }: Props) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [copyFallback, setCopyFallback] = useState('')
  useEffect(() => {
    setEditing(false)
    setTitle(chat?.title || '')
    setCopyFallback('')
  }, [chat?.id, chat?.title])
  const save = async (): Promise<void> => {
    const text = draft.trim()
    if (!text) return
    const chatId = chat?.id || newId(),
      noteId = newId(),
      at = now()
    const ok = await update((before) =>
      saveNote(chat ? before : newChat(before, chatId, at), chatId, noteId, text, at),
    )
    if (ok) {
      setDraft('')
      onOpen(chatId)
      notice('Saved as your note. No engine request was sent.')
    }
  }
  const copy = async (id: string, text: string): Promise<void> => {
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard not available')
      await navigator.clipboard.writeText(text)
      setCopyFallback('')
      notice('Note copied.')
    } catch {
      setCopyFallback(id)
      notice('Clipboard blocked. Select the text shown under the note.')
    }
  }
  return (
    <section className="chat-screen" aria-label="Chat workspace">
      <div className="chat-scroll" data-find-scroll>
        {chat?.messages.length ? (
          <div className="transcript">
            <div className="transcript-heading">
              {editing ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void update((before) => renameChat(before, chat.id, title, now())).then((ok) => {
                      if (ok) setEditing(false)
                    })
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Chat title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <button type="submit">Save title</button>
                </form>
              ) : (
                <h1>
                  {chat.title}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Rename chat"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={14} />
                  </button>
                </h1>
              )}
            </div>
            {chat.messages.map((message) => (
              <article className="note-row" key={message.id}>
                <div className="note-meta">
                  <span className="note-avatar">You</span>
                  <strong>Saved note</strong>
                  <time dateTime={message.at}>{new Date(message.at).toLocaleString()}</time>
                </div>
                <p>{message.text}</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void copy(message.id, message.text)}
                >
                  <Copy size={13} /> Copy note
                </button>
                {copyFallback === message.id ? (
                  <textarea
                    className="copy-fallback"
                    readOnly
                    aria-label="Original note to copy"
                    value={message.text}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                ) : null}
              </article>
            ))}
            <div className="no-reply">
              Engine replies are not connected in this rebuild. These are your own saved notes, not
              generated answers.
            </div>
          </div>
        ) : (
          <div className="hero">
            <Mascot still={data.appearance.motion === 'still'} size={124} />
            <div className="mascot-caption">Here with you</div>
            <h1>{greeting()}</h1>
            <p className="hero-subtitle">What would you like to keep?</p>
            <p className="hero-explainer">
              Your notes stay in this workspace. Engine replies are not connected yet; nothing is sent to a
              model.
            </p>
            <div className="suggestions">
              {suggestions.map((item) => (
                <button type="button" key={item} onClick={() => setDraft(item)}>
                  {item}
                  <ArrowUp size={13} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className={`composer-host width-${data.appearance.width}`}>
        <div className="composer">
          <textarea
            aria-label="Write a note"
            placeholder="Write a note…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void save()
              }
            }}
            rows={2}
          />
          <div className="composer-footer">
            <div className="composer-left">
              <FolderClosed size={14} />
              <select
                aria-label="Chat project"
                value={chat?.projectId || ''}
                disabled={!chat}
                onChange={(event) => {
                  const id = event.target.value || null
                  if (chat)
                    void update((before) => ({
                      ...before,
                      chats: before.chats.map((entry) =>
                        entry.id === chat.id ? { ...entry, projectId: id } : entry,
                      ),
                    }))
                }}
              >
                <option value="">No project</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <span className="composer-hint">Ctrl/⌘ Enter to save</span>
            </div>
            <div className="composer-right">
              <span className="engine-state">
                <span className="chip-muted" /> No engine connected
              </span>
              <button
                className="primary-small"
                type="button"
                disabled={!draft.trim()}
                onClick={() => void save()}
              >
                <Save size={14} /> Save note <Check size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
