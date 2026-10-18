import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { DEFAULT_MODEL } from '@shared/lib/storage'
import { DEFAULT_PROFILE, normalizeProfile } from '@shared/lib/profile'
import TitleBar from './components/TitleBar'
import ArtifactsRail from './components/ArtifactsRail'
import { chatArtifacts } from './state/artifactView'
import { restoredInPlace, withNewVersion } from './state/artifactEdits'
import type { Artifact } from '@shared/types'
import type { ElementPick } from '@shared/lib/artifacts'
import Sidebar from './components/Sidebar'
import { type View } from './components/AppNav'
import { engineStore, useEngine } from '@/state/engine'
import { seedWrap } from '@/state/compact'
import FirstRunView from './components/FirstRunView'
import useProjects from './state/projects'
import useArtifactLibrary, { adoptionRecords } from './state/artifactLibrary'
import type { ArtifactSummary } from '../../main/artifacts/store'
import useChat from './hooks/useChat'
import useArtifactRewrite from './hooks/useArtifactRewrite'
import useModels from './hooks/useModels'
import type { Attachment } from '@shared/types'
import { promptWithTextAttachments, readAttachment, readAudioAttachment } from '@shared/lib/attachments'
import { parseCloudModel } from '@shared/lib/providers'
import { extractFrames } from './lib/videoFrames'
import usePersistentState from './hooks/usePersistentState'
import useVault from './hooks/useVault'
import type { SectionId } from './components/SettingsView'
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearance,
  normalizeAppearance,
} from './state/appearance'
import { DEFAULT_INFERENCE, INFERENCE_KEY, normalizeInference } from './state/performance'
import { useChats } from './state/useChats'
import { bridge, isDemo } from './platform/bridge'
import { DEFAULT_PERMISSIONS, normalizePermissions, type Permissions } from '@shared/lib/permissions'
import { vaultPost } from '@shared/lib/vault'
import { setMotionMode } from './motion/motionMode'
import { setOsReducedMotion } from './motion/motionMode'
import { conversationCapture } from '@shared/lib/capture'

const ChatView = lazy(() => import('./components/ChatView'))
const ArtifactsView = lazy(() => import('./components/ArtifactsView'))
const TodayView = lazy(() => import('./components/TodayView'))
const ProjectsView = lazy(() => import('./components/ProjectsView'))
const BrainView = lazy(() => import('./components/BrainView'))
const VaultView = lazy(() => import('./components/VaultView'))
const CodeView = lazy(() => import('./components/CodeView'))
const SettingsView = lazy(() => import('./components/SettingsView'))
const MemoryMap = lazy(() => import('./components/MemoryMap'))
const EnginePanel = lazy(() => import('./components/EnginePanel'))

/**
 * The app.
 *
 * One screen so far: the conversation. Everything the interface shows comes from
 * the shared modules — the model list from Ollama's own metadata, search from the
 * library's search, the transcript from the chat hook — so there is no second
 * implementation of anything to drift out of step.
 */

/** The quick window's whole surface: the engine's card, one box, nothing else. */
import BrainMark from './components/BrainMark'

