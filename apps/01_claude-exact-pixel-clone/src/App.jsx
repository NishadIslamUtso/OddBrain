import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderClosed, Plus, X, ArrowLeft } from 'lucide-react'
import Sidebar from './components/Sidebar.jsx'
import Center from './components/Center.jsx'
import VaultPanel from './components/VaultPanel.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import AppsExtensionsModal from './components/AppsExtensionsModal.jsx'
import ArtifactPanel from './components/ArtifactPanel.jsx'
import ArtifactsLibrary from './components/ArtifactsLibrary.jsx'
import TitleBar from './components/TitleBar.jsx'
import TodayView from './components/TodayView.jsx'
import SubAgentPanel from './components/SubAgentPanel.jsx'
import Dialog from './components/Dialog.jsx'
import usePersistentState from './hooks/usePersistentState.js'
import useModels from './hooks/useModels.js'
import useChat from './hooks/useChat.js'
import useVisionBridge from './hooks/useVisionBridge.js'
import useSubAgents from './hooks/useSubAgents.js'
import { DEFAULT_CHATS, DEFAULT_MODEL, DEFAULT_SETTINGS, newId, normalizeChats, normalizeSettings } from './lib/storage.js'
import { capsuleText, vaultGet } from './lib/vault.js'
import { DEFAULT_PROFILE, normalizeProfile } from './lib/profile.js'
import { DEFAULT_PROFILE_ID, resolveInference } from './lib/inference.js'

