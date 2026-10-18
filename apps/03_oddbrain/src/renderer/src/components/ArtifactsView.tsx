import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  MoreHorizontal,
  Package,
  PencilLine,
  Trash2,
  Upload,
} from 'lucide-react'
import type { ArtifactSummary } from '../../../main/artifacts/store'
import { bridge } from '@/platform/bridge'
import { createZip, downloadBytes, slugify, staticSiteEntries } from '@shared/lib/zip'
import useDismiss from '@/hooks/useDismiss'
import ArtifactThumb from './ArtifactThumb'

/**
 * The Artifacts screen: everything this app has made, in one place.
 *
 * The rule the whole screen is built on is that it must not overstate itself.
 * It shows what is on disk, names the folder those files are in, says how many
 * versions each document has, and when a version is put back it says plainly
 * that the restore is itself a new version. Deleting moves files aside and the
 * message names where they went — this screen never claims to have destroyed
 * anything, because it never does.
 */

export type LibraryAnswer = { ok: boolean; error?: string; movedTo?: string; canceled?: boolean }

type Props = {
  items: ArtifactSummary[]
  loading: boolean
  error: string
  where: string
  query: string
  onRename: (id: string, title: string) => Promise<LibraryAnswer>
  onDuplicate: (id: string) => Promise<LibraryAnswer>
  onRemove: (id: string) => Promise<LibraryAnswer>
  onRestore: (id: string, version: number) => Promise<LibraryAnswer>
  onImport: () => Promise<LibraryAnswer>
  onOpenInChat: (item: ArtifactSummary) => void
  /** A line the app wants said once, e.g. how many artifacts were adopted. */
  note?: string
}

