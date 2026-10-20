import WorkQueue from './WorkQueue'
import type { ContextDefaults } from '@shared/lib/chatContext'
import ChatContextPanel from './ChatContextPanel'
import { chatMarkdown } from '@shared/lib/transcripts'
import { downloadText } from '../lib/downloadText'
import CopyText from '../ui/CopyText'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import type { Attachment } from '@shared/types'
import type { Artifact, Chat } from '@shared/types'
import type { ElementPick } from '@shared/lib/artifacts'
import { useDesignTokens } from '@/hooks/useDesignTokens'
import { viewsForMessage, type LiveArtifacts } from '@/state/artifactView'
import Composer from './Composer'
import EnginePanel from './EnginePanel'
import BattleSection from './BattleSection'
import SplitSection from './SplitSection'
import MessageRow from './MessageRow'
import { ChatHome, HomeStarters } from '../ui/ChatHome'
import EngineActivity from '../ui/EngineActivity'
import { useEngine } from '../state/engine'
import type { Project } from '@shared/lib/projects'
import { bridge } from '@/platform/bridge'

/**
 * The conversation, and the box you write in.
 *
 * Autoscroll follows the reply while the model is writing, but lets go the moment
 * the reader scrolls up — scrolling back to read something must not be yanked
 * away every time a token arrives.
 */
export default function ChatView({
  chat,
  draft,
  setDraft,
  onSend,
  onStop,
  busy,
  notice,
  preview,
  live,
  highlightId,
  onRewrite,
  onRestore,
  busyArtifactId,
  rewriteStage,
  rewriteError,
  rewriteErrorFor,
  profileName = '',
  projects = [],
  project = null,
  onProject,
  attachments = [],
  onFiles,
  fileTools,
  onDetach,
  mascotWords = true,
  onBranch,
  contextDefaults,
}: {
  chat: Chat | null
  draft: string
  setDraft: (value: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  notice: string
  preview?: string
  /** What the streaming sweep currently has, so a draft redraws as it is written. */
  live?: LiveArtifacts
  /** Briefly set when the rail jumps to an artifact in this conversation. */
  highlightId?: string
  onRewrite: (request: {
    artifact: Artifact
    source: string
    pick: ElementPick
    comment: string
  }) => Promise<boolean>
  onRestore: (artifact: Artifact, index: number) => void
  busyArtifactId?: string
  rewriteStage?: string
  rewriteError?: string
  rewriteErrorFor?: string
  attachments?: Attachment[]
  fileTools?: ReactNode
  onFiles?: (files: File[]) => void
  onDetach?: (id: string) => void
  /** The approved greeting uses the owner's name; capture names the capsule. */
  profileName?: string
  /** The project picker, passed through to the composer untouched. */
  projects?: Project[]
  project?: string | null
  onProject?: (id: string | null) => void
  /** Appearance > Mascot mood words: the little word under the mascot. */
  contextDefaults?: ContextDefaults
  onBranch?: (messageId: string) => void
  mascotWords?: boolean
}) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const follow = useRef(true)
  const tokens = useDesignTokens()
  const engine = useEngine()
  const tail = engine.turn?.items.at(-1)
  const activityKey = `${engine.turn?.state || ''}:${engine.turn?.items.length || 0}:${tail && 'text' in tail ? tail.text.length : 0}:${engine.turn?.permissions.length || 0}`

  const messages = chat?.messages || []
  const liveArtifacts: LiveArtifacts = live || { messageId: '', artifacts: [] }
  const lastContent = messages.length
    ? messages[messages.length - 1].content.length + (messages[messages.length - 1].status || '')
    : ''

  useEffect(() => {
    const element = scroller.current
    if (!element || !follow.current) return
    element.scrollTop = element.scrollHeight
  }, [lastContent, chat?.id, activityKey])

  useEffect(() => {
    const show = (): void => {
      const card = scroller.current?.querySelector<HTMLElement>('.ob-permission-request')
      if (!card) return
      card.scrollIntoView({ block: 'center', behavior: 'auto' }); card.focus()
      // Focus the region, NEVER Allow: reviewing is not consent.
    }
    window.addEventListener('app:show-approval', show)
    return () => window.removeEventListener('app:show-approval', show)
  }, [])

  const trackScroll = (): void => {
    const element = scroller.current
    if (!element) return
    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
  }

  const home = messages.length === 0 && (!engine.turn || (!!engine.turn.chatId && engine.turn.chatId !== chat?.id)) && !engine.ambient.busy
  const composer = <Composer draftScope={chat?.id || `new:${project || "none"}`} value={draft} onChange={setDraft} onSend={onSend} onStop={onStop} busy={busy} notice={notice} preview={preview} projects={projects} project={project} onProject={onProject} attachments={attachments} onFiles={onFiles} fileTools={fileTools} onDetach={onDetach} />
  return <main className={`ob-chat-view ${home ? 'ob-chat-home' : ''}`}>
    <div ref={scroller} data-find-root data-find-scroll onScroll={trackScroll} className="ob-chat-scroller">
      {home ? <div className="ob-home-stack">
        <ChatHome name={profileName} words={mascotWords} />
        <BattleSection /><SplitSection />
        {composer}
        <HomeStarters onPick={setDraft} />
        <EnginePanel chatId={chat?.id || ''} />
      </div> : <div className="ob-transcript mx-auto w-full max-w-[var(--chat-width)] px-6 py-6">
        <div className="flex flex-col gap-7">{messages.map(message => <MessageRow key={message.id} message={message} artifacts={viewsForMessage(message.id, message.artifacts, liveArtifacts)} tokens={tokens} highlightId={highlightId} onRewrite={onRewrite} onRestore={onRestore} busyArtifactId={busyArtifactId} rewriteStage={rewriteStage} rewriteError={rewriteError} rewriteErrorFor={rewriteErrorFor} />)}</div>
        <div className="ob-engine-transcript">{engine.turn?.state !== 'running' && chat?.messages.some(m => m.nativeRecord?.transcriptId === engine.turn?.transcriptId) ? <details><summary>Last run details and kept files</summary><EnginePanel chatId={chat?.id || ''} /></details> : <EnginePanel chatId={chat?.id || ''} />}</div>
      </div>}
    </div>
    <WorkQueue />
    {!home ? <><BattleSection /><SplitSection /><EngineActivity words={mascotWords} />{composer}</> : null}
    {chat && chat.messages.length > 0 ? <><ChatContextPanel key={chat.id} chat={chat} draft={draft} branch={onBranch} defaults={contextDefaults} /><CaptureCapsule chat={chat} /></> : null}
  </main>
}

