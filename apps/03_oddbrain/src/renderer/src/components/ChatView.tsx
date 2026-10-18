import { useState, useRef, useEffect } from 'react'
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
import { Mascot } from '../motion/Mascot'
import type { Project } from '@shared/lib/projects'
import { bridge } from '@/platform/bridge'

const STARTERS = [
  'Explain how a hash table works, in plain language',
  'Summarise this text and list the key points',
  'Write a Python script that renames files by date',
]

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
  onDetach,
  audioModels = [],
  audioModel = '',
  onAudioModel,
  onRefreshAudioModels,
  mascotWords = true,
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
  onFiles?: (files: File[]) => void
  onDetach?: (id: string) => void
  audioModels?: Array<{ name: string }>
  audioModel?: string
  onAudioModel?: (name: string) => void
  onRefreshAudioModels?: () => void
  /** The approved greeting uses the owner's name; capture names the capsule. */
  profileName?: string
  /** The project picker, passed through to the composer untouched. */
  projects?: Project[]
  project?: string | null
  onProject?: (id: string | null) => void
  /** Appearance > Mascot mood words: the little word under the mascot. */
  mascotWords?: boolean
}) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const follow = useRef(true)
  const tokens = useDesignTokens()

  const messages = chat?.messages || []
  const liveArtifacts: LiveArtifacts = live || { messageId: '', artifacts: [] }
  const lastContent = messages.length
    ? messages[messages.length - 1].content.length + (messages[messages.length - 1].status || '')
    : ''

  useEffect(() => {
    const element = scroller.current
    if (!element || !follow.current) return
    element.scrollTop = element.scrollHeight
  }, [lastContent, chat?.id])

  const trackScroll = (): void => {
    const element = scroller.current
    if (!element) return
    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
  }

  return (
    <main className="ob-chat-view flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div ref={scroller} data-find-root data-find-scroll onScroll={trackScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[var(--chat-width)] px-6 py-6">
          {messages.length === 0 ? (
            <EmptyState onPick={setDraft} name={profileName} words={mascotWords} />
          ) : (
            <div className="flex flex-col gap-7">
              {messages.map(message => (
                <MessageRow
                  key={message.id}
                  message={message}
                  artifacts={viewsForMessage(message.id, message.artifacts, liveArtifacts)}
                  tokens={tokens}
                  highlightId={highlightId}
                  onRewrite={onRewrite}
                  onRestore={onRestore}
                  busyArtifactId={busyArtifactId}
                  rewriteStage={rewriteStage}
                  rewriteError={rewriteError}
                  rewriteErrorFor={rewriteErrorFor}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {chat && chat.messages.length > 0 ? <CaptureCapsule chat={chat} /> : null}
      <EnginePanel />
      <BattleSection />
      <SplitSection />
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={onSend}
        onStop={onStop}
        busy={busy}
        notice={notice}
        preview={preview}
        projects={projects}
        project={project}
        onProject={onProject}
        attachments={attachments}
        onFiles={onFiles}
        onDetach={onDetach}
        audioModels={audioModels}
        audioModel={audioModel}
        onAudioModel={onAudioModel}
        onRefreshAudioModels={onRefreshAudioModels}
      />
    </main>
  )
}

function EmptyState({
  onPick,
  name = '',
  words = true,
}: {
  onPick: (value: string) => void
  name?: string
  words?: boolean
}) {
  return (
    <div className="flex flex-col items-center pt-20 text-center">
      {/* The kit's resting scene carries the hero's personality; the honest
          state (idle, nothing running) is this screen itself. The brand mark
          stays in the title bar — the logo never moves. The mood word is a
          switch (Appearance > Mascot mood words), default on. */}
      <Mascot role="resting" size={104} seed={1} {...(words ? { withWord: true } : {})} />
      <h1 className="mt-3 text-[30px] font-semibold tracking-tight [font-family:var(--transcript-font)]">
        {greetingFor(name)}
      </h1>
      <p className="mt-4 max-w-[420px] text-[13px] leading-relaxed text-muted">
        How can I help? The engines run on this machine. A brain without the <b>cloud</b> badge
        never sends work anywhere; a brain wearing it sends its work to that brain&rsquo;s own
        service — the chip says which kind is picked.
      </p>
      <ul className="mt-7 flex w-full max-w-[520px] flex-col gap-2">
        {STARTERS.map(starter => (
          <li key={starter}>
            <button
              type="button"
              onClick={() => onPick(starter)}
              className="w-full rounded-xl border border-line bg-panel px-4 py-2.5 text-left text-[13px] text-muted transition-colors hover:border-accent/40 hover:text-ink"
            >
              {starter}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
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
  const capture = (): void => {
    setState('busy')
    const lines = [`# ${chat.title}`, '', `*Captured from a conversation in OddBrain, ${new Date().toLocaleString()}.*`, '']
    for (const message of chat.messages.slice(-30)) {
      const who = message.role === 'user' ? 'You' : 'The engine'
      const text = String(message.content ?? '').slice(0, 2000)
      lines.push(`## ${who}`, '', text, '')
    }
    void bridge.vault
      .captureChat(chat.title, lines.join('\n'))
      .then((answer) => setState(answer.ok ? 'done' : 'failed'))
      .catch(() => setState('failed'))
  }
  return (
    <button
      type="button"
      onClick={capture}
      disabled={state === 'busy'}
      title="Capture this conversation into the vault as a capsule"
      className="fixed bottom-5 right-5 z-20 rounded-full border border-line bg-card px-3.5 py-2 text-[11.5px] text-muted shadow-lg hover:text-ink disabled:opacity-60"
    >
      {state === 'done' ? 'Captured ✓' : state === 'failed' ? 'The vault refused it' : state === 'busy' ? 'Capturing…' : 'Capture as Capsule'}
    </button>
  )
}
