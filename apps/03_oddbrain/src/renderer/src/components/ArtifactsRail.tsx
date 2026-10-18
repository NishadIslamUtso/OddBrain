import { FileCode2, Package, PanelRightClose } from 'lucide-react'
import type { Artifact } from '@shared/types'

/**
 * The rail down the right: every file this conversation produced, newest first.
 *
 * It is a list of what exists, not a second way to do things. Clicking one takes
 * you to it in the transcript — which is what you want when a chat has scrolled
 * past three artifacts and you are looking for the first one.
 */
export default function ArtifactsRail({
  items,
  onJump,
  onClose,
}: {
  items: Array<{ artifact: Artifact; messageId: string }>
  onJump: (artifact: Artifact) => void
  /** Collapse this rail; the chat widens and a small button brings it back. */
  onClose?: () => void
}) {
  return (
    <aside className="flex w-[212px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center gap-1 px-3.5 pb-1 pt-2.5">
        <h2 className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wide text-muted">Artifacts</h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide the artifacts panel"
            title="Hide this panel"
            className="rounded p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <PanelRightClose size={13} />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-1.5">
        <ul className="flex flex-col gap-2">
          {items.map(({ artifact }) => (
            <li key={artifact.id}>
              <button
                type="button"
                onClick={() => onJump(artifact)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-card px-2.5 py-2 text-left transition-colors hover:border-accent/50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <FileCode2 size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px]">{artifact.title}</span>
                  <span className="text-[10.5px] text-muted">
                    {artifact.partial
                      ? 'Writing…'
                      : artifact.type === 'svg'
                        ? 'SVG'
                        : 'HTML'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted">
          <Package size={12} className="mt-0.5 shrink-0" />
          Each one exports as a folder you can drop on any static host.
        </p>
      </div>
    </aside>
  )
}