/** The date, as a person writes it. */
function day(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function size(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The document a preview shows, and which version it came from. */
type Shown = { id: string; version: number; content: string; error: string }

export default function ArtifactsView({
  items,
  loading,
  error,
  where,
  query,
  onRename,
  onDuplicate,
  onRemove,
  onRestore,
  onImport,
  onOpenInChat,
  note = '',
}: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [version, setVersion] = useState<number | null>(null)
  const [shown, setShown] = useState<Shown>({ id: '', version: 0, content: '', error: '' })
  const [said, setSaid] = useState('')
  const [menuFor, setMenuFor] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null)

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter(
      item =>
        item.title.toLowerCase().includes(needle) ||
        item.type.includes(needle) ||
        (item.origin === 'import' ? 'imported'.includes(needle) : false)
    )
  }, [items, query])

  const selected = useMemo(
    () => matching.find(item => item.id === selectedId) || matching[0] || null,
    [matching, selectedId]
  )

  // A line from the app (adoption, usually) is shown the same way as one of
  // this screen's own messages.
  useEffect(() => {
    if (note) setSaid(note)
  }, [note])

  // Long messages in this screen clear themselves rather than stacking up.
  useEffect(() => {
    if (!said) return
    const timer = setTimeout(() => setSaid(''), 5200)
    return () => clearTimeout(timer)
  }, [said])

  /**
   * Load the document that is being shown.
   *
   * `version` null means "the current one", and after a restore it is reset to
   * null so the screen moves to the version that was just written.
   */
  useEffect(() => {
    if (!selected) {
      setShown({ id: '', version: 0, content: '', error: '' })
      return
    }
    let alive = true
    void bridge.artifacts.read(selected.id, version ?? undefined).then(answer => {
      if (!alive) return
      setShown(
        answer.ok
          ? { id: selected.id, version: answer.version, content: answer.content, error: '' }
          : { id: selected.id, version: 0, content: '', error: answer.error }
      )
    })
    return () => {
      alive = false
    }
  }, [selected, version])

  const current = selected ? selected.current + 1 : 0

  const exportZip = useCallback((): void => {
    if (!selected || !shown.content) return
    try {
      const entries = staticSiteEntries({ title: selected.title, source: shown.content, type: selected.type })
      downloadBytes(createZip(entries), `${slugify(selected.title)}.zip`, 'application/zip', setSaid)
    } catch (failure) {
      setSaid((failure as Error).message)
    }
  }, [selected, shown.content])

  const saveCopy = useCallback((): void => {
    if (!selected || !shown.content) return
    const name = `${slugify(selected.title)}${shown.version && shown.version !== current ? `-v${shown.version}` : ''}.${selected.type}`
    downloadBytes(new TextEncoder().encode(shown.content), name, 'text/plain', setSaid)
  }, [selected, shown.content, shown.version, current])

  const duplicate = async (item: ArtifactSummary): Promise<void> => {
    setMenuFor('')
    const answer = await onDuplicate(item.id)
    setSaid(answer.ok ? `Copied “${item.title}”.` : answer.error || 'That could not be copied.')
  }

  const remove = async (item: ArtifactSummary): Promise<void> => {
    setMenuFor('')
    const answer = await onRemove(item.id)
    // Nothing is destroyed, so the message says where the files went.
    setSaid(
      answer.ok
        ? `“${item.title}” was taken out of the library; its files moved to ${answer.movedTo}.`
        : answer.error || 'That could not be removed.'
    )
    if (item.id === selectedId) setSelectedId('')
  }

  const commitRename = async (): Promise<void> => {
    if (!renaming) return
    const { id, text } = renaming
    setRenaming(null)
    if (!text.trim()) {
      setSaid('A title cannot be empty.')
      return
    }
    const answer = await onRename(id, text)
    setSaid(answer.ok ? `Renamed to “${text.trim()}”.` : answer.error || 'That could not be renamed.')
  }

  const restore = async (): Promise<void> => {
    if (!selected || version === null) return
    const answer = await onRestore(selected.id, version)
    if (answer.ok) {
      setVersion(null)
      setSaid(`Version ${version} was saved again as the newest version, nothing was removed.`)
    } else {
      setSaid(answer.error || 'That version could not be restored.')
    }
  }

  const bring = async (): Promise<void> => {
    const answer = await onImport()
    if (answer.canceled) return
    setSaid(answer.ok ? 'Imported. It is at the top of the grid.' : answer.error || 'That file could not be imported.')
  }

  return (
    <section className="relative flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-end justify-between gap-4 px-6 pb-4 pt-5">
          <div className="min-w-[180px] flex-1">
            <h1 className="text-[22px] font-semibold leading-tight">Artifacts</h1>
            <p className="mt-1 text-[12.5px] text-muted">Save, browse, and iterate on your creations.</p>
          </div>
          <button
            type="button"
            onClick={() => void bring()}
            className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-card px-3 text-[12.5px] text-ink transition-colors hover:border-accent/50"
          >
            <Upload size={14} />
            Import
          </button>
        </header>

        {said ? (
          <p className="mx-6 mb-3 rounded-lg border border-line bg-card px-3 py-2 text-[12px] leading-relaxed text-muted">
            {said}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
          {error ? (
            <p className="rounded-lg border border-line bg-card p-4 text-[12.5px] leading-relaxed text-muted">{error}</p>
          ) : loading && !items.length ? (
            <p className="text-[12.5px] text-muted">Reading the library…</p>
          ) : !items.length ? (
            <div className="rounded-xl border border-line bg-card p-6">
              <p className="text-[13px]">Nothing here yet.</p>
              <p className="mt-2 max-w-[52ch] text-[12.5px] leading-relaxed text-muted">
                Ask for something like “make me a pomodoro timer” in a chat, the reply’s document lands here with its
                versions, or bring an existing page or drawing in with Import.
              </p>
            </div>
          ) : !matching.length ? (
            <p className="text-[12.5px] text-muted">Nothing in the library matches “{query.trim()}”.</p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-4">
              {matching.map(item => {
                const active = selected?.id === item.id
                return (
                  <li key={item.id}>
                    <div
                      className={`group relative rounded-xl border bg-card p-2.5 transition-colors ${
                        active ? 'border-accent' : 'border-line hover:border-accent/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(item.id)
                          setVersion(null)
                          setMenuFor('')
                        }}
                        aria-label={`Open ${item.title}`}
                        className="block w-full text-left"
                      >
                        <ArtifactThumb id={item.id} type={item.type} />
                      </button>

                      {active ? (
                        <span className="pointer-events-none absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[var(--accent-ink)]">
                          <Check size={13} />
                        </span>
                      ) : null}

                      <div className="mt-2.5 flex items-start gap-2 px-1">
                        <div className="min-w-0 flex-1">
                          {renaming?.id === item.id ? (
                            <input
                              autoFocus
                              value={renaming.text}
                              onChange={event => setRenaming({ id: item.id, text: event.target.value })}
                              onKeyDown={event => {
                                if (event.key === 'Enter') void commitRename()
                                if (event.key === 'Escape') setRenaming(null)
                              }}
                              onBlur={() => void commitRename()}
                              aria-label="New title"
                              className="h-7 w-full rounded-md border border-accent/60 bg-panel px-2 text-[12.5px] text-ink outline-none"
                            />
                          ) : (
                            <span className="block truncate text-[13px]" title={item.title}>
                              {item.title}
                            </span>
                          )}
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {day(item.updatedAt)}
                            {item.versionCount > 1 ? ` · ${item.versionCount} versions` : ''}
                            {item.origin === 'import' ? ' · imported' : ''}
                          </span>
                        </div>
                        <ArtifactMenu
                          item={item}
                          open={menuFor === item.id}
                          onOpen={value => setMenuFor(value ? item.id : '')}
                          onPreview={() => {
                            setSelectedId(item.id)
                            setVersion(null)
                          }}
                          onOpenInChat={() => onOpenInChat(item)}
                          onRename={() => setRenaming({ id: item.id, text: item.title })}
                          onDuplicate={() => void duplicate(item)}
                          onExport={() => {
                            setSelectedId(item.id)
                            // The export uses what is on screen, so one frame is
                            // enough for the read to land before it is written.
                            setTimeout(exportZip, 0)
                          }}
                          onRemove={() => void remove(item)}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {where ? (
            <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted" title={where}>
              <Package size={12} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-all">
                Kept on this machine in {where}. A version is a file, so nothing here is hidden from you.
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {/* The selected artifact, larger. This is where a document actually runs:
          the grid is still pictures, this pane is the working page. */}
      <aside className="flex w-[332px] shrink-0 flex-col border-l border-line bg-panel">
        <div className="flex items-center gap-1.5 border-b border-line px-3.5 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-[12.5px]">{selected ? selected.title : 'Nothing selected'}</h2>
          <button
            type="button"
            onClick={() => selected && onOpenInChat(selected)}
            disabled={!selected?.chatId}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-muted transition-colors hover:text-ink disabled:opacity-40"
            title={selected?.chatId ? 'Open the conversation that made it' : 'This one was not made in a chat'}
          >
            <ExternalLink size={12.5} />
            Open
          </button>
          <button
            type="button"
            onClick={exportZip}
            disabled={!selected || !shown.content}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-muted transition-colors hover:text-ink disabled:opacity-40"
            title="Export a folder that any static host can serve"
          >
            <Download size={12.5} />
            Export
          </button>
        </div>

        {!selected ? (
          <p className="p-4 text-[12px] leading-relaxed text-muted">
            {items.length
              ? 'Pick something from the grid to look at it here.'
              : 'Documents you make in a chat appear here with their versions.'}
          </p>
        ) : shown.error ? (
          <p className="p-4 text-[12px] leading-relaxed text-muted">{shown.error}</p>
        ) : (
          <>
            <div className="min-h-0 flex-1 p-3">
              <iframe
                // The working document: scripts are allowed here, exactly as in
                // the chat preview, because this is the page itself.
                sandbox="allow-scripts"
                srcDoc={shown.content}
                title={`Preview of ${selected.title}`}
                className="h-full w-full rounded-lg border border-line bg-white"
              />
            </div>

            <div className="border-t border-line p-3.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {Array.from({ length: selected.versionCount }, (_, index) => selected.versionCount - index).map(number => (
                  <button
                    key={number}
                    type="button"
                    onClick={() => setVersion(number === current ? null : number)}
                    className={`h-7 rounded-md border px-2 text-[11.5px] transition-colors ${
                      number === (version ?? current)
                        ? 'border-accent bg-accent/15 text-ink'
                        : 'border-line text-muted hover:text-ink'
                    }`}
                    title={number === current ? 'The newest version' : `Version ${number}`}
                  >
                    v{number}
                  </button>
                ))}
                {version !== null && version !== current ? (
                  <button
                    type="button"
                    onClick={() => void restore()}
                    className="h-7 rounded-md bg-accent px-2.5 text-[11.5px] font-medium text-[var(--accent-ink)] transition-colors hover:bg-accent/90"
                  >
                    Save v{version} again
                  </button>
                ) : null}
              </div>

              <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
                {version !== null && version !== current
                  ? `Showing version ${version} of ${selected.versionCount}. Putting it back saves it as version ${selected.versionCount + 1}, the newer versions stay.`
                  : `${selected.versionCount === 1 ? 'One version' : `${selected.versionCount} versions, newest shown`} · ${day(selected.updatedAt)}${size(selected.bytes) ? ` · ${size(selected.bytes)}` : ''}`}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRenaming({ id: selected.id, text: selected.title })}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[11.5px] text-muted transition-colors hover:text-ink"
                >
                  <PencilLine size={12.5} />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => void duplicate(selected)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[11.5px] text-muted transition-colors hover:text-ink"
                >
                  <Copy size={12.5} />
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={saveCopy}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[11.5px] text-muted transition-colors hover:text-ink"
                  title="Save this version as a file"
                >
                  <Download size={12.5} />
                  Copy out
                </button>
                <button
                  type="button"
                  onClick={() => void remove(selected)}
                  className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[11.5px] text-muted transition-colors hover:border-brand/70 hover:text-ink"
                  title="Moves the files aside; nothing is destroyed"
                >
                  <Trash2 size={12.5} />
                  Remove
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </section>
  )
}

function ArtifactMenu({
  item,
  open,
  onOpen,
  onPreview,
  onOpenInChat,
  onRename,
  onDuplicate,
  onExport,
  onRemove,
}: {
  item: ArtifactSummary
  open: boolean
  onOpen: (open: boolean) => void
  onPreview: () => void
  onOpenInChat: () => void
  onRename: () => void
  onDuplicate: () => void
  onExport: () => void
  onRemove: () => void
}) {
  const box = useRef<HTMLDivElement | null>(null)
  useDismiss(box, () => onOpen(false), open)

  const row = 'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-muted hover:bg-white/[0.06] hover:text-ink'
  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => onOpen(!open)}
        aria-label={`More actions for ${item.title}`}
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <MoreHorizontal size={15} />
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-20 w-[168px] overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-xl">
          <button type="button" className={row} onClick={() => (onPreview(), onOpen(false))}>
            <FileImage size={12.5} />
            Show here
          </button>
          {item.chatId ? (
            <button type="button" className={row} onClick={() => (onOpenInChat(), onOpen(false))}>
              <ExternalLink size={12.5} />
              Open in chat
            </button>
          ) : null}
          <button type="button" className={row} onClick={onRename}>
            <PencilLine size={12.5} />
            Rename
          </button>
          <button type="button" className={row} onClick={onDuplicate}>
            <Copy size={12.5} />
            Duplicate
          </button>
          <button type="button" className={row} onClick={onExport}>
            <Download size={12.5} />
            Export as folder
          </button>
          <button type="button" className={row} onClick={onRemove}>
            <Trash2 size={12.5} />
            Remove
          </button>
        </div>
      ) : null}
    </div>
  )
}
