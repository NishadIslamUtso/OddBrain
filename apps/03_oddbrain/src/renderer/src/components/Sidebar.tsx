import { useEffect, useMemo, useRef, useState } from 'react'
import useProjects from '@/state/projects'
import { PanelLeftClose, PanelLeftOpen, Plus, Search, X } from 'lucide-react'
import type { Chat } from '@shared/types'
import { searchChats } from '@shared/lib/search'
import { initials } from '@shared/lib/profile'
import { Mascot } from '../motion/Mascot'
import { groupChats } from '@/state/useChats'
import { bridge } from '@/platform/bridge'
import usePersistentState from '@/hooks/usePersistentState'
import AppNav, { type View } from './AppNav'

/**
 * The list of conversations, and the app's own sections above them.
 *
 * Search is the search from the shared library: it looks inside message text, not
 * just titles, so a conversation you remember the contents of is reachable even
 * when you do not remember what you called it.
 *
 * Two things here are the person's, not the app's: the sidebar collapses to a
 * strip of icons, and its width can be dragged. Both are remembered, because a
 * layout that resets itself every launch is a layout that was never really
 * theirs. The one exception is on a narrow window: the collapse state is kept as
 * it was, but the grip is only offered while there is room to use it.
 */

const MIN_WIDTH = 200
const MAX_WIDTH = 420
const RAIL_WIDTH = 56

type SidebarPrefs = { collapsed: boolean; width: number }

function normalizePrefs(value: unknown): SidebarPrefs {
  const raw = (value || {}) as Partial<SidebarPrefs>
  const width = Number(raw.width)
  return {
    collapsed: raw.collapsed === true,
    width: Number.isFinite(width) ? Math.min(Math.max(width, MIN_WIDTH), MAX_WIDTH) : 260,
  }
}

