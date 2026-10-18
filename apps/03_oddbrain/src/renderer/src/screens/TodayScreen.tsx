import { Archive, FolderClosed, MessageSquare, NotebookPen } from 'lucide-react'
import type { Workspace } from '../../../shared/workspace'

export function TodayScreen({ data, onChat }: { data: Workspace; onChat: (id: string) => void }) {
  const notes = data.chats
    .flatMap((chat) =>
      chat.messages.map((message) => ({ ...message, chatId: chat.id, chatTitle: chat.title })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8)
  const stats = [
    { label: 'Conversations', value: data.chats.length, Icon: MessageSquare },
    {
      label: 'Saved notes',
      value: data.chats.reduce((count, chat) => count + chat.messages.length, 0),
      Icon: NotebookPen,
    },
    { label: 'Projects', value: data.projects.length, Icon: FolderClosed },
    { label: 'Artifacts', value: data.artifacts.length, Icon: Archive },
  ]
  return (
    <section className="scroll-screen" aria-label="Today" data-find-scroll>
      <div className="screen-content today-content">
        <div className="screen-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>Today</h1>
            <p>What is actually saved here. No activity is inferred.</p>
          </div>
        </div>
        <div className="stat-grid">
          {stats.map(({ label, value, Icon }) => (
            <div className="stat-card" key={label}>
              <Icon size={16} />
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="section-heading">
          <h2>Recent notes</h2>
          <span>{notes.length ? 'From your saved conversations' : 'Nothing saved yet'}</span>
        </div>
        {notes.length ? (
          <ul className="recent-list">
            {notes.map((note) => (
              <li key={note.id}>
                <button type="button" onClick={() => onChat(note.chatId)}>
                  <span>
                    <strong>{note.chatTitle}</strong>
                    <small>
                      {note.text.slice(0, 100)}
                      {note.text.length > 100 ? '…' : ''}
                    </small>
                  </span>
                  <time dateTime={note.at}>{new Date(note.at).toLocaleDateString()}</time>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-card">
            <NotebookPen size={24} />
            <h2>Your day starts here.</h2>
            <p>Create a chat and save a note. It will appear here from your own records.</p>
          </div>
        )}
        <p className="quiet today-footnote">
          Engine work, token use and automation are not connected in this UI-first rebuild.
        </p>
      </div>
    </section>
  )
}