function ProjectsView({ projects, chats, onCreate, onOpen, focused, onBack, onChat, onNew }) {
  if (focused) return <main className="library-view"><button className="back-button" onClick={onBack}><ArrowLeft size={14} />Projects</button><header><h1>{focused.name}</h1><button className="secondary-button" onClick={() => onNew(focused.id)}><Plus size={15} />New chat</button></header><div className="project-chat-list">{chats.filter(chat => chat.projectId === focused.id).map(chat => <button key={chat.id} onClick={() => onChat(chat.id)}>{chat.title}</button>)}</div>{!chats.some(chat => chat.projectId === focused.id) && <p className="library-description">No chats in this project yet.</p>}</main>
  return <main className="library-view"><header><div><FolderClosed size={27} /><h1>Projects</h1></div><button className="secondary-button" onClick={onCreate}><Plus size={15} />New project</button></header><p className="library-description">Organize local chats by project. Project grouping is local; no cloud workspace is created.</p><div className="project-grid">{projects.map(project => <button key={project.id} onClick={() => onOpen(project.id)}><FolderClosed size={24} /><strong>{project.name}</strong><small>{chats.filter(chat => chat.projectId === project.id).length} chats</small></button>)}</div>{!projects.length && <div className="library-empty"><FolderClosed size={36} /><h2>A place for your projects</h2><p>Create a project, then add chats from their context menu or the composer.</p></div>}</main>
}
function ActionDialog({ action, projects, onClose, onApply }) {
  const [name, setName] = useState(action.chat?.title || '')
  const titles = { rename: 'Rename chat', delete: 'Delete chat?', project: 'Add to project', group: 'Move to group', createProject: 'New project' }
  return <Dialog title={titles[action.type]} onClose={onClose} className="small-dialog" labelledBy="action-title"><div className="action-dialog-body">
    {['rename', 'createProject'].includes(action.type) && <form onSubmit={event => { event.preventDefault(); if (name.trim()) onApply(name.trim()) }}><label>{action.type === 'rename' ? 'Chat name' : 'Project name'}<input aria-label={action.type === 'rename' ? 'Chat name' : 'Project name'} value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label><footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="white-button" disabled={!name.trim()}>Save</button></footer></form>}
    {action.type === 'delete' && <><p>This removes the chat from this browser only. Original vault sources and their attachments are kept; deleting those requires a separate action.</p><footer><button className="secondary-button" onClick={onClose}>Cancel</button><button className="danger-button" onClick={() => onApply()}>Delete local chat</button></footer></>}
    {action.type === 'project' && <div className="action-options"><button onClick={() => onApply(null)}>No project</button>{projects.map(project => <button key={project.id} onClick={() => onApply(project.id)}>{project.name}</button>)}{!projects.length && <p>Create a project from Projects in the sidebar first.</p>}</div>}
    {action.type === 'group' && <div className="action-options">{['Today', 'Oct 8', 'Older'].map(group => <button key={group} onClick={() => onApply(group)}>{group}</button>)}</div>}
  </div></Dialog>
}
export default function App() {
  const [notice, setNotice] = useState('')
  const notify = useCallback(message => setNotice(message), [])
  const [chats, setChats] = usePersistentState('claude_exact_chats', DEFAULT_CHATS, normalizeChats, notify)
  // Whoever is using the app. Neutral defaults so a fresh clone makes sense.
  const [profile, setProfile] = usePersistentState('ai_assistant_profile', DEFAULT_PROFILE, normalizeProfile, notify)
  // Memory profile for the local model. Defaults to 4 GB VRAM because that is
  // the target machine, and a wrong guess there means a machine that crawls.
  const [inference, setInference] = usePersistentState('ai_assistant_inference', { profile: DEFAULT_PROFILE_ID }, resolveInference, notify)
  const [settings, setSettings] = usePersistentState('claude_exact_settings', DEFAULT_SETTINGS, normalizeSettings, notify)
  const [model, setModel] = usePersistentState('claude_exact_model', DEFAULT_MODEL, value => typeof value === 'string' ? value : DEFAULT_MODEL, notify)
  const [projects, setProjects] = usePersistentState('claude_exact_projects', [], value => Array.isArray(value) ? value.filter(project => typeof project?.id === 'string' && typeof project?.name === 'string') : [], notify)
  const [imports, setImports] = usePersistentState('claude_exact_artifacts', [], value => Array.isArray(value) ? value.filter(artifact => typeof artifact?.id === 'string' && Array.isArray(artifact.versions) && artifact.versions.length) : [], notify)
  const [currentChat, setCurrentChat] = useState(() => new URLSearchParams(window.location.search).get('chat'))
  const [view, setView] = useState('chat')
  const [rightPanel, setRightPanel] = useState(null)
  const [activeArtifact, setActiveArtifact] = useState(null)
  const [modal, setModal] = useState(null)
  const [action, setAction] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [projectId, setProjectId] = useState(null)
  const [focusedProject, setFocusedProject] = useState(null)
  const [draftNonce, setDraftNonce] = useState(0)
  const [contextBundle, setContextBundle] = useState(null)
  const [previewContext, setPreviewContext] = useState(null)
  const [today, setToday] = useState(false)
  const [seed, setSeed] = useState({ text: '', n: 0 })
  const [vaultOk, setVaultOk] = useState(false)
  const [vaultPath, setVaultPath] = useState('')
  const [externalLink, setExternalLink] = useState(null)
  const [visionModel, setVisionModel] = usePersistentState('claude_exact_vision_model', '', value => typeof value === 'string' ? value : '', notify)
  const models = useModels(model, setModel)
  const vision = useVisionBridge({ models: models.models, status: models.status, selected: model, preferred: visionModel })
  const subAgents = useSubAgents({ models, notify, inference })
  const autoOpenedLive = useRef('')
  const chat = chats.find(item => item.id === currentChat)
  const navigate = useCallback(id => {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('chat', id); else url.searchParams.delete('chat')
    window.history.pushState({}, '', url)
    setCurrentChat(id); setView('chat'); setContextBundle(null); setProjectId(null)
  }, [])
  const chatRuntime = useChat({ chats, setChats, currentChat, navigate, models, vision, notify, inference })
  const liveArtifacts = chatRuntime.live.artifacts
  // Cherry Studio's TopicBranchPanel, translated: instead of a bare "this is a
  // branch" label, every chat that shares a root is listed so you can jump
  // between paths through the same conversation.
  const branchFamily = useMemo(() => {
    if (!chat) return []
    const byId = new Map(chats.map(item => [item.id, item]))
    const rootOf = id => {
      let current = byId.get(id), guard = 0
      while (current?.branchedFrom && guard < 50) { current = byId.get(current.branchedFrom.chatId); guard += 1 }
      return current?.id
    }
    const root = rootOf(chat.id)
    if (!root) return []
    return chats
      .filter(item => rootOf(item.id) === root)
      .map(item => ({ id: item.id, title: item.title, isRoot: item.id === root, messages: item.messages.length }))
      .sort((a, b) => Number(b.isRoot) - Number(a.isRoot))
  }, [chat, chats])

  const artifacts = useMemo(() => {
    const saved = [...imports, ...chats.flatMap(chat => chat.messages.flatMap(message => message.artifacts || []))]
    const known = new Set(saved.map(item => item.id))
    // A half-written artifact is openable immediately; once the reply finishes
    // the saved version replaces it under the same id.
    return [...saved, ...liveArtifacts.filter(item => !known.has(item.id))]
  }, [imports, chats, liveArtifacts])
  const artifact = artifacts.find(item => item.id === activeArtifact)
  const artifactLive = liveArtifacts.some(item => item.id === activeArtifact)
  useEffect(() => {
    const onPop = () => { setCurrentChat(new URLSearchParams(window.location.search).get('chat')); setView('chat'); setContextBundle(null) }
    window.addEventListener('popstate', onPop)
    const onKey = event => { if ((event.ctrlKey || event.metaKey) && event.key === ',' && !document.querySelector('[role="dialog"]')) { event.preventDefault(); setModal('settings') } }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey) }
  }, [])
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { root.dataset.theme = settings.theme === 'system' ? media.matches ? 'dark' : 'light' : settings.theme }
    apply(); media.addEventListener('change', apply)
    root.dataset.motion = settings.motion.toLowerCase()
    root.style.setProperty('--transcript-font', settings.chatFont === 'System' ? '"Segoe UI", Arial, sans-serif' : settings.chatFont === 'Monospace' ? 'Consolas, monospace' : 'Georgia, "Times New Roman", serif')
    root.style.setProperty('--transcript-size', `${({ Small: 14, Medium: 16, Large: 18 })[settings.transcriptSize]}px`)
    root.style.setProperty('--transcript-width', `${({ Narrow: 588, Medium: 768, Wide: 960 })[settings.transcriptWidth]}px`)
    return () => media.removeEventListener('change', apply)
  }, [settings])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 15_000); return () => clearTimeout(timer) }, [notice])
  // The live preview is the point of streaming an app: open it as soon as the
  // model commits to a document, once per reply, and never fight the user.
  useEffect(() => {
    const first = liveArtifacts[0]
    if (!first || autoOpenedLive.current === chatRuntime.live.messageId) return
    autoOpenedLive.current = chatRuntime.live.messageId
    setActiveArtifact(first.id)
    setRightPanel('artifact')
  }, [liveArtifacts, chatRuntime.live.messageId])
  useEffect(() => {
    let alive = true
    const check = () => vaultGet('/status').then(data => {
      if (!alive) return
      setVaultOk(data?.ok === true)
      if (typeof data?.vault === 'string') setVaultPath(data.vault)
    }).catch(() => { if (alive) { setVaultOk(false); setVaultPath('') } })
    check()
    const timer = setInterval(check, 15_000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  useEffect(() => {
    const onKey = event => {
      if (event.altKey && (event.key === 't' || event.key === 'T')) { event.preventDefault(); setToday(value => !value) }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'G' || event.key === 'g')) {
        event.preventDefault(); setRightPanel(panel => panel === 'agents' ? null : 'agents')
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'A' || event.key === 'a')) {
        event.preventDefault(); setView(current => current === 'artifacts' ? 'chat' : 'artifacts')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  function titleAction(id) {
    switch (id) {
      case 'new-chat': newChat(); break
      case 'new-project': setAction({ type: 'createProject' }); break
      case 'today': setToday(true); break
      case 'toggle-sidebar': setCollapsed(!collapsed); break
      case 'toggle-artifacts': setView(view === 'artifacts' ? 'chat' : 'artifacts'); break
      case 'toggle-vault': setRightPanel(rightPanel === 'vault' ? null : 'vault'); break
      case 'toggle-agents': setRightPanel(rightPanel === 'agents' ? null : 'agents'); break
      case 'search-chats': notify('Use the search field at the top of the sidebar to filter your chats.'); break
      case 'save-artifact': if (rightPanel === 'artifact' && artifact) notify('Use Save in the artifact panel to store a new version locally.'); else notify('No artifact is open. Open one from the Artifacts view first.'); break
      case 'open-vault': notify(vaultPath ? `Vault folder: ${vaultPath}` : 'The vault API is offline, so the vault path is unavailable.'); break
      case 'clear-chat': if (chat) chatAction('delete', chat); else notify('No chat is open.'); break
      case 'reload': window.location.reload(); break
      case 'close': window.close(); break
      case 'docs': setModal('apps'); break
      case 'ollama-status': models.refresh(); notify(models.status === 'online' ? 'Ollama is reachable on 127.0.0.1:11434.' : 'Ollama is not reachable. Start the existing Ollama installation; no model download is needed.'); break
      case 'vault-status': notify(vaultOk ? `Vault API is online${vaultPath ? ` at ${vaultPath}` : ''}.` : 'Vault API is offline on 127.0.0.1:8765.'); break
      case 'about': notify('AI ASSistant — local Ollama model, canonical Markdown vault, no cloud calls.'); break
      default: break // Undo/redo/cut/copy/paste/back/forward/latest are shown disabled in the menu
    }
  }
  function newChat(project = null) { navigate(null); setProjectId(project); setDraftNonce(value => value + 1) }
  function openArtifact(id) { setActiveArtifact(id); setRightPanel('artifact') }
  function branchFrom(messageId) {
    const id = chatRuntime.branch(currentChat, messageId)
    if (!id) { notify('That message could not be branched from. The chat is unchanged.'); return }
    navigate(id)
    notify('Branched into a new chat from that message. The original chat is untouched.')
  }
  function insertFromAgent(text) { setSeed(previous => ({ text, n: previous.n + 1 })); setView('chat') }
  function chatAction(type, item) {
    if (type === 'open') { const url = new URL(window.location.href); url.searchParams.set('chat', item.id); window.open(url, '_blank', 'noopener,noreferrer'); return }
    if (type === 'pin') { setChats(previous => previous.map(chat => chat.id === item.id ? { ...chat, pinned: !chat.pinned } : chat)); return }
    setAction({ type, chat: item })
  }
  function applyAction(value) {
    if (action.type === 'createProject') setProjects(previous => [...previous, { id: newId(), name: value }])
    else if (action.type === 'delete') { setChats(previous => previous.filter(chat => chat.id !== action.chat.id)); if (currentChat === action.chat.id) newChat() }
    else setChats(previous => previous.map(chat => chat.id !== action.chat.id ? chat : { ...chat, ...(action.type === 'rename' ? { title: value } : action.type === 'project' ? { projectId: value } : { date: value }) }))
    setAction(null)
  }
  function selectProject(id) {
    setProjectId(id)
    if (chat) setChats(previous => previous.map(item => item.id === chat.id ? { ...item, projectId: id } : item))
  }
  function previewCapsule(capsule) {
    const content = capsuleText(capsule)
    if (!content.trim() || content.length > 12_000) { notify('This capsule is empty or exceeds 12,000 characters. Choose a smaller context bundle; nothing has been injected.'); return }
    setPreviewContext({ ...capsule, content })
  }
  async function cook(prompt) {
    try {
      const data = await vaultGet(`/context?q=${encodeURIComponent(prompt.slice(-400))}`)
      const items = [...(data.capsules || []), ...(data.entities || [])]
      if (!items.length) { notify('No relevant local vault context found. Your prompt is unchanged.'); return }
      previewCapsule({ title: 'Cook This Prompt', content: items.map(item => `${capsuleText(item)}\nSource: ${item.source || item.id}`).join('\n\n---\n\n') })
    } catch (error) { notify(`Could not retrieve local context: ${error.message}. Your prompt is unchanged.`) }
  }
  function saveArtifact(id, content) {
    const append = item => item.id === id ? { ...item, versions: [...item.versions, { content, savedAt: new Date().toISOString(), edited: true }] } : item
    if (imports.some(item => item.id === id)) setImports(previous => previous.map(append))
    else setChats(previous => previous.map(chat => ({ ...chat, messages: chat.messages.map(message => message.artifacts ? { ...message, artifacts: message.artifacts.map(append) } : message) })))
  }
  return <>
    <TitleBar onAction={titleAction} ollamaOk={models.status === 'online'} vaultOk={vaultOk} title={chat?.title || 'AI ASSistant'} />
    <div className="app-shell">
      <Sidebar chats={chats} currentChat={currentChat} navigate={navigate} view={view} onView={setView} onNew={() => newChat()} onAction={chatAction} onSettings={() => setModal('settings')} onApps={() => setModal('apps')} onVault={() => setRightPanel(rightPanel === 'vault' ? null : 'vault')} onAgents={() => setRightPanel(rightPanel === 'agents' ? null : 'agents')} agentsActive={rightPanel === 'agents'} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} busyChatId={chatRuntime.busyChatId} notify={notify} artifactCount={artifacts.length} onToday={() => setToday(true)} profile={profile} />
      {view === 'artifacts' ? <ArtifactsLibrary artifacts={artifacts} onOpen={openArtifact} onImport={item => { setImports(previous => [item, ...previous]); notify('Artifact imported locally. Open its card to run the isolated preview.') }} notify={notify} /> : view === 'projects' ? <ProjectsView projects={projects} chats={chats} onCreate={() => setAction({ type: 'createProject' })} focused={projects.find(item => item.id === focusedProject)} onOpen={setFocusedProject} onBack={() => setFocusedProject(null)} onChat={navigate} onNew={newChat} /> : <Center key={currentChat || `new-${draftNonce}`} chat={chat} models={models} onArtifact={openArtifact} onRetryCapture={chatRuntime.retryCapture} settings={settings} notify={notify} busyChatId={chatRuntime.busyChatId} onSend={chatRuntime.send} onStop={chatRuntime.stop} projects={projects} projectId={projectId} setProjectId={selectProject} onVault={() => setRightPanel('vault')} onContextPreview={previewCapsule} contextBundle={contextBundle} clearContext={() => setContextBundle(null)} onCook={cook} onExternalLink={setExternalLink} seed={seed} vision={vision} onBranch={branchFrom} liveArtifacts={liveArtifacts} branchFamily={branchFamily} onNavigateBranch={navigate} profile={profile} onRegenerate={chatRuntime.regenerate} onEditResend={chatRuntime.editAndResend} />}
      {rightPanel === 'vault' && <VaultPanel onClose={() => setRightPanel(null)} onPreview={previewCapsule} />}
      {rightPanel === 'agents' && <SubAgentPanel subAgents={subAgents} models={models} onClose={() => setRightPanel(null)} onInsert={insertFromAgent} notify={notify} onExternalLink={setExternalLink} inference={inference} />}
      {rightPanel === 'artifact' && artifact && <ArtifactPanel key={artifact.id} artifact={artifact} live={artifactLive} models={models} onClose={() => setRightPanel(null)} onSave={saveArtifact} notify={notify} onExternalLink={setExternalLink} inference={inference} />}
    </div>
    {today && <TodayView onClose={() => setToday(false)} onAsk={topic => { setToday(false); setView('chat'); setSeed(previous => ({ text: topic, n: previous.n + 1 })) }} />}
    {modal === 'settings' && <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setModal(null)} onApps={() => setModal('apps')} onVault={() => setRightPanel('vault')} models={models} vision={vision} visionModel={visionModel} setVisionModel={setVisionModel} vaultOk={vaultOk} vaultPath={vaultPath} onRecheck={models.refresh} profile={profile} setProfile={setProfile} inference={inference} setInference={setInference} notify={notify} />}
    {modal === 'apps' && <AppsExtensionsModal onClose={() => setModal(null)} notify={notify} models={models} vision={vision} vaultOk={vaultOk} vaultPath={vaultPath} subAgents={subAgents} onAgents={() => setRightPanel('agents')} />}
    {action && <ActionDialog action={action} projects={projects} onClose={() => setAction(null)} onApply={applyAction} />}
    {previewContext && <Dialog title="Preview vault context" onClose={() => setPreviewContext(null)} className="context-dialog" labelledBy="context-title"><div className="context-preview"><h3>{previewContext.title}</h3><p>Exact excerpt for the local model <strong>{model}</strong>. Adding it does not send your message or contact an external AI.</p><pre>{previewContext.content}</pre><footer><button className="secondary-button" onClick={() => setPreviewContext(null)}>Cancel</button><button className="white-button" onClick={() => { setContextBundle(previewContext); setPreviewContext(null); setView('chat') }}>Add to composer</button></footer></div></Dialog>}
    {externalLink && <Dialog title="Open external link?" onClose={() => setExternalLink(null)} className="context-dialog" labelledBy="external-title"><div className="context-preview"><p>The external site will receive this exact URL, including its path and query. No chat, files or extra vault context will be attached by the app. Review the destination before allowing this one navigation.</p><pre>{externalLink}</pre><footer><button className="secondary-button" onClick={() => setExternalLink(null)}>Cancel</button><button className="white-button" onClick={() => { window.open(externalLink, '_blank', 'noopener,noreferrer'); setExternalLink(null) }}>Open this link</button></footer></div></Dialog>}
    {notice && createPortal(<div className="notice" role="status"><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={16} /></button></div>, document.body)}
  </>
}