export default function Sidebar({
  chats,
  currentChat,
  onOpen,
  onNew,
  onDelete,
  onOpenSettings,
  onOpenMemory,
  profileName,
  /** The chat-row menu's "Move to group" needs the real list. */
  onSetChatProject,
  /** Pin and rename go through the one chat state the app holds — a second
   *  instance here would write its own stale copy over the app's. */
  onPin,
  onRenameChat,
  view,
  onView,
  artifactQuery,
  onArtifactQuery,
  artifactCount,
}: {
  chats: Chat[]
  currentChat: string
  onOpen: (chatId: string) => void
  onNew: () => void
  onDelete: (chatId: string) => void
  /** The profile row at the bottom is the way in to Settings, as in the mockup. */
  onOpenSettings: (section?: 'models' | 'connectors') => void
  /** Browsing Maps: what was read and when, drawn from the vault. */
  onOpenMemory: () => void
  /** The marketplace: apps, extensions, skills — what the app can reach. */
  profileName: string
  onSetChatProject: (chatId: string, projectId: string | null) => void
  onPin: (chatId: string, pinned: boolean) => void
  onRenameChat: (chatId: string, title: string) => void
  /** Which screen is showing, so the sidebar can serve it. */
  view: View
  onView: (view: View) => void
  /** The library's search text — the Artifacts screen owns what it filters. */
  artifactQuery: string
  onArtifactQuery: (value: string) => void
  artifactCount: number
}) {
  const [query, setQuery] = useState('')
  const { projects } = useProjects(true)
  const [prefs, setPrefs] = usePersistentState<SidebarPrefs>('ai-assistant.sidebar', { collapsed: false, width: 260 }, normalizePrefs)
  const [dragging, setDragging] = useState(false)
  const aside = useRef<HTMLElement | null>(null)

  const results = useMemo(() => searchChats(chats, query), [chats, query])
  const groups = useMemo(() => groupChats(chats), [chats])
  const searching = view === 'chat' && query.trim().length > 0
  // One box, two screens: it filters whatever is on show.
  const searchValue = view === 'artifacts' ? artifactQuery : query
  const setSearchValue = view === 'artifacts' ? onArtifactQuery : setQuery
  const placeholder = view === 'artifacts' ? 'Search artifacts' : 'Search'

  // Dragging the edge resizes; the width is written when the drag ends so the
  // storage is not written on every pixel of movement.
  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent): void => {
      const left = aside.current?.getBoundingClientRect().left ?? 0
      const width = Math.min(Math.max(event.clientX - left, MIN_WIDTH), MAX_WIDTH)
      setPrefs(previous => ({ ...previous, width }))
    }
    const stop = (): void => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [dragging, setPrefs])

  if (prefs.collapsed) {
    return (
      <aside
        ref={aside}
        className="flex shrink-0 flex-col items-center gap-1.5 border-r border-line bg-panel py-3"
        style={{ width: RAIL_WIDTH }}
      >
        <button
          type="button"
          onClick={() => setPrefs(previous => ({ ...previous, collapsed: false }))}
          aria-label="Show the sidebar"
          title="Show the sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <PanelLeftOpen size={15} />
        </button>
        <button
          type="button"
          onClick={onNew}
          aria-label="New chat"
          title="New chat"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-[var(--accent-ink)] transition-colors hover:bg-accent/90"
        >
          <Plus size={15} />
        </button>
        {/* Collapsed means conversations only: every other option is hidden. */}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onOpenSettings()}
          aria-label="Settings"
          title="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/25 text-[11px] font-semibold text-brand">
            <span className="relative" title="OddBrain is on this machine">
              {initials(profileName)}
              <span className="absolute -top-3 -right-2" aria-hidden>
                <Mascot role="idle" size={22} seed={3} periodMs={8000} />
              </span>
            </span>
          </span>
        </button>
      </aside>
    )
  }

  return (
    <aside
      ref={aside}
      className="relative flex shrink-0 flex-col border-r border-line bg-panel"
      style={{ width: prefs.width }}
    >
      <div className="flex flex-col gap-1.5 p-2.5">
        <label className="relative block">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={searchValue}
            onChange={event => setSearchValue(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-9 w-full rounded-lg border border-line bg-card pl-8 pr-16 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent/60"
          />
          {searchValue ? (
            <button
              type="button"
              onClick={() => setSearchValue('')}
              aria-label="Clear search"
              className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink"
            >
              <X size={13} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setPrefs(previous => ({ ...previous, collapsed: true }))}
            aria-label="Hide the sidebar"
            title="Hide the sidebar"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <PanelLeftClose size={14} />
          </button>
        </label>

        <button
          type="button"
          onClick={onNew}
          className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent text-[13px] font-medium text-[var(--accent-ink)] transition-colors hover:bg-accent/90"
        >
          <Plus size={15} />
          New chat
        </button>

      </div>

      {/* One scroll: the sections and the conversations share it, so the list
          is always reachable no matter how much sits above it. */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2" aria-label="Conversations">
        <AppNav view={view} onView={onView} artifactCount={artifactCount} />
        {view === 'artifacts' ? (
          <p className="px-1 py-2 text-[12px] leading-relaxed text-muted">
            {artifactCount
              ? 'Search narrows the library. The conversations themselves are on the Chat screen.'
              : 'The library is empty so far. Anything you make in a chat appears on the Artifacts screen.'}
          </p>
        ) : searching ? (
          <SearchResults results={results} currentChat={currentChat} onOpen={onOpen} />
        ) : chats.length === 0 ? (
          <p className="px-1 py-2 text-[12px] leading-relaxed text-muted">
            No conversations yet. Your first one appears here.
          </p>
        ) : (
          groups.map(group => (
            <section key={group.label} className="mb-3">
              <h2 className="px-1 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                {group.label}
              </h2>
              {group.chats.map(chat => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  active={chat.id === currentChat}
                  onOpen={onOpen}
                  onDelete={onDelete}
                  onPin={onPin}
                  onRename={onRenameChat}
                  onSetProject={onSetChatProject}
                  projects={projects}
                />
              ))}
            </section>
          ))
        )}
      </nav>

      <button
        type="button"
        onClick={onOpenMemory}
        aria-label="Browsing Maps"
        title="What was read and when"
        className="flex w-full items-center gap-2.5 border-t border-line px-3 py-2 text-left text-muted hover:bg-white/[0.06] hover:text-ink"
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <circle cx="9" cy="9" r="6" />
          <path d="M6.6 9h4.8M9 6.6v4.8" />
        </svg>
        <span className="text-[12px]">Browsing Maps</span>
      </button>

      <UserMenu
        profileName={profileName}
        onOpenSettings={onOpenSettings}
        onOpenMemory={onOpenMemory}
      />

      {/* The grip on the edge. Invisible until pointed at, so the sidebar does
          not look like it is wearing a handle. */}
      <div
        onPointerDown={event => {
          event.preventDefault()
          setDragging(true)
        }}
        onDoubleClick={() => setPrefs(previous => ({ ...previous, width: 260 }))}
        title="Drag to resize · double-click to reset"
        aria-hidden="true"
        className={`absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors ${
          dragging ? 'bg-accent/60' : 'hover:bg-accent/40'
        }`}
      />
    </aside>
  )
}

function ChatRow({
  chat,
  active,
  onOpen,
  onDelete,
  onPin,
  onRename,
  onSetProject,
  projects,
}: {
  chat: Chat
  active: boolean
  onOpen: (chatId: string) => void
  onDelete: (chatId: string) => void
  onPin: (chatId: string, pinned: boolean) => void
  onRename: (chatId: string, title: string) => void
  onSetProject: (chatId: string, projectId: string | null) => void
  projects: Array<{ id: string; name: string }>
}) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(chat.title)
  const [projectMenu, setProjectMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menu) return
    const dismiss = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenu(false)
        setProjectMenu(false)
      }
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenu(false)
        setProjectMenu(false)
      }
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('keydown', key)
    }
  }, [menu])

  const commitRename = (): void => {
    if (draft.trim()) onRename(chat.id, draft.trim())
    setRenaming(false)
  }

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commitRename}
        onKeyDown={event => {
          if (event.key === 'Enter') commitRename()
          if (event.key === 'Escape') setRenaming(false)
        }}
        aria-label="Rename the conversation"
        className="w-full rounded-lg border border-accent/60 bg-card px-2 py-1.5 text-[12.5px] text-ink outline-none"
      />
    )
  }

  return (
    <div className="relative">
      <div
        className={`group flex items-center gap-1 rounded-lg pr-0.5 ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
        onContextMenu={event => {
          event.preventDefault()
          setMenu(true)
        }}
      >
        <button
          type="button"
          onClick={() => onOpen(chat.id)}
          title={chat.title}
          className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[12.5px] ${active ? 'text-ink' : 'text-muted group-hover:text-ink'}`}
        >
          {chat.pinned ? <PinMark /> : null}
          {chat.title}
        </button>
        <button
          type="button"
          aria-label={`Options for ${chat.title}`}
          aria-haspopup="menu"
          onClick={() => setMenu(value => !value)}
          className={`rounded p-1 text-muted transition-opacity hover:text-ink focus:opacity-100 ${
            menu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Kebab />
        </button>
      </div>

      {menu ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Options for ${chat.title}`}
          className="absolute left-2 right-2 z-30 rounded-lg border border-line bg-card p-1 shadow-xl"
        >
          {projectMenu ? (
            <div role="menu" aria-label="Move to group">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetProject(chat.id, null)
                  setMenu(false)
                  setProjectMenu(false)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-muted hover:bg-white/[0.06] hover:text-ink"
              >
                No project
              </button>
              {projects.map(project => (
                <button
                  key={project.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSetProject(chat.id, project.id)
                    setMenu(false)
                    setProjectMenu(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-muted hover:bg-white/[0.06] hover:text-ink"
                >
                  {project.name}
                </button>
              ))}
              {projects.length === 0 ? (
                <p className="px-2 py-1.5 text-[11.5px] text-muted">No projects yet, make one on the Projects screen.</p>
              ) : null}
            </div>
          ) : (
            <>
              <MenuItem
                label={chat.pinned ? 'Unpin' : 'Pin'}
                hint="P"
                onClick={() => {
                  onPin(chat.id, !chat.pinned)
                  setMenu(false)
                }}
              />
              <MenuItem
                label="Rename"
                hint="R"
                onClick={() => {
                  setDraft(chat.title)
                  setRenaming(true)
                  setMenu(false)
                }}
              />
              <MenuItem
                label="Move to group"
                arrow
                onClick={() => setProjectMenu(true)}
              />
              <div className="my-0.5 border-t border-line" />
              <MenuItem
                label="Delete"
                hint="D"
                danger
                onClick={() => {
                  setMenu(false)
                  onDelete(chat.id)
                }}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function MenuItem({
  label,
  hint,
  arrow,
  danger,
  onClick,
}: {
  label: string
  hint?: string
  arrow?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${
        danger ? 'text-warn hover:bg-warn/10' : 'text-muted hover:bg-white/[0.06] hover:text-ink'
      }`}
    >
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-[10.5px] text-muted/70">{hint}</span> : null}
      {arrow ? <span className="text-[10.5px] text-muted/70">›</span> : null}
    </button>
  )
}

function PinMark() {
  return (
    <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="mr-1 inline-block align-[-1px] text-accent">
      <path d="M10 1.5 12 8l6.5 2-6.5 2-2 6.5-2-6.5L1.5 10 8 8z" />
    </svg>
  )
}

function Kebab() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <circle cx="10" cy="4" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="10" cy="16" r="1.6" />
    </svg>
  )
}

function SearchResults({
  results,
  currentChat,
  onOpen,
}: {
  results: ReturnType<typeof searchChats>
  currentChat: string
  onOpen: (chatId: string) => void
}) {
  if (!results.length) {
    return <p className="px-1 py-2 text-[12px] text-muted">Nothing said that matches.</p>
  }
  return (
    <div className="mb-3">
      <h2 className="px-1 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        Matches
      </h2>
      {results.map(result => (
        <button
          key={result.chat.id}
          type="button"
          onClick={() => onOpen(result.chat.id)}
          className={`mb-1 block w-full rounded-lg px-2 py-1.5 text-left ${
            result.chat.id === currentChat ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
          }`}
        >
          <span className="block truncate text-[13px] text-ink">{result.chat.title}</span>
          {result.matches[0] && (
            <span className="mt-0.5 block truncate text-[11px] text-muted">
              {result.matches[0].role === 'user' ? 'You: ' : ''}
              {result.matches[0].snippet}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}


/**
 * The user menu, as the approved 191608 screen shows it — adapted to what is
 * honestly true here: there is no account and no plan, so there is nothing to
 * log out of and nothing to upgrade. Everything in the menu opens a real
 * thing, and every one of them is local.
 */
function UserMenu({
  profileName,
  onOpenSettings,
  onOpenMemory,
}: {
  profileName: string
  onOpenSettings: (section?: 'models' | 'connectors') => void
  onOpenMemory: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    // Escape closes, like every other menu in the app — leaving it open traps
    // the corner of the screen it covers.
    const dismiss = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const away = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', dismiss)
    window.addEventListener('pointerdown', away)
    return () => {
      window.removeEventListener('keydown', dismiss)
      window.removeEventListener('pointerdown', away)
    }
  }, [open])
  return (
    <div className="relative border-t border-line" ref={ref}>
      {open ? (
        <div role="menu" aria-label="Account" className="absolute bottom-[52px] left-2 right-2 z-30 rounded-lg border border-line bg-card p-1 shadow-xl">
          <p className="truncate px-2 pb-1 pt-1.5 text-[11px] text-muted">This machine · everything local</p>
          <UserMenuItem label="Settings" hint="Ctrl+," onClick={() => { setOpen(false); onOpenSettings() }} />
          <UserMenuItem label="Get API keys" onClick={() => { setOpen(false); onOpenSettings('models') }} />
          <UserMenuItem label="Install apps and extensions" onClick={() => { setOpen(false); onOpenSettings('connectors') }} />
          <UserMenuItem label="Browsing Maps" onClick={() => { setOpen(false); onOpenMemory() }} />
          <div className="my-0.5 border-t border-line" />
          <UserMenuItem
            label="Learn more"
            onClick={() => { setOpen(false); void bridge.app?.openExternal?.('https://github.com/NishadIslamUtso/OddBrain') }}
          />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 p-2.5 text-left hover:bg-white/[0.06]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/25 text-[12px] font-semibold text-brand">
          {initials(profileName)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]">{profileName}</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted">Local</span>
      </button>
    </div>
  )
}

function UserMenuItem({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-muted hover:bg-white/[0.06] hover:text-ink"
    >
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-[10.5px] text-muted/70">{hint}</span> : null}
    </button>
  )
}