/** Time-of-day greeting, as the approved home screen shows: the day part, then the name. */
export function greetingFor(name: string, now: Date = new Date()): string {
  const hour = now.getHours()
  const part = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night'
  return name.trim() ? `${part}, ${name.trim()}.` : `${part}.`
}

/**
 * Capture as Capsule: the open conversation, written into the vault's
 * Captures/ folder in one click — the same memory the browser extension
 * feeds, so nothing said here is lost to the folder it was said in.
 */
function CaptureCapsule({ chat }: { chat: Chat }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')
  const [notice, setNotice] = useState('')
  useEffect(() => { setState('idle'); setNotice('') }, [chat.id, chat.messages.length])
  const capture = (): void => {
    setState('busy')
    const markdown = chatMarkdown(chat)
    void bridge.vault
      .captureChat(chat.title, markdown)
      .then((answer) => { setState(answer.ok ? 'done' : 'failed'); setNotice(answer.answer) })
      .catch(() => setState('failed'))
  }
  return (
    <details className="mx-6 mb-3 text-[12px] text-muted"><summary className="cursor-pointer">Save or copy this chat</summary><p>Full stored message text. Binary attachments are not embedded; this is not an account archive.</p><div className="ob-inline-actions"><CopyText text={chatMarkdown(chat)} label="Copy full chat" /><button type="button" onClick={() => downloadText(chatMarkdown(chat), `chat-${chat.id}.md`)}>Export chat Markdown</button>
    <button
      type="button"
      onClick={capture}
      disabled={state === 'busy'}
      title="Capture this conversation into the vault as a capsule"
      className="ob-small-button"
    >
      {state === 'done' ? 'Captured ✓' : state === 'failed' ? 'The vault refused it' : state === 'busy' ? 'Capturing…' : 'Capture as Capsule'}
    </button></div>{notice ? <p role="status">{notice}</p> : null}</details>
  )
}
