import { sourceReading, type RecallHit } from '@shared/lib/recall'
import MemoryMap from './MemoryMap'
import { sampleEnabled } from '@shared/lib/sampleWorkspace'
import { Mascot } from '../motion/Mascot'
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, FileText, Search } from 'lucide-react'
import { vaultGet } from '@shared/lib/vault'
import { bridge, isDemo } from '@/platform/bridge'

/**
 * Vault (05) — the folder, on screen.
 *
 * The tree the vault really has, search over names and contents, a preview
 * of one file, and "add to composer" so a note can become context in the
 * very next ask. Everything here reads the vault's own HTTP surface — the
 * same rules that guard captures guard these reads: nothing outside the
 * root, symlinks refused, previews capped. Capsules appear here the day
 * they are real files, and not one day before.
 */

const leaf = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? path
const folderOf = (path: string): string => path.split('/').slice(0, -1).join('/') || '(root)'

export default function VaultView({ onAddToComposer, sourceRequest }: { sourceRequest?: { path: string; title?: string } | null; onAddToComposer: (path: string, content: string) => void }) {
  const [sources, setSources] = useState(false)
  useEffect(() => { const open = () => setSources(true); window.addEventListener('app:vault-sources-select', open); return () => window.removeEventListener('app:vault-sources-select', open) }, [])
  const mounted = useRef(false), fileTicket = useRef(0), searchTicket = useRef(0)
  const [files, setFiles] = useState<string[]>([])
  const [exported, setExported] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [imported, setImported] = useState('')
  const [importing, setImporting] = useState(false)
  const [root, setRoot] = useState('')
  const [capped, setCapped] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [selected, setSelected] = useState<{ path: string; content: string; truncated: boolean; title?: string } | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<RecallHit[] | null>(null)
  const [searching, setSearching] = useState(false), [searchNote, setSearchNote] = useState('')
  const [problem, setProblem] = useState('')
  const [dropping, setDropping] = useState(false)

  // A dropped conversations.json is the same import, minus the file picker.
  // One file at a time; anything unresolvable is said out loud, not ignored.
  const runDropImport = (files: FileList | null): void => {
    const file = files?.[0]
    if (!file) return
    setImporting(true)
    setImported('')
    void bridge.vault
      .pathForFile(file)
      .then((path) => {
        if (!path) {
          if (mounted.current) setImported('That dropped file could not be located on disk. Use the import button instead.')
          return null
        }
        return bridge.vault.importChatsFromPath(path).then((answer) => {
          if (!mounted.current) return
          setImported(answer.answer)
          if (answer.ok) loadTree()
        })
      })
      .catch(() => { if (mounted.current) setImported('The import could not run.') })
      .finally(() => { if (mounted.current) setImporting(false) })
  }

  const loadTree = (): void => {
    setState('loading')
    vaultGet('/files')
      .then((reply) => {
        if (!mounted.current) return
        if (reply?.available === false || reply?.ok !== true) {
          setState('missing')
          setProblem(String(reply?.error || 'No vault folder was found.'))
          return
        }
        setFiles(Array.isArray(reply.files) ? reply.files : [])
        setRoot(String(reply.root || ''))
        setCapped(reply.capped === true)
        setState('ready')
        setProblem('')
      })
      .catch(() => { if (mounted.current) { setState('missing'); setProblem('The vault could not be read.') } })
  }

  // One load when the screen appears.
  useEffect(() => {
    mounted.current = true
    if (!isDemo || sampleEnabled()) loadTree()
    else setState('missing')
    return () => { mounted.current = false; fileTicket.current++; searchTicket.current++ }
  }, [])

  const openFile = (path: string, title?: string): void => {
    const ticket = ++fileTicket.current
    setProblem(''); setSelected(null)
    vaultGet(`/file?path=${encodeURIComponent(path)}`)
      .then((reply) => {
        if (!mounted.current || ticket !== fileTicket.current) return
        if (reply?.ok !== true) {
          setProblem(String(reply?.error || 'The file could not be read.'))
          return
        }
        setSelected({ path, title, content: String(reply.content || ''), truncated: reply.truncated === true })
      })
      .catch((reason) => { if (mounted.current && ticket === fileTicket.current) setProblem(reason instanceof Error && reason.message ? reason.message : 'The file could not be read.') })
  }

  useEffect(() => { if (sourceRequest) { setSources(false); openFile(sourceRequest.path, sourceRequest.title) } }, [sourceRequest])

  const searchContents = (): void => {
    const ticket = ++searchTicket.current
    const needle = query.trim()
    setHits(null); setSearchNote(''); setProblem(''); setSearching(Boolean(needle))
    if (!needle) {
      setHits(null)
      return
    }
    vaultGet(`/recall?q=${encodeURIComponent(needle)}`)
      .then((reply) => {
        if (!mounted.current || ticket !== searchTicket.current) return
        setSearching(false)
        if (reply?.ok !== true) {
          setProblem(String(reply?.notices?.join(' ') || reply?.error || 'The search failed.'))
          return
        }
        setHits(Array.isArray(reply.hits) ? reply.hits : [])
        setSearchNote((reply.notices || []).join(' '))
        setProblem('')
      })
      .catch(() => { if (mounted.current && ticket === searchTicket.current) { setSearching(false); setProblem('The search failed.') } })
  }

  const nameMatches = query.trim()
    ? files.filter((file) => file.toLowerCase().includes(query.trim().toLowerCase()))
    : files

  const groups = new Map<string, string[]>()
  for (const file of nameMatches) {
    const folder = folderOf(file)
    if (!groups.has(folder)) groups.set(folder, [])
    groups.get(folder)?.push(file)
  }

  return (
    <div
      className="ob-workspace-page ob-vault-view flex-1 overflow-hidden"
      aria-label="Vault"
      onDragOver={(event) => {
        if (![...event.dataTransfer.types].includes('Files')) return
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDropping(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDropping(false)
        runDropImport(event.dataTransfer.files)
      }}
    >
      {dropping ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-bg)]/80" aria-hidden>
          <p className="rounded-xl border border-line px-4 py-3 text-[13px] text-ink">Drop conversations.json to import it</p>
        </div>
      ) : null}
      <div className="mx-auto flex h-full w-full max-w-[var(--chat-width)] flex-col px-4 py-6">
        <header className="ob-screen-header flex items-center gap-2.5">
          <Mascot motion="read" size={32} static />
          <h1 className="text-[20px] font-semibold text-ink">Vault</h1><button type="button" className="ob-small-button" aria-pressed={sources} onClick={() => setSources(!sources)}>{sources ? 'Show files' : 'Capture sources'}</button>
          {root ? (
            <span className="min-w-0 truncate text-[11.5px] text-muted" title={root}>
              {root}
            </span>
          ) : null}
          {root ? (
            <>
              <button
                type="button"
                onClick={() => void window.api?.app?.openVaultFolder?.()}
                title="Open this folder in the file manager"
                className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-muted hover:text-ink"
              >
                <ExternalLink size={11} aria-hidden /> Open folder
              </button>
              <button
                type="button"
                onClick={() => {
                  void bridge.vault.exportCopy().then((answer) => setExported(answer.answer))
                }}
                title="A timestamped, portable copy of every markdown file, for Obsidian or another machine; excludes attachments and review history"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-muted hover:text-ink"
              >
                Export copy
              </button>
              <button
                type="button"
                onClick={() => {
                  setImporting(true)
                  void bridge.vault
                    .importChats()
                    .then((answer) => {
                      if (!mounted.current) return
                      setImported(answer.answer)
                      if (answer.ok) loadTree()
                    })
                    .catch(() => { if (mounted.current) setImported('The import could not run.') })
                    .finally(() => { if (mounted.current) setImporting(false) })
                }}
                title="Bring a ChatGPT or Claude data export (conversations.json) into the vault as searchable markdown"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-muted hover:text-ink"
              >
                {importing ? 'Importing…' : 'Import chat export'}
              </button>
            </>
          ) : null}
        </header>
        {sources ? <div className="min-h-0 flex-1 overflow-auto"><MemoryMap open onClose={() => setSources(false)} embedded /></div> : <>
        <details className="ob-vault-backup"><summary>Backup &amp; restore</summary><p className="ob-memory-caption">Full vault copies include conversations, attachments, confirmed memory and review history. Markdown export does not. Backups contain sensitive information; choose a private location, preferably on another drive. Models, app credentials and unsent browser queues are not included.</p><div className="ob-memory-actions">{(['create', 'restore'] as const).map(operation => <button type="button" key={operation} className="ob-small-button" disabled={backupBusy} onClick={() => { setBackupBusy(true); setExported(''); void bridge.vault.backup(operation).then(reply => setExported(reply.answer)).catch(() => setExported('The backup operation failed. No complete copy is reported.')).finally(() => setBackupBusy(false)) }}>{operation === 'create' ? 'Back up full vault' : 'Restore into a new folder'}</button>)}</div>{backupBusy && <p role="status">Choose the folders in the desktop dialog. Keep the app open until verification finishes.</p>}</details>
        {exported ? <p className="mt-1 text-[11px] text-muted">{exported}</p> : null}
        {imported ? <p className="mt-1 text-[11px] text-muted">{imported}</p> : null}

        <div className="mt-4 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={13} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => { searchTicket.current++; setHits(null); setSearching(false); setSearchNote(''); setQuery(event.target.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') searchContents()
              }}
              placeholder="Filter names; Enter searches content. Quote an exact phrase."
              aria-label="Search the vault"
              className="h-9 w-full rounded-lg border border-line bg-card pl-8 pr-3 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-accent/60"
            />
          </div>
        </div>

        {state === 'loading' ? <p className="mt-6 text-[12.5px] text-muted">Reading the vault…</p> : null}
        {state === 'missing' ? (
          <div className="ob-screen-empty"><Mascot motion="read" size={88} static /><h2>{isDemo ? 'Your files stay in the desktop app' : 'Choose a vault'}</h2><p>{isDemo ? 'Open OddBrain on your computer to browse notes and captures.' : 'Set a folder in Settings → Vault. Its notes and captures appear here.'}</p></div>
        ) : null}
        {state === 'ready' && files.length === 0 ? (
          <div className="ob-screen-empty"><Mascot motion="read" size={88} static /><h2>No notes yet</h2><p>Notes and browser captures in this folder will appear here.</p></div>
        ) : null}
        {searching && <p role="status" className="ob-memory-caption">Searching saved conversations, confirmed memory and files…</p>}
        {searchNote && <p role="status" className="ob-memory-caption">{searchNote}</p>}
        {problem ? <p className="mt-2 text-[12px] text-warn">{problem}</p> : null}

        <div className="mt-3 flex min-h-0 flex-1 gap-4">
          {/* The tree, grouped by the folders that really exist. */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            {capped ? <p className="mb-2 text-[11px] text-muted">Large vault, the list stops early.</p> : null}
            {hits ? (
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {hits.length ? `${hits.length} ranked ${hits.length === 1 ? 'match' : 'matches'}` : 'No matches in the searched records'}
                  </h2>
                  <button type="button" onClick={() => setHits(null)} className="text-[11px] text-muted hover:text-ink">
                    clear
                  </button>
                </div>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => openFile(hit.path, hit.title)}
                        className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04]"
                      >
                        <span className="block truncate text-[12px] text-ink">{hit.title}</span><span className="block text-[11px] text-muted">{hit.kind === 'confirmed' ? 'Confirmed memory' : hit.kind === 'conversation' ? 'Original conversation' : 'Saved file'} · {hit.speaker}</span>
                        <span className="block truncate font-mono text-[11px] text-muted">{hit.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              Array.from(groups.entries()).map(([folder, groupFiles]) => (
                <div key={folder} className="mb-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{folder}</h2>
                  <ul className="mt-1 flex flex-col">
                    {groupFiles.map((file) => (
                      <li key={file}>
                        <button
                          type="button"
                          onClick={() => openFile(file)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04] ${
                            selected?.path === file ? 'bg-panel' : ''
                          }`}
                        >
                          <FileText size={12} className="shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{leaf(file)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            {state === 'ready' && nameMatches.length === 0 && !hits ? (
              <p className="text-[12.5px] text-muted">No file name matches that.</p>
            ) : null}
          </div>

          {/* The preview, and the bridge into the composer. */}
          {selected ? (
            <aside className="flex w-[46%] max-w-[480px] flex-col rounded-xl border border-line bg-card">
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink" title={selected.path}>
                  {selected.title || leaf(selected.path)}
                </span>
                <button
                  type="button"
                  onClick={() => onAddToComposer(selected.path, sourceReading(selected.content))}
                  title="Put this note into the composer as context"
                  className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-medium text-[var(--accent-ink)] hover:bg-accent/90"
                >
                  Add to composer
                </button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-muted">
                {sourceReading(selected.content) || '(empty file)'}
                {selected.truncated ? '\n… (the rest is in the file on disk)' : ''}
              </pre>
            </aside>
          ) : null}
        </div>
        </>}
      </div>
    </div>
  )
}
