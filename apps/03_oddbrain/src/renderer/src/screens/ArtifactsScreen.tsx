import { useMemo, useRef, useState } from 'react'
import {
  ArchiveRestore,
  ArrowDownToLine,
  Clock3,
  FileCode2,
  FilePlus2,
  FileText,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { Artifact, ArtifactKind, Workspace } from '../../../shared/workspace'
import {
  MAX_ARTIFACT_BYTES,
  importArtifact,
  kindFromName,
  removeArtifact,
  restoreArtifact,
  reviseArtifact,
} from '../../../shared/workspace'
import { newId, now } from '../data/useWorkspace'
import { isDesktop } from '../data/client'

type Props = {
  data: Workspace
  update: (change: (data: Workspace) => Workspace) => Promise<boolean>
  notice: (text: string) => void
}
const extensions: Record<ArtifactKind, string> = { html: 'html', svg: 'svg', text: 'txt' }

export function ArtifactsScreen({ data, update, notice }: Props) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | ArtifactKind>('all')
  const [order, setOrder] = useState<'recent' | 'name'>('recent')
  const [selected, setSelected] = useState<string | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const matching = useMemo(
    () =>
      data.artifacts
        .filter(
          (item) =>
            (kind === 'all' || item.kind === kind) &&
            `${item.title} ${item.kind}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .sort((a, b) =>
          order === 'name'
            ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
            : b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
        ),
    [data.artifacts, kind, order, query],
  )
  const active: Artifact | undefined = matching.find((item) => item.id === selected) || matching[0]
  const activeVersion = active
    ? Math.min(Math.max(version ?? active.versions.length - 1, 0), active.versions.length - 1)
    : 0
  const content = active?.versions[activeVersion]?.content || ''
  const importFile = async (file?: File): Promise<void> => {
    if (!file) return
    const found = kindFromName(file.name)
    if (!found) {
      notice('Import HTML, SVG, TXT or Markdown files only. Nothing was saved.')
      return
    }
    if (file.size > MAX_ARTIFACT_BYTES) {
      notice('That file is over 256 KB. Nothing was saved.')
      return
    }
    try {
      const id = newId(),
        source = await file.text()
      const ok = await update((before) => importArtifact(before, id, file.name, found, source, now()))
      if (ok) {
        setSelected(id)
        setVersion(null)
        notice('Imported into this local workspace.')
      }
    } catch (failure) {
      notice((failure as Error).message)
    }
    if (picker.current) picker.current.value = ''
  }
  const saveVersion = async (): Promise<void> => {
    if (!active) return
    const ok = await update((before) => reviseArtifact(before, active.id, draft, now()))
    if (ok) {
      setEditing(false)
      setVersion(null)
      notice('A new version was saved. Earlier versions remain available.')
    }
  }
  const exportArtifact = (): void => {
    if (!active) return
    const blob = new Blob([content], {
      type: active.kind === 'svg' ? 'image/svg+xml' : active.kind === 'html' ? 'text/html' : 'text/plain',
    })
    const url = URL.createObjectURL(blob),
      link = document.createElement('a')
    link.href = url
    link.download = `${active.title.replace(/[^\w.-]+/g, '-').slice(0, 70) || 'artifact'}.${extensions[active.kind]}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice('Selected-version download requested.')
  }
  return (
    <section className="artifacts-screen" aria-label="Artifacts">
      <div className="artifact-library">
        <div className="screen-heading">
          <div>
            <h1>Artifacts</h1>
            <p>Save, browse, and iterate on your creations.</p>
          </div>
          <button className="outline-button" type="button" onClick={() => picker.current?.click()}>
            <Upload size={15} /> Import
          </button>
          <input
            ref={picker}
            type="file"
            accept=".html,.htm,.svg,.txt,.md"
            hidden
            onChange={(event) => void importFile(event.target.files?.[0])}
            aria-label="Import artifact file"
          />
        </div>
        <div className="artifact-controls">
          <label className="inline-search">
            <Search size={14} />
            <input
              aria-label="Search artifacts"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search artifacts"
            />
          </label>
          <div className="segmented" aria-label="Artifact type">
            {(['all', 'html', 'svg', 'text'] as const).map((option) => (
              <button
                type="button"
                key={option}
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
              >
                {option === 'all' ? 'All' : option.toUpperCase()}
              </button>
            ))}
          </div>
          <select
            aria-label="Sort artifacts"
            value={order}
            onChange={(event) => setOrder(event.target.value as 'recent' | 'name')}
          >
            <option value="recent">Newest first</option>
            <option value="name">By name</option>
          </select>
          <button type="button" className="text-button" onClick={() => setTrashOpen(true)}>
            <Trash2 size={14} /> Trash {data.trash.length ? `(${data.trash.length})` : ''}
          </button>
        </div>
        <div className="artifact-list" data-find-scroll>
          {!data.artifacts.length ? (
            <div className="empty-card">
              <FilePlus2 size={23} />
              <h2>Nothing here yet.</h2>
              <p>
                Import a local HTML, SVG, TXT or Markdown file. Each saved revision remains available, and
                removed files move to Trash.
              </p>
            </div>
          ) : !matching.length ? (
            <p className="quiet">No artifacts match your search or filter.</p>
          ) : (
            <ul className="artifact-grid">
              {matching.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`artifact-tile ${active?.id === item.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelected(item.id)
                      setVersion(null)
                      setEditing(false)
                    }}
                    aria-label={`Open ${item.title}`}
                  >
                    <span className="artifact-icon">
                      {item.kind === 'text' ? <FileText size={22} /> : <FileCode2 size={22} />}
                    </span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.kind.toUpperCase()} · {item.versions.length} version
                      {item.versions.length === 1 ? '' : 's'}
                    </small>
                    <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString()}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="local-footnote">
          {data.artifacts.length} stored here.{' '}
          {isDesktop()
            ? 'Saved to your desktop workspace file.'
            : 'Browser preview records stay in this browser, separate from the desktop app.'}
        </p>
      </div>
      <aside className="artifact-inspector" aria-label="Artifact details">
        {active ? (
          <>
            <div className="inspector-header">
              <div>
                <strong>{active.title}</strong>
                <span>
                  {active.kind.toUpperCase()} · {active.versions.length} version
                  {active.versions.length === 1 ? '' : 's'}
                </span>
              </div>
              <button
                className="icon-button"
                aria-label="Export selected version"
                type="button"
                onClick={exportArtifact}
              >
                <ArrowDownToLine size={16} />
              </button>
            </div>
            <div className="inspector-actions">
              <select
                aria-label="Artifact version"
                value={activeVersion}
                onChange={(event) => {
                  setVersion(Number(event.target.value))
                  setEditing(false)
                }}
              >
                {active.versions.map((item, index) => (
                  <option key={`${item.at}-${index}`} value={index}>
                    Version {index + 1} · {new Date(item.at).toLocaleDateString()}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setEditing(!editing)
                  setDraft(content)
                }}
              >
                <Pencil size={13} /> {editing ? 'Cancel edit' : 'Edit as new version'}
              </button>
            </div>
            {editing ? (
              <div className="inspector-editor">
                <textarea
                  aria-label="Artifact source"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button className="primary-small" type="button" onClick={() => void saveVersion()}>
                  Save new version
                </button>
              </div>
            ) : active.kind === 'text' ? (
              <pre className="artifact-source">{content}</pre>
            ) : (
              <iframe
                className="artifact-preview"
                title={`Preview ${active.title}`}
                sandbox=""
                referrerPolicy="no-referrer"
                srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">${content}`}
              />
            )}
            <button
              type="button"
              className="danger-action"
              onClick={() =>
                void update((before) => removeArtifact(before, active.id)).then((ok) => {
                  if (ok) {
                    setSelected(null)
                    setEditing(false)
                    notice('Moved to Trash. You can recover it with all versions.')
                  }
                })
              }
            >
              <Trash2 size={14} /> Move to Trash
            </button>
          </>
        ) : (
          <div className="inspector-empty">
            Nothing selected<p>Documents you import appear here with their versions.</p>
          </div>
        )}
      </aside>
      {trashOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTrashOpen(false)
          }}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-label="Artifact Trash">
            <header>
              <h2>Trash</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close Trash"
                onClick={() => setTrashOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            {data.trash.length ? (
              <ul className="trash-list">
                {data.trash.map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        <Clock3 size={12} /> {item.versions.length} saved versions
                      </small>
                    </span>
                    <button
                      className="outline-button"
                      type="button"
                      onClick={() =>
                        void update((before) => restoreArtifact(before, item.id, newId())).then((ok) => {
                          if (ok) {
                            setTrashOpen(false)
                            setSelected(item.id)
                            notice('Recovered from Trash. Existing artifacts were not overwritten.')
                          }
                        })
                      }
                    >
                      <ArchiveRestore size={14} /> Recover
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet">Trash is empty.</p>
            )}
          </section>
        </div>
      ) : null}
    </section>
  )
}