function QuickMode(): React.JSX.Element {
  const engine = useEngine()
  const [draft, setDraft] = useState('')
  // The gate is the TURN, not the process: the session stays alive between
  // turns on purpose, and a living idle process accepts the next ask.
  const turnRunning = engine.turn?.state === 'running'
  const send = (): void => {
    const prompt = draft.trim()
    if (!prompt || turnRunning) return
    setDraft('')
    void engine.send(prompt)
  }
  return (
    <div className="flex h-screen flex-col bg-bg px-3 py-2.5">
      <header className="flex items-center gap-1.5 pb-1.5">
        <BrainMark size={14} />
        <span className="text-[12px] font-medium tracking-tight text-ink">OddBrain — quick ask</span>
        <span className="ml-auto text-[10.5px] text-muted">the same engine, the same cards</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={<div className="ob-shell-loading" role="status">Loading engine…</div>}>
          <EnginePanel />
        </Suspense>
      </div>
      <div className="mt-2 flex items-end gap-1.5">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              send()
            }
          }}
          rows={2}
          aria-label="Message"
          placeholder="Ask anything — Ctrl+Enter sends"
          className="min-h-0 flex-1 resize-none rounded-xl border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || turnRunning}
          aria-label="Send"
          className="rounded-xl bg-accent px-3 py-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-accent/90 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default function App() {
  // The quick window: the SAME app, one small door of it. Same engine store,
  // same queue, same cards — never a second engine.
  if (new URLSearchParams(window.location.search).has('quick')) return <QuickMode />
  // The quick window's hotkey: the persisted choice, applied every boot.
  useEffect(() => {
    if (isDemo) return
    const on = window.localStorage.getItem('oddbrain.quickShortcut') !== '"false"'
    void bridge.quick.shortcut(on).catch(() => undefined)
  }, [])
  // One line of text, not a dialog. A warning the person has to dismiss is a
  // warning they will learn to dismiss without reading.
  const [notice, setNotice] = useState('')

  const chats = useChats(setNotice)
  // The app's own notice channel: pieces of the window (dictation, media) speak
  // here when a machine cannot do something, instead of a button lying.
  useEffect(() => {
    const hear = (event: Event): void => setNotice((event as CustomEvent<string>).detail || '')
    window.addEventListener('app:notice', hear)
    return () => window.removeEventListener('app:notice', hear)
  }, [])
  const [profile, setProfile] = usePersistentState('ai-assistant.profile', DEFAULT_PROFILE, normalizeProfile, setNotice)
  const [welcomed, setWelcomed] = usePersistentState('ai-assistant.welcomed', false, (value) => value === true, setNotice)
  const { projects } = useProjects(true)
  const [model, setModel] = usePersistentState(
    'ai-assistant.model',
    DEFAULT_MODEL,
    value => (typeof value === 'string' && value.trim() ? value : DEFAULT_MODEL),
    setNotice
  )
  /**
   * What each agent may do, as the main process holds it. Read when the window
   * opens and re-read after Settings writes, because the main process is what
   * enforces them: this is a copy of the record, never the record itself.
   */
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS)
  const [permissionsRevision, setPermissionsRevision] = useState(0)
  const models = useModels(model, setModel, permissions)
  const [draft, setDraft] = useState('')
  // Media for the next engine task: pictures, video frames, text files. Read
  // the moment they arrive (the reader refuses honestly), sent with the words,
  // cleared on success. The engine reads them itself, whatever engine it is.
  const [attachments, setAttachments] = useState<Attachment[]>([])
  // Set for a moment when the rail jumps to an artifact, so a click on something
  // already on screen still shows that it did something.
  const [highlight, setHighlight] = useState('')

  const chat = useMemo(
    () => chats.chats.find(entry => entry.id === chats.currentChat) || null,
    [chats.chats, chats.currentChat]
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** Which pane Settings opens onto; 'models' when the account menu's
   *  "Get API keys" led here, otherwise the pane the reader left it on. */
  const [settingsSection, setSettingsSection] = useState<SectionId>('system')
  const [memoryOpen, setMemoryOpen] = useState(false)
  /** The project a brand-new chat will belong to, chosen before its first word. */
  const [pendingProject, setPendingProject] = useState<string | null>(null)

  // The native menu (File > New chat, Go > screens) talks to the window over
  // the app bridge; in the browser there is no menu, and the listener is
  // simply absent.
  useEffect(() => {
    const offNew = bridge.app?.onMenu?.('menu:new-chat', () => {
      chats.create()
      setView('chat')
      setNotice('')
    })
    const offSettings = bridge.app?.onMenu?.('menu:settings', () => setSettingsOpen(true))
    const offViews = (['chat', 'artifacts', 'today', 'projects', 'vault', 'brain', 'code'] as const).map(view =>
      bridge.app?.onMenu?.(`menu:view:${view}`, () => {
        if (view === 'code') setCodeFocus('') // the menu opens the whole board, never a project's scope
        setView(view)
      })
    )
    return () => {
      offNew?.()
      offSettings?.()
      for (const off of offViews) off?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Which screen is showing, remembered so the app opens where it was left.
  const [view, setView] = usePersistentState<View>(
    'ai-assistant.view',
    'chat',
    value => (value === 'artifacts' ? 'artifacts' : 'chat')
  )
  const [artifactQuery, setArtifactQuery] = useState('')
  const [libraryNote, setLibraryNote] = useState('')
  // The right-hand rail of this conversation's artifacts collapses, like the sidebar.
  const [railOpen, setRailOpen] = usePersistentState('ai-assistant.artifact-rail', true, value => value !== false)
  // Bumped when Settings moves the vault, so the chip and the dialog both re-read it.
  const [vaultRevision, setVaultRevision] = useState(0)
  /** The folder a project asked Code to open with; empty = the whole board. */
  const [codeFocus, setCodeFocus] = useState('')
  // Re-checked whenever the current conversation is kept or the vault moves: a
  // vault that has gone missing shows as a chip rather than as a save that
  // quietly did not happen.
  const vault = useVault(`${chat?.vaultStatus || ''}:${vaultRevision}`)

  // Interface preferences live in this window's storage, not the machine's
  // settings file: they are about how the app reads rather than where your
  // work is, so they also work in the browser preview.
  const [appearance, setAppearance] = usePersistentState(
    APPEARANCE_KEY,
    DEFAULT_APPEARANCE,
    normalizeAppearance,
    setNotice
  )
  const [inference, setInference] = usePersistentState(
    INFERENCE_KEY,
    DEFAULT_INFERENCE,
    normalizeInference,
    setNotice
  )

  useEffect(() => {
    applyAppearance(appearance)
    // The kit's mascots read the mode from the motion store, not props —
    // they sit deep inside cards that never see the appearance object.
    setMotionMode(appearance.motion)
  }, [appearance])

  // The OS reduced-motion preference stops every kit scene, in every mode.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setOsReducedMotion(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    let cancelled = false
    bridge.settings
      .read()
      .then(settings => {
        if (!cancelled) setPermissions(normalizePermissions(settings?.permissions))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [permissionsRevision])

  const navigate = useCallback(
    (chatId: string) => {
      setPendingProject(null)
      chats.open(chatId)
    },
    [chats],
  )

  const engine = useEngine()
  const chatApi = useChat({
    chats: chats.chats,
    setChats: chats.setChats,
    currentChat: chats.currentChat,
    navigate,
    models,
    // The vision bridge is chosen from models that reported vision support. That
    // choice lives in Settings, which is not built yet — so nothing is claimed
    // here, and attaching an image says plainly what is missing.
    vision: { bridgeModel: '' },
    notify: setNotice,
    // What Settings > Performance chose. Left alone it is the 4 GB profile:
    // the one that cannot overflow a small card.
    inference,
    // Where finished conversations are kept. In the browser preview there is no
    // vault behind the interface, so nothing is attempted and no failed request
    // appears in the console — the preview stays quiet, as it must.
    // Nothing is attempted when keeping conversations is switched off, so nothing
    // fails and no request appears anywhere: the switch is the whole behaviour.
    capture: isDemo
      ? undefined
      : chat => {
          // The library is the app's own record, and it is fed every time a turn
          // ends. `save` reports `unchanged` for a document that has not moved,
          // so a chat that produced nothing new writes nothing.
          for (const record of adoptionRecords(chat.messages, chat.id)) {
            void bridge.artifacts.save({
              id: record.id,
              title: record.title,
              type: record.type,
              content: record.content,
              chatId: record.chatId,
              messageId: record.messageId,
            })
          }
          if (!permissions.keepConversations) return Promise.resolve(undefined)
          return vaultPost('/capture', conversationCapture(chat)).then(() => undefined)
        },
  })

  const artifacts = useMemo(
    () => chatArtifacts(chat?.messages || []),
    [chat?.messages]
  )

  /** The library, loaded when the Artifacts screen is showing. */
  const library = useArtifactLibrary(view === 'artifacts' || view === 'today')

  /**
   * Artifacts already sitting in saved conversations are written into the
   * library once, the first time the screen opens — so it starts with what this
   * app has actually made rather than empty, without asking and without changing
   * a single conversation.
   */
  const adopted = useRef(false)
  useEffect(() => {
    if (view !== 'artifacts' || adopted.current || library.loading || library.error) return
    adopted.current = true
    const records = chats.chats.flatMap(entry => adoptionRecords(entry.messages, entry.id))
    if (!records.length) {
      setLibraryNote('')
      return
    }
    void library.adopt(records).then(count => {
      if (count) setLibraryNote(`${count} artifact${count === 1 ? '' : 's'} already in your conversations were added to the library.`)
    })
  }, [view, library, chats.chats])

  useEffect(() => {
    if (!highlight) return
    const timer = setTimeout(() => setHighlight(''), 1600)
    return () => clearTimeout(timer)
  }, [highlight])

  /** From the library back to the conversation and the message that made it. */
  const openArtifactInChat = (item: ArtifactSummary): void => {
    if (!item.chatId) {
      setNotice('That artifact was not made in a chat, so there is no conversation to open.')
      return
    }
    if (!chats.chats.some(entry => entry.id === item.chatId)) {
      setNotice('The conversation that made this artifact is no longer in the list.')
      return
    }
    setView('chat')
    chats.open(item.chatId)
    setNotice('')
    // The card is scrolled to once the chat has had a frame to render.
    setTimeout(() => jumpToArtifact(item.id), 120)
  }

  const jumpToArtifact = (artifactId: string): void => {
    setHighlight(artifactId)
    document
      .getElementById(`artifact-${artifactId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const rewrite = useArtifactRewrite({
    model: models.model,
    available: models.available,
    inference,
  })

  /**
   * Replace an artifact on a message. Both the rewrite and the restore go through
   * here, so there is exactly one place in the app that edits a document — and it
   * can only ever append a version (see artifactEdits).
   */
  const replaceArtifact = (messageId: string, artifactId: string, next: Artifact): void => {
    chats.setChats(previous =>
      previous.map(entry =>
        entry.id !== chats.currentChat
          ? entry
          : {
              ...entry,
              messages: entry.messages.map(message =>
                message.id !== messageId
                  ? message
                  : {
                      ...message,
                      artifacts: (message.artifacts || []).map(artifact =>
                        artifact.id === artifactId ? next : artifact
                      ),
                    }
              ),
            }
      )
    )
  }

  /** Which message holds an artifact, so an edit can be written back to the right
   *  place even when the card is showing an older version of the same file. */
  const findArtifact = (artifactId: string): { messageId: string; artifact: Artifact } | null => {
    for (const message of chat?.messages || []) {
      const found = (message.artifacts || []).find(artifact => artifact.id === artifactId)
      if (found) return { messageId: message.id, artifact: found }
    }
    return null
  }

  const runRewrite = async ({
    artifact,
    source,
    pick,
    comment,
  }: {
    artifact: Artifact
    source: string
    pick: ElementPick
    comment: string
  }): Promise<boolean> => {
    const next = await rewrite.rewrite({ artifact, source, pick, comment })
    if (!next) return false
    const found = findArtifact(artifact.id)
    // A no-op rewrite comes back as the same artifact, and withNewVersion returns
    // it unchanged rather than inventing a version for it.
    if (found) replaceArtifact(found.messageId, artifact.id, withNewVersion(found.artifact, next, comment.trim().slice(0, 60)))
    setNotice('')
    return true
  }

  const restoreVersion = (artifactId: string, index: number): void => {
    const found = findArtifact(artifactId)
    if (!found) return
    try {
      replaceArtifact(found.messageId, artifactId, restoredInPlace(found.artifact, index))
    } catch (failure) {
      setNotice((failure as Error).message)
    }
  }

  /** Read picked/pasted files into bounded, non-executable attachments. */
  const addFiles = async (files: File[]): Promise<void> => {
    const room = Math.max(0, 4 - attachments.length)
    if (room === 0) {
      setNotice('Four attachments ride with one task. Remove one first.')
      return
    }
    const taken: Attachment[] = []
    const isAudioFile = (file: File): boolean => /^audio\//i.test(file.type) || /\.(?:wav|mp3|m4a|aac|ogg|opus|flac|wma)$/i.test(file.name)
    const batch = files.slice(0, room)
    let intakeNotice = files.length > room
      ? `Only ${room} attachment${room === 1 ? '' : 's'} fit this task. Extra files were not read or sent.`
      : ''
    const addIntakeNotice = (message: string): void => {
      if (message && !intakeNotice.includes(message)) intakeNotice = intakeNotice ? `${intakeNotice} ${message}` : message
    }
    const audioFiles = batch.filter(isAudioFile)
    if (attachments.some(entry => entry.kind === 'audio') && audioFiles.length) {
      setNotice('Only one audio file can ride with a task. Remove the earlier clip first; nothing was sent.')
      return
    }
    if (audioFiles.length > 1) {
      setNotice('Only one audio file can ride with a task. Choose one clip; nothing was sent.')
      return
    }
    let preparedAudio: Attachment | null = null
    if (audioFiles.length === 1) {
      try {
        preparedAudio = await readAudioAttachment(audioFiles[0])
      } catch (failure) {
        setNotice((failure as Error).message)
        return
      }
      const selected = parseCloudModel(models.model)
      addIntakeNotice(selected?.provider.id === 'openai' && models.available
        ? `${audioFiles[0].name} was decoded locally. If you send it, it goes only to ${models.model}; the provider list does not confirm audio support, so that exact model may refuse. No fallback.`
        : `${audioFiles[0].name} was decoded locally but not sent. Choose an enabled OpenAI model from Audio model before Send; nothing will be switched automatically.`)
    }
    const audioTurn = attachments.some(entry => entry.kind === 'audio') || preparedAudio !== null
    for (const file of batch) {
      if (taken.length >= room) {
        addIntakeNotice(`${file.name} was not read or attached because this task has room for four attachments.`)
        break
      }
      try {
        const isAudio = isAudioFile(file)
        if (isAudio) {
          if (!preparedAudio) throw new Error(`${file.name}: audio was not decoded safely. Nothing was sent.`)
          taken.push(preparedAudio)
        } else if (engineStore().settings.id === 'agy' && !audioTurn && /^(?:image|video)\//i.test(file.type)) {
          throw new Error(`${file.name}: the selected agy engine cannot receive images or video frames. Choose an engine that accepts images first; no provider or model will be switched automatically.`)
        } else if (/^video\/(?:mp4|webm)$/i.test(file.type)) {
          // A video rides as evenly spaced still frames: the engine reads
          // pictures natively, and frames carry the story a clip would.
          const frames = await extractFrames(file, room - taken.length)
          addIntakeNotice(`${file.name}: attached as ${frames.length} sampled still frame${frames.length === 1 ? '' : 's'}. Its audio track is not extracted or sent; no provider or model is switched.`)
          for (const frame of frames) {
            const prepared = await readAttachment(frame, { verified: true, vision: true, thinking: false })
            for (const attachment of Array.isArray(prepared) ? prepared : [prepared]) {
              taken.push({
                ...attachment,
                sourceNote: `Video ${JSON.stringify(file.name)} is represented by ${frames.length} sampled still frames; its audio track was not decoded or sent.`,
              })
            }
          }
        } else {
          // The engine sees pictures itself; the chat vision bridge's gate is
          // about the chat brain, not the engine's own eyes.
          const prepared = await readAttachment(
            file,
            { verified: true, vision: true, thinking: false },
            { maxPdfPages: room - taken.length },
          )
          if (Array.isArray(prepared)) {
            if (engineStore().settings.id === 'agy' && !audioTurn) {
              throw new Error(`${file.name}: this scanned PDF becomes page images, which the selected agy engine cannot receive. No provider or model was switched.`)
            }
            if (prepared[0]?.sourceNote) addIntakeNotice(`${prepared[0].sourceNote} Split the PDF to include other pages.`)
            taken.push(...prepared)
          } else {
            taken.push(prepared)
          }
        }
      } catch (failure) {
        addIntakeNotice((failure as Error).message)
        break
      }
    }
    if (taken.length) setAttachments(current => [...current, ...taken].slice(0, 4))
    if (intakeNotice) setNotice(intakeNotice)
  }

  // The window wires the engine up once, cold: settings, events, the
  // record of earlier sessions. Waiting for the first send would leave a
  // fresh window deaf and its history invisible.
  useEffect(() => {
    void engineStore().init()
  }, [])

  // Edit from the card: the work order goes back in the composer, changed and sent again by the owner.
  useEffect(() => {
    const hear = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string' && detail.trim()) setDraft(detail)
    }
    window.addEventListener('app:draft', hear)
    return () => window.removeEventListener('app:draft', hear)
  }, [])

  const send = async (): Promise<void> => {
    const text = draft
    if (!text.trim() && attachments.length === 0) return
    // Audio has no verified local engine input. It uses the explicitly selected,
    // enabled OpenAI model through the app's provider bridge; no engine/model
    // fallback or substitution is allowed.
    const audioAttachments = attachments.filter(entry => entry.kind === 'audio')
    if (audioAttachments.length) {
      const selected = parseCloudModel(models.model)
      if (selected?.provider.id !== 'openai') {
        setNotice('Audio is not sent to the selected engine. Choose an enabled OpenAI model using Audio model; nothing has been sent or switched.')
        return
      }
      if (!models.available) {
        setNotice(models.error || `The selected model ${models.model} is not available through its enabled OpenAI key. Nothing was sent.`)
        return
      }
      const audioOrder = seedWrap(text.trim() || 'Please listen to the attached audio and tell me what it contains.')
      const accepted = await chatApi.send({ content: audioOrder, attachments, projectId: pendingProject })
      if (accepted) {
        setDraft('')
        setAttachments([])
        setNotice('')
        if (pendingProject) setPendingProject(null)
      }
      return
    }

    // Non-audio work continues through the chosen agent engine as before.
    // After a Compact, the brief rides along with exactly one send.
    const order = seedWrap(text.trim() || (attachments.length ? 'Read what I attached and tell me what you see.' : ''))
    let completeOrder: string
    try {
      completeOrder = promptWithTextAttachments(order, attachments)
    } catch (failure) {
      setNotice((failure as Error).message)
      return
    }
    const imageAttachments = attachments.filter(entry => entry.kind === 'image')
    if (imageAttachments.some(entry => !entry.data)) {
      setNotice('An attached image is missing its decoded data. Reattach it; nothing was sent.')
      return
    }
    const pictures = imageAttachments
      .map(entry => ({ mime: entry.mime || 'image/png', data: entry.data || '' }))
    if (pictures.length && engineStore().settings.id === 'agy') {
      setNotice('The selected agy engine cannot receive images. Choose an engine that accepts them first; this image stays attached and no provider or model is switched.')
      return
    }
    const answer = await engineStore().send(completeOrder, pictures)
    if (answer.ok) {
      setDraft('')
      setAttachments([])
      setNotice('')
      if (pendingProject) {
        setPendingProject(null)
      }
    } else if (answer.answer.startsWith('The engine is already working')) {
      // Busy is not a refusal here: the owner typed a work order, so it
      // waits in the line and runs the moment the engine is free.
      engineStore().enqueue(completeOrder, pictures)
      setDraft('')
      setAttachments([])
      setNotice('Added to the line. It runs when the current work finishes; the card shows the queue.')
    } else {
      setNotice(answer.answer)
    }
  }

  if (!welcomed) {
    return <FirstRunView onFinish={() => setWelcomed(true)} onName={(name) => setProfile({ ...profile, name })} />
  }

  return (
    <div className="ob-app-root ob-desktop flex h-full flex-col overflow-hidden bg-bg text-ink" data-layout="classic">
      <TitleBar
        engineModel={engineStore().settings.model}
        engineId={engineStore().settings.id}
        engineAlive={engineStore().turn?.state === 'running'}
        onOpenEngine={() => setView('chat')}
        preview={isDemo}
        // Re-checked when a conversation is kept, so a vault that went missing
        // shows up as a chip rather than as a save that silently did not happen.
        // With keeping switched off the chip says so, because a green "Vault"
        // while nothing is written would be the one kind of lie this app forbids.
        vault={permissions.keepConversations ? vault : { ...vault, state: 'off' }}
      />
      {/* Settings fills this row rather than the whole window, so the app keeps
          its own header and the operating system keeps the window frame. */}
      <div className="ob-shell-body relative flex min-h-0 flex-1">
        <Sidebar
          view={view}
          onView={setView}
          artifactQuery={artifactQuery}
          onArtifactQuery={setArtifactQuery}
          artifactCount={library.items.length}
          chats={chats.chats}
          currentChat={chats.currentChat}
          onOpen={chats.open}
          onNew={() => {
            chats.create()
            setNotice('')
          }}
          onDelete={chats.remove}
          onOpenSettings={(section) => {
            setMemoryOpen(false)
            if (section) setSettingsSection(section)
            setSettingsOpen(true)
          }}
          onOpenMemory={() => setMemoryOpen(true)}
          onSetChatProject={(chatId, projectId) => chats.setProject(chatId, projectId)}
          onPin={chats.pin}
          onRenameChat={chats.rename}
          profileName={profile.name}
        />
        <div className="ob-shell-content">
          <Suspense fallback={<div className="ob-shell-loading" role="status">Opening workspace…</div>}>
            {view === 'code' ? (
              <CodeView focusFolder={codeFocus} onClearFocus={() => setCodeFocus('')} />
            ) : view === 'brain' ? (
              <BrainView vault={vault} isDemo={isDemo} onOpenVault={() => setView('vault')} />
            ) : view === 'vault' ? (
              <VaultView
                onAddToComposer={(path, content) => {
                  // A note becomes context: quoted, capped, and named — never a
                  // silent paste of a whole file into the draft.
                  const quoted = content.length > 4000 ? `${content.slice(0, 4000)}\n… (the rest stays in ${path})` : content
                  setDraft(previous => (previous ? `${previous}\n\nFrom the vault (${path}):\n${quoted}\n` : `From the vault (${path}):\n${quoted}\n`))
                  setView('chat')
                  setNotice(`${path} added to the composer`)
                }}
              />
            ) : view === 'projects' ? (
              <ProjectsView
                chats={chats.chats}
                onOpenChat={chats.open}
                onNewChatInProject={(projectId) => {
                  setPendingProject(projectId)
                  chats.create()
                  setView('chat')
                  setNotice('')
                }}
                onWorkHere={(folder) => {
                  void bridge.engine.setWorkspace(folder).then((answer) => {
                    setNotice(answer.ok ? `The engine now works in ${folder}` : answer.answer)
                  })
                }}
                onViewBoard={(folder) => {
                  setCodeFocus(folder)
                  void bridge.engine.setWorkspace(folder).then((answer) => {
                    if (answer.ok) setNotice(`The engine now works in ${folder}`)
                    setView('code')
                  })
                }}
              />
            ) : view === 'today' ? (
              <TodayView
                chats={chats.chats}
                artifacts={library.items}
                artifactsLoading={library.loading}
                onOpenChat={chats.open}
                onNew={() => {
                  chats.create()
                  setView('chat')
                  setNotice('')
                }}
                onView={setView}
              />
            ) : view === 'artifacts' ? (
              <ArtifactsView
                items={library.items}
                loading={library.loading}
                error={library.error}
                where={library.where}
                query={artifactQuery}
                note={libraryNote}
                onRename={library.rename}
                onDuplicate={library.duplicate}
                onRemove={library.remove}
                onRestore={library.restore}
                onImport={library.importFile}
                onOpenInChat={openArtifactInChat}
              />
            ) : (
            <ChatView
              mascotWords={appearance.mascotWords}
              chat={chat}
              draft={draft}
              setDraft={setDraft}
              onSend={() => void send()}
              onStop={() => {
                if (chatApi.busyChatId) chatApi.stop()
                else void engine.stop()
              }}
              busy={engine.turn?.state === 'running' || chatApi.busyChatId !== null}
              live={chatApi.live}
              highlightId={highlight}
              notice={notice}
              profileName={profile.name}
              projects={projects}
              project={pendingProject}
              onProject={setPendingProject}
              attachments={attachments}
              onFiles={(files) => void addFiles(files)}
              onDetach={(id) => setAttachments(current => current.filter(entry => entry.id !== id))}
              audioModels={models.models.filter(entry => entry.cloud && entry.provider === 'openai').map(entry => ({ name: entry.name }))}
              audioModel={models.model}
              onAudioModel={(name) => {
                models.select(name)
                setNotice(`Audio will be sent only to ${name}. The provider list does not confirm audio support; that exact model may refuse. No fallback.`)
              }}
              onRefreshAudioModels={models.refresh}
              onRewrite={runRewrite}
              onRestore={(artifact, index) => restoreVersion(artifact.id, index)}
              busyArtifactId={rewrite.busyId || ''}
              rewriteStage={rewrite.stage}
              rewriteError={rewrite.error}
              rewriteErrorFor={rewrite.errorFor}
              preview={
                isDemo
                  ? 'Browser preview, this window is the interface only. Models, files and your vault live on your own machine, in the desktop app.'
                  : ''
              }
            />
            )}
            {view === 'chat' && artifacts.length > 0 && railOpen ? (
              <ArtifactsRail
                items={artifacts}
                onJump={item => jumpToArtifact(item.id)}
                onClose={() => setRailOpen(false)}
              />
            ) : null}
            {view === 'chat' && artifacts.length > 0 && !railOpen ? (
              <button
                type="button"
                onClick={() => setRailOpen(true)}
                aria-label="Show the artifacts panel"
                title="Show this conversation's artifacts"
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-muted transition-colors hover:text-ink"
              >
                <PanelRightOpen size={14} />
              </button>
            ) : null}

          </Suspense>
        </div>

        {/* What was read and when, from the vault. One surface at a time: opening
            the map closes Settings, so the window is never two overlays deep. */}
        {memoryOpen && !settingsOpen ? (
          <Suspense fallback={null}>
            <MemoryMap open onClose={() => setMemoryOpen(false)} />
          </Suspense>
        ) : null}

        {settingsOpen ? (
          <Suspense fallback={<div className="ob-shell-loading" role="status">Opening settings…</div>}>
            <SettingsView
              open={settingsOpen}
              initialSection={settingsSection}
              onClose={() => setSettingsOpen(false)}
              permissions={permissions}
              onPermissionsChange={(next: Permissions) => {
                setPermissions(next)
                // Re-read from the main process, so what the window shows is what the
                // machine recorded rather than what this component hoped for.
                setPermissionsRevision(revision => revision + 1)
              }}
              vault={vault}
              onChanged={() => setVaultRevision(revision => revision + 1)}
              onOpenBrain={() => {
                setSettingsOpen(false)
                setView('brain')
              }}
              appearance={appearance}
              onAppearanceChange={setAppearance}
              inference={inference}
              onInferenceChange={setInference}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  )
}
