import { useEffect, useMemo, useRef, useState } from 'react'
import type { Artifact } from '@shared/types'
import { bridge } from '@/platform/bridge'
import { buildPreviewHtml, parseElementPick, sourceSignature, type ElementPick } from '@shared/lib/artifacts'

/**
 * A rendered artifact, in a box it cannot get out of.
 *
 * Three things make this safe rather than merely convenient:
 *
 *  - the frame is `sandbox="allow-scripts"` with no `allow-same-origin`, so the
 *    document has an opaque origin: it cannot read this app, its storage, or
 *    anything on the machine;
 *  - the HTML is built by the shared library, which puts its own
 *    Content-Security-Policy in the head before anything else — no remote scripts,
 *    no fonts, no eval, and `connect-src 'none'`, so an artifact cannot call home
 *    even if it tries;
 *  - the only way information comes back is the small script the library injects,
 *    which posts to this window on a channel specific to this artifact.
 *
 * Comment mode works through that last channel: this component tells the frame to
 * switch to picking, the frame paints an outline as the pointer moves and posts
 * the element that was clicked, and `parseElementPick` refuses anything that does
 * not belong to this artifact or that does not look like a real element path.
 *
 * A preview that reports an error says so in the panel, in one line. It must not
 * reach the console: artifacts are model output, and a broken one is expected
 * sometimes rather than an emergency.
 */

let previewSequence = 0

export default function ArtifactPreview({
  artifact,
  source,
  draft,
  tokens,
  height = 420,
  picking = false,
  onPick,
  onCancelPick,
}: {
  artifact: Artifact
  source: string
  draft: boolean
  /** CSS custom properties from the chosen design system, injected before the
   *  artifact's own rules so the artifact still wins. */
  tokens?: string
  height?: number
  /** True while the person is choosing an element to comment on. */
  picking?: boolean
  onPick?: (pick: ElementPick) => void
  onCancelPick?: () => void
}) {
  const [problem, setProblem] = useState('')
  // One channel per mounted preview, so two previews on screen cannot read each
  // other's messages.
  const channel = useMemo(() => `artifact-${artifact.id}-${(previewSequence += 1)}`, [artifact.id])

  const html = useMemo(
    () => buildPreviewHtml(source, channel, tokens || ''),
    [source, channel, tokens]
  )

  const signature = sourceSignature(source)
  const frame = useRef<HTMLIFrameElement | null>(null)
  // The handlers are called from a message listener that is set up once per
  // channel, so they are read through refs rather than being dependencies of it.
  const handlers = useRef({ onPick, onCancelPick })
  handlers.current = { onPick, onCancelPick }

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const payload = event.data as { channel?: string; type?: string; message?: string }
      if (!payload || payload.channel !== channel) return
      if (payload.type === 'ai-assistant-artifact-error') {
        setProblem(String(payload.message || 'The preview reported an error.').slice(0, 300))
        return
      }
      if (payload.type === 'oddbrain-pick-cancelled') {
        handlers.current.onCancelPick?.()
        return
      }
      if (payload.type === 'oddbrain-pick') {
        // Validated here, not trusted: a message from the frame is input.
        const pick = parseElementPick(payload, channel)
        if (pick) handlers.current.onPick?.(pick)
        else setProblem('That click could not be read as an element. Try picking again.')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [channel])

  // Ask the frame to switch modes. It may not have loaded yet, in which case the
  // ready message below carries the current mode instead.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { channel, type: 'ai-assistant-mode', mode: picking ? 'pick' : 'browse' },
      '*'
    )
  }, [channel, picking, signature])

  // A new document invalidates the last complaint about the old one.
  const lastSignature = useRef(signature)
  if (lastSignature.current !== signature) {
    lastSignature.current = signature
    if (problem) setProblem('')
  }

  const [windowNote, setWindowNote] = useState('')
  // Two doors out of the chat, both keeping the SAME sandboxed html: its own
  // window to read beside work, and a PDF in the vault to keep.
  const popOut = (): void => {
    void bridge.artifactWindow.popout(html, `${artifact.title} — OddBrain`).then((reply) => {
      setWindowNote(reply.ok ? 'Opened in its own window.' : 'The window refused to open.')
    })
  }
  const savePdf = (): void => {
    setWindowNote('Rendering the PDF…')
    void bridge.artifactWindow.savePdf(html, artifact.title).then((reply) => {
      setWindowNote(reply.ok ? `Saved: ${reply.answer}` : `The PDF failed: ${reply.answer}`)
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{artifact.title}</span>
        <button
          type="button"
          onClick={popOut}
          title="Open this artifact in its own window, so it can sit beside your work"
          className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
        >
          Pop out
        </button>
        <button
          type="button"
          onClick={savePdf}
          title="Save this artifact as a PDF inside your vault, under Artifacts PDF"
          className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
        >
          Save as PDF
        </button>
      </div>
      <iframe
        ref={frame}
        // Keyed on the source: a changed document gets a fresh frame rather than a
        // stale one, which is what makes the live draft actually redraw.
        key={signature}
        title={`${artifact.title} preview`}
        sandbox="allow-scripts"
        srcDoc={html}
        onLoad={() =>
          frame.current?.contentWindow?.postMessage(
            { channel, type: 'ai-assistant-mode', mode: picking ? 'pick' : 'browse' },
            '*'
          )
        }
        className={`block w-full border-0 bg-white ${picking ? 'cursor-crosshair' : ''}`}
        style={{ height }}
      />
      {picking ? (
        <p className="border-t border-line px-3 py-2 text-[11.5px] text-accent">
          Click the element you want changed. Escape cancels.
        </p>
      ) : null}
      {problem ? (
        <p className="border-t border-line px-3 py-2 text-[11.5px] text-warn">
          This artifact reported: {problem}
        </p>
      ) : null}
      {draft ? (
        <p className="border-t border-line px-3 py-2 text-[11.5px] text-muted">
          Still being written. The preview redraws as the model works.
        </p>
      ) : null}
      {windowNote ? <p className="border-t border-line px-3 py-2 text-[11px] text-muted">{windowNote}</p> : null}
    </div>
  )
}
