import {
  Archive,
  Brain,
  Code2,
  FolderClosed,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import type { Chat } from '../../../shared/workspace'
import type { Page } from '../app/types'

const links = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'artifacts', label: 'Artifacts', Icon: Archive },
  { id: 'today', label: 'Today', Icon: Sparkles },
  { id: 'projects', label: 'Projects', Icon: FolderClosed },
  { id: 'vault', label: 'Vault', Icon: LayoutDashboard },
  { id: 'brain', label: 'Brain', Icon: Brain },
  { id: 'code', label: 'Code', Icon: Code2 },
] as const

export function Sidebar({
  page,
  chats,
  activeChat,
  search,
  onSearch,
  onNav,
  onChat,
  onNewChat,
  onSettings,
  settingsOpen,
  onClose,
}: {
  page: Page
  chats: Chat[]
  activeChat: string | null
  search: string
  onSearch: (next: string) => void
  onNav: (page: Page) => void
  onChat: (id: string) => void
  onNewChat: () => void
  onSettings: () => void
  settingsOpen: boolean
  onClose?: () => void
}) {
  const matches = chats
    .filter((chat) =>
      `${chat.title} ${chat.messages.map((message) => message.text).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 80)
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-top">
        <div className="search-field">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="Search conversations"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search"
          />
          {search ? (
            <button type="button" aria-label="Clear search" onClick={() => onSearch('')}>
              <X size={14} />
            </button>
          ) : (
            <kbd>Ctrl/⌘ K</kbd>
          )}
        </div>
        <button className="new-chat" type="button" onClick={onNewChat}>
          <Plus size={16} /> New chat
        </button>
        <nav className="nav-list" aria-label="Screens">
          {links.map(({ id, label, Icon }) => (
            <button
              type="button"
              key={id}
              aria-current={!settingsOpen && page === id ? 'page' : undefined}
              onClick={() => onNav(id)}
            >
              <Icon size={15} strokeWidth={1.7} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="sidebar-chats">
        <div className="eyebrow">{search ? 'MATCHING CHATS' : 'RECENT'}</div>
        {matches.length ? (
          matches.map((chat) => (
            <button
              type="button"
              key={chat.id}
              className={`chat-link ${activeChat === chat.id && page === 'chat' && !settingsOpen ? 'active' : ''}`}
              onClick={() => onChat(chat.id)}
              title={chat.title}
            >
              {chat.title}
            </button>
          ))
        ) : (
          <p className="quiet sidebar-empty">
            {search ? 'No conversations match.' : 'No conversations yet. Your first one appears here.'}
          </p>
        )}
      </div>
      <div className="sidebar-bottom">
        <button
          className="sidebar-settings"
          aria-current={settingsOpen ? 'page' : undefined}
          type="button"
          onClick={onSettings}
        >
          <Settings2 size={15} /> Settings
        </button>
        <button className="profile" type="button" onClick={onSettings}>
          <span className="avatar">OB</span>
          <span>OddBrain</span>
          <span className="profile-pill">Local</span>
        </button>
      </div>
      {onClose ? (
        <button className="sidebar-close" type="button" aria-label="Close menu" onClick={onClose}>
          <X size={18} />
        </button>
      ) : null}
    </aside>
  )
}
