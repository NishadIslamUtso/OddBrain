import { useEffect, useState } from 'react'
import ReadAloudButton from '../ui/ReadAloudButton'
import type { Artifact, Message } from '@shared/types'
import type { ElementPick } from '@shared/lib/artifacts'
import { THINKING_OPEN_EVENT, setThinkingOpen, thinkingOpenNow } from '@shared/lib/thinkingOpen'
import { parseCloudModel } from '@shared/lib/providers'
import type { ArtifactView } from '@/state/artifactView'
import ArtifactCard from './ArtifactCard'
import BrainMark from './BrainMark'
import CopyText from '../ui/CopyText'
import { useLook } from '../ui/LookContext'

/**
 * One turn in the conversation.
 *
 * A user message is a bubble on the right because it is something that was said.
 * A reply is not a bubble: it is the document, so it runs the full width with the
 * app's mark beside it. Thinking, when the model reports it separately, is folded
 * away rather than mixed into the answer.
 */

export default function MessageRow({
  message,
  artifacts = [],
  tokens = '',
  highlightId = '',
  onRewrite,
  onRestore,
  busyArtifactId = '',
  rewriteStage = '',
  rewriteError = '',
  rewriteErrorFor = '',
}: {
  message: Message
  /** Already resolved for this message: live draft while streaming, saved after. */
  artifacts?: ArtifactView[]
  tokens?: string
  /** Set briefly when the rail jumps to an artifact here. */
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
  /** The artifact the error belongs to, so it is not printed on every card. */
  rewriteErrorFor?: string
}) {
  const look = useLook()
  if (message.role === 'user') {
    return (
      <div className="flex justify-end" data-message-id={message.id}>
        <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-[14px_14px_4px_14px] bg-card px-3.5 py-2.5 text-[length:var(--transcript-size,14.5px)] leading-relaxed [font-family:var(--transcript-font)]">
          {message.content}
          <div className="ob-message-actions"><CopyText text={message.content} label="Copy message" /></div>
          {!!message.nativeRecord?.pictures && <p className="mt-1 text-[11px] text-muted">{message.nativeRecord.pictures} image(s) accompanied this request. This text record does not contain the image bytes.</p>}
          {message.editedAt && <span className="mt-1 block text-[11px] text-muted">edited</span>}
          {(message.attachments || []).length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {message.attachments?.map(file => (
                <li
                  key={file.id}
                  className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted"
                >
                  {file.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  const streaming = message.status === 'streaming'
  // The owner's rule: collapsed unless he opened one — and then ALWAYS open.
  const [thinkingOpen, setThinkingOpenState] = useState(thinkingOpenNow())
  useEffect(() => {
    const follow = (): void => setThinkingOpenState(thinkingOpenNow())
    window.addEventListener(THINKING_OPEN_EVENT, follow)
    return () => window.removeEventListener(THINKING_OPEN_EVENT, follow)
  }, [])
  return (
    <div className="flex gap-3" data-message-id={message.id}>
      <span className="mt-0.5 shrink-0">
        <BrainMark size={18} />
      </span>
      <div className="min-w-0 flex-1">
        {message.thinking ? (
          <details
            open={thinkingOpen || undefined}
            onToggle={(event) => setThinkingOpen((event.target as HTMLDetailsElement).open)}
            className="mb-2 py-2"
          >
            <summary className="cursor-pointer text-[12px] text-muted">
              Thinking{streaming ? ' (still going)' : ''}
            </summary>
            <p className="mt-2 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-muted">
              {message.thinking}
            </p>
          </details>
        ) : null}

        {message.stage ? (
          <p className="mb-2 text-[12px] text-muted">{message.stage}</p>
        ) : null}

        {message.content && (look.streamReplies || !streaming) ? (
          <div className="whitespace-pre-wrap break-words text-[length:var(--transcript-size,14.5px)] leading-relaxed [font-family:var(--transcript-font)]">
            {message.content}
          </div>
        ) : null}
        {message.content && message.status !== 'streaming' ? <div className="ob-message-actions"><CopyText text={message.content} label="Copy message" /></div> : null}
        {message.content && message.status !== 'streaming' ? <ReadAloudButton text={message.content} /> : null}

        {streaming && !message.content && !message.stage ? (
          <p className="text-[13px] text-muted">Thinking…</p>
        ) : null}
        {streaming && message.content && look.streamReplies ? (
          <span className="caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-accent" />
        ) : null}

        {artifacts.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3">
            {artifacts.map(view => (
              <ArtifactCard
                key={view.artifact.id}
                view={view}
                tokens={tokens}
                highlighted={view.artifact.id === highlightId}
                onRewrite={onRewrite}
                onRestore={onRestore}
                busy={busyArtifactId === view.artifact.id}
                stage={busyArtifactId === view.artifact.id ? rewriteStage : ''}
                error={rewriteErrorFor === view.artifact.id ? rewriteError : ''}
              />
            ))}
          </ul>
        ) : null}

        {message.citations && message.citations.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {message.citations.map(citation => (
              <li key={citation.id}>
                <a
                  href={citation.url}
                  className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:border-accent/50 hover:text-ink"
                >
                  {citation.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {!!message.nativeRecord?.artifacts?.length && <section aria-label="Observed artifact files"><p className="text-[12px] text-muted">These standalone files changed during the turn. File observation is not a test result or proof of authorship.</p>{message.nativeRecord.artifacts.map(item => <button type="button" key={item.id} className="ob-text-button" onClick={() => window.dispatchEvent(new CustomEvent('app:open-artifact', { detail: { id: item.id, version: item.version } }))}>Open {item.title} · v{item.version}</button>)}</section>}
        {message.status === 'stopped' && <p role="status" className="mt-2 text-[12px] text-muted">Interrupted. The recorded text may be incomplete; no successful finish was confirmed.</p>}
        {message.error ? <p className="mt-2 text-[12px] text-warn">{message.error}</p> : null}

        {message.status === 'complete' && typeof message.ms === 'number' ? (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
            {/* Where this answer came from, said on every reply. An online answer
                is the one that left the machine, so it is labelled rather than
                left to be inferred from a model's name. */}
            {(() => {
              const online = parseCloudModel(message.model)
              return online ? (
                <span
                  className="rounded-md border border-line px-1.5 py-0.5"
                  title={`Answered online by ${online.provider.label}.`}
                >
                  online · {online.provider.label}
                </span>
              ) : (
                <span
                  className="rounded-md border border-line px-1.5 py-0.5"
                  title="Answered by a model on this machine."
                >
                  local
                </span>
              )
            })()}
            {message.model} · {(message.ms / 1000).toFixed(1)}s
          </p>
        ) : null}
      </div>
    </div>
  )
}
