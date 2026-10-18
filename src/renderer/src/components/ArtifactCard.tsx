import { useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  History,
  Loader2,
  MessageSquarePlus,
  Package,
  RotateCcw,
  X,
} from 'lucide-react'
import type { Artifact } from '@shared/types'
import { createZip, downloadBytes, slugify, staticSiteEntries } from '@shared/lib/zip'
import type { ElementPick } from '@shared/lib/artifacts'
import type { ArtifactView } from '@/state/artifactView'
import { currentVersion, describePick, versionLabel } from '@/state/artifactEdits'
import ArtifactPreview from './ArtifactPreview'

/**
 * A file the model wrote, and the three things a person wants from one: to see
 * it, to change a piece of it, and to take it away.
 *
 * Comment mode is the middle one. It is deliberately not a text box that rewrites
 * the whole document on request — you point at the thing you mean, you say what is
 * wrong with it, and only that element comes back. On a 3B model that difference
 * is the difference between a usable edit and a rewritten file that lost everything
 * you liked about it.
 */
export default function ArtifactCard({
  view,
  tokens,
  highlighted,
  onRewrite,
  onRestore,
  busy,
  stage,
  error,
}: {
  view: ArtifactView
  tokens: string
  highlighted: boolean
  /** Ask the model to change one element. Resolves true when a new version landed. */
  onRewrite: (request: { artifact: Artifact; source: string; pick: ElementPick; comment: string }) => Promise<boolean>
  /** Put an earlier version back. */
  onRestore: (artifact: Artifact, index: number) => void
  busy: boolean
  stage: string
  error: string
}) {
  const { artifact, source: newestSource, draft } = view
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(true)
  const [problem, setProblem] = useState('')
  const [picking, setPicking] = useState(false)
  const [pick, setPick] = useState<ElementPick | null>(null)
  const [comment, setComment] = useState('')
  // Counted back from the newest rather than stored as an index: a rewrite adds a
  // version, and an index would then point at a different document than the one
  // the person chose — or off the end of the list entirely.
  const [backFrom, setBackFrom] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)

  const versions = artifact.versions.length
  const newest = currentVersion(artifact)
  const viewing = Math.min(Math.max(newest - backFrom, 0), newest)
  const onOlder = viewing !== newest
  // The newest text may be a live draft that has not been saved as a version yet,
  // so it comes from the view; anything older is read from the saved list.
  const source = onOlder ? artifact.versions[viewing]?.content || '' : newestSource

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // A refused clipboard is not worth a dialog: the source is right there.
    }
  }

  /**
   * The deployable folder: the document, the two hosting configs and a README.
   * Entries and the archive both come from the shared library, which is where the
   * ZIP writing is already tested.
   */
  const exportZip = (): void => {
    try {
      const entries = staticSiteEntries({
        title: artifact.title,
        source,
        type: artifact.type,
        note: draft ? 'Exported while the model was still writing this file.' : '',
      })
      downloadBytes(createZip(entries), `${slugify(artifact.title)}.zip`, 'application/zip', setProblem)
    } catch (failure) {
      setProblem((failure as Error).message)
    }
  }

  const submitComment = async (): Promise<void> => {
    if (!pick) return
    const accepted = await onRewrite({ artifact, source, pick, comment })
    if (accepted) {
      setComment('')
      setPick(null)
      setPicking(false)
      setBackFrom(0) // land on whatever is newest now, whether a version was added or not
    }
  }

  const startPicking = (): void => {
    setPicking(true)
    setPick(null)
    setProblem('')
  }

  const cancelPicking = (): void => {
    setPicking(false)
    setPick(null)
  }

  return (
    <li
      id={`artifact-${artifact.id}`}
      className={`rounded-xl border bg-card p-2.5 transition-colors ${
        highlighted ? 'border-accent/70' : 'border-line'
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Hide preview' : 'Show preview'}
          title={open ? 'Hide preview' : 'Show preview'}
          className="shrink-0 rounded p-0.5 text-muted hover:text-ink"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <FileCode2 size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px]">{artifact.title}</span>
            {versions > 1 ? (
              <button
                type="button"
                onClick={() => setHistoryOpen(!historyOpen)}
                aria-expanded={historyOpen}
                title="See every version of this file"
                className="flex shrink-0 items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"
              >
                <History size={10} />
                {versionLabel(artifact)}
              </button>
            ) : null}
          </span>
          <span className="text-[11px] text-muted">
            {artifact.type.toUpperCase()}
            {draft ? ' · still being written' : ''}
            {onOlder ? ` · showing v${viewing + 1}` : ''}
          </span>
        </span>

        {!onOlder ? (
          <button
            type="button"
            onClick={startPicking}
            disabled={busy}
            title="Point at an element and say what should change"
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] ${
              picking
                ? 'border-accent/70 text-accent'
                : 'border-line text-muted hover:text-ink disabled:opacity-50'
            }`}
          >
            <MessageSquarePlus size={13} />
            Comment
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRestore(artifact, viewing)}
            title={`Put v${viewing + 1} back as the newest version`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[12px] text-muted hover:text-ink"
          >
            <RotateCcw size={13} />
            Restore
          </button>
        )}

        <button
          type="button"
          onClick={() => void copy()}
          title="Copy the source"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[12px] text-muted hover:text-ink"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={exportZip}
          title="Download a folder you can put on any static host"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[12px] text-muted hover:text-ink"
        >
          <Package size={13} />
          ZIP
        </button>
      </div>

      {historyOpen && versions > 1 ? (
        <ol className="mt-2.5 flex flex-col gap-1 rounded-lg border border-line bg-panel/60 p-2">
          {artifact.versions.map((version, index) => (
            <li key={`${index}-${version.savedAt || ''}`}>
              <button
                type="button"
                onClick={() => {
                  setBackFrom(newest - index)
                  setHistoryOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] ${
                  index === viewing ? 'bg-white/[0.06] text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                <span className="w-10 shrink-0">v{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  {version.note || (index === 0 ? 'first version' : 'edited')}
                </span>
                <span className="shrink-0 text-[10.5px] text-muted">
                  {index === versions - 1 ? 'newest' : ''}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {open ? (
        <div className="mt-2.5">
          <ArtifactPreview
            artifact={artifact}
            source={source}
            draft={draft && !onOlder}
            tokens={tokens}
            height={420}
            picking={picking && !onOlder}
            onPick={setPick}
            onCancelPick={cancelPicking}
          />
        </div>
      ) : null}

      {pick ? (
        <div className="mt-2.5 rounded-lg border border-accent/40 bg-panel/60 p-2.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
              {describePick(pick)}
            </span>
            <button
              type="button"
              onClick={cancelPicking}
              aria-label="Cancel this change"
              title="Cancel"
              className="shrink-0 rounded p-0.5 text-muted hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
          <textarea
            value={comment}
            onChange={event => setComment(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submitComment()
            }}
            rows={2}
            autoFocus
            placeholder="What should change about this element?"
            aria-label="What should change about this element"
            className="mt-2 w-full resize-none rounded-md border border-line bg-card px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent/60"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void submitComment()}
              disabled={busy || !comment.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-[var(--accent-ink)] disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : null}
              {busy ? 'Changing…' : 'Change this element'}
            </button>
            <span className="text-[11px] text-muted">
              Only that element comes back. Every version is kept.
            </span>
          </div>
        </div>
      ) : null}

      {busy && stage ? <p className="mt-2 text-[11.5px] text-muted">{stage}</p> : null}
      {error ? <p className="mt-2 text-[11.5px] text-warn">{error}</p> : null}
      {problem ? <p className="mt-2 text-[11.5px] text-warn">{problem}</p> : null}
    </li>
  )
}
