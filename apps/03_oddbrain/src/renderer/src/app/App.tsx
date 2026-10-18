import { useCallback, useEffect, useRef, useState } from 'react'
import { Code2, X } from 'lucide-react'
import type { VaultReply } from '../../../shared/desktop'
import { DEFAULT_APPEARANCE, newChat } from '../../../shared/workspace'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import { useWorkspace, newId, now } from '../data/useWorkspace'
import { client, isDesktop } from '../data/client'
import { ArtifactsScreen } from '../screens/ArtifactsScreen'
import { BrainScreen } from '../screens/BrainScreen'
import { ChatScreen } from '../screens/ChatScreen'
import { ProjectsScreen } from '../screens/ProjectsScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { TodayScreen } from '../screens/TodayScreen'
import { VaultScreen } from '../screens/VaultScreen'
import type { Page } from './types'

type Location = { page: Page; chatId: string | null; settings: boolean }
const home: Location = { page: 'chat', chatId: null, settings: false }
const locationKey = (value: Location): string => `${value.settings}:${value.page}:${value.chatId || ''}`
function useNavigation() {
  const [location, setLocation] = useState<Location>(home)
  const back = useRef<Location[]>([]),
    forward = useRef<Location[]>([])
  const [revision, setRevision] = useState(0)
  const navigate = (next: Location): void => {
    if (locationKey(location) === locationKey(next)) return
    back.current.push(location)
    if (back.current.length > 64) back.current.shift()
    forward.current = []
    setLocation(next)
    setRevision((value) => value + 1)
  }
  const goBack = (): void => {
    const previous = back.current.pop()
    if (!previous) return
    forward.current.push(location)
    setLocation(previous)
    setRevision((value) => value + 1)
  }
  const goForward = (): void => {
    const next = forward.current.pop()
    if (!next) return
    back.current.push(location)
    setLocation(next)
    setRevision((value) => value + 1)
  }
  void revision
  return {
    location,
    navigate,
    goBack,
    goForward,
    canBack: back.current.length > 0,
    canForward: forward.current.length > 0,
  }
}

export default function App() {
  const workspace = useWorkspace()
  const nav = useNavigation()
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [vault, setVault] = useState<VaultReply>({
    ok: false,
    error: isDesktop()
      ? 'Choose a folder to read notes.'
      : 'The browser preview cannot read files from your machine.',
  })
  const data = workspace.snapshot?.data
  const appearance = data?.appearance || DEFAULT_APPEARANCE
  const refreshVault = useCallback(async (): Promise<void> => {
    try {
      setVault(await client().vault.list())
    } catch (failure) {
      setVault({ ok: false, error: (failure as Error).message || 'The folder could not be read.' })
    }
  }, [])
  const chooseVault = async (): Promise<void> => {
    try {
      const reply = await client().vault.choose()
      if (!reply.ok && reply.canceled) return
      setVault(reply)
      if (reply.ok) setNotice('Reading the selected folder. No notes were modified.')
    } catch (failure) {
      setVault({ ok: false, error: (failure as Error).message })
    }
  }
  useEffect(() => {
    if (isDesktop()) void refreshVault()
  }, [refreshVault])
  useEffect(() => {
    document.documentElement.dataset.theme = appearance.theme
    document.documentElement.dataset.accent = appearance.accent
    document.documentElement.dataset.motion = appearance.motion
  }, [appearance.theme, appearance.accent, appearance.motion])
  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => setNotice(''), 6500)
    return () => clearTimeout(timeout)
  }, [notice])
  const open = (page: Page, chatId: string | null = nav.location.chatId): void => {
    nav.navigate({ page, chatId, settings: false })
    setSidebarOpen(false)
  }
  const newConversation = async (): Promise<void> => {
    const id = newId(),
      added = await workspace.update((before) => newChat(before, id, now()))
    if (added) open('chat', id)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        if (event.key === 'Escape') setSidebarOpen(false)
        return
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('input[aria-label="Search conversations"]')?.focus()
        setSidebarOpen(true)
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void newConversation()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const activeChat = data?.chats.find((chat) => chat.id === nav.location.chatId) || null
  const vaultFolder = vault.ok ? vault.folder : ''
  if (workspace.loading && !data)
    return (
      <div className="loading-screen" role="status">
        Opening your local workspace…
      </div>
    )
  if (!data || !workspace.snapshot)
    return (
      <div className="load-failure" role="alert">
        <h1>Your workspace could not be opened.</h1>
        <p>{workspace.error || 'It was not changed.'}</p>
        <button className="outline-button" type="button" onClick={() => void workspace.reload()}>
          Try again
        </button>
        <p>Nothing was replaced. Your existing records remain where they were.</p>
      </div>
    )
  return (
    <div className="app-shell" data-app-ready>
      <Header
        page={nav.location.page}
        settingsOpen={nav.location.settings}
        canBack={nav.canBack}
        canForward={nav.canForward}
        vaultFolder={vaultFolder}
        browser={!isDesktop()}
        onBack={nav.goBack}
        onForward={nav.goForward}
        onMenu={() => setSidebarOpen(true)}
        onSettings={() => nav.navigate({ ...nav.location, settings: true })}
      />
      <div className="app-body">
        <div className={sidebarOpen ? 'sidebar-wrap open' : 'sidebar-wrap'}>
          <Sidebar
            page={nav.location.page}
            chats={data.chats}
            activeChat={activeChat?.id || null}
            search={search}
            onSearch={setSearch}
            onNav={(page) => open(page)}
            onChat={(id) => open('chat', id)}
            onNewChat={() => void newConversation()}
            onSettings={() => {
              nav.navigate({ ...nav.location, settings: true })
              setSidebarOpen(false)
            }}
            settingsOpen={nav.location.settings}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="sidebar-scrim"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <main className="main-panel">
          {nav.location.settings ? (
            <SettingsScreen
              data={data}
              location={workspace.snapshot.location}
              vault={vault}
              update={workspace.update}
              close={() => nav.goBack()}
              notice={setNotice}
            />
          ) : nav.location.page === 'chat' ? (
            <ChatScreen
              chat={activeChat}
              data={data}
              update={workspace.update}
              onOpen={(id) => open('chat', id)}
              notice={setNotice}
            />
          ) : nav.location.page === 'artifacts' ? (
            <ArtifactsScreen data={data} update={workspace.update} notice={setNotice} />
          ) : nav.location.page === 'projects' ? (
            <ProjectsScreen
              data={data}
              update={workspace.update}
              notice={setNotice}
              onChat={(id) => open('chat', id)}
            />
          ) : nav.location.page === 'today' ? (
            <TodayScreen data={data} onChat={(id) => open('chat', id)} />
          ) : nav.location.page === 'vault' ? (
            <VaultScreen vault={vault} desktop={isDesktop()} choose={chooseVault} refresh={refreshVault} />
          ) : nav.location.page === 'brain' ? (
            <BrainScreen vault={vault} choose={chooseVault} desktop={isDesktop()} />
          ) : (
            <section className="scroll-screen" data-find-scroll>
              <div className="screen-content">
                <h1>Code</h1>
                <div className="empty-card">
                  <Code2 size={22} />
                  <h2>Code workspace not connected yet.</h2>
                  <p>
                    File browsing and engine edits will return behind the desktop approval boundary. Nothing
                    has been opened or changed.
                  </p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
      {notice || workspace.error ? (
        <div className="notice-stack" role="status">
          {workspace.error ? (
            <div className="notice error">
              {workspace.error}
              <button type="button" onClick={workspace.clearError} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="notice">
              {notice}
              <button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice">
                <X size={14} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
