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

export default function VaultView({ onAddToComposer }: { onAddToComposer: (path: string, content: string) => void }) {
  const [sources, setSources] = useState(false)
  useEffect(() => { const open = () => setSources(true); window.addEventListener('app:vault-sources-select', open); return () => window.removeEventListener('app:vault-sources-select', open) }, [])
  const mounted = useRef(false), fileTicket = useRef(0), searchTicket = useRef(0)
  const [files, setFiles] = useState<string[]>([])
  const [exported, setExported] = useState('')
  const [root, setRoot] = useState('')
  const [capped, setCapped] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [selected, setSelected] = useState<{ path: string; content: string; truncated: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Array<{ path: string; line: number; text: string }> | null>(null)
  const [problem, setProblem] = useState('')

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

  const openFile = (path: string): void => {
    const ticket = ++fileTicket.current
    setProblem('')
    vaultGet(`/file?path=${encodeURIComponent(path)}`)
      .then((reply) => {
        if (!mounted.current || ticket !== fileTicket.current) return
        if (reply?.ok !== true) {
          setProblem(String(reply?.error || 'The file could not be read.'))
          return
        }
        setSelected({ path, content: String(reply.content || ''), truncated: reply.truncated === true })
      })
      .catch(() => { if (mounted.current && ticket === fileTicket.current) setProblem('The file could not be read.') })
  }

  const searchContents = (): void => {
    const ticket = ++searchTicket.current
    const needle = query.trim()
    if (!needle) {
      setHits(null)
      return
    }
    vaultGet(`/grep?q=${encodeURIComponent(needle)}`)
      .then((reply) => {
        if (!mounted.current || ticket !== searchTicket.current) return
        if (reply?.ok !== true) {
          setProblem(String(reply?.error || 'The search failed.'))
          return
        }
        setHits(Array.isArray(reply.hits) ? reply.hits : [])
        setProblem('')
      })
      .catch(() => { if (mounted.current && ticket === searchTicket.current) setProblem('The search failed.') })
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
    <div className="ob-workspace-page ob-vault-view flex-1 overflow-hidden" aria-label="Vault">
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
                title="A timestamped, portable copy of every markdown file, hand it to Obsidian, a backup, or another machine"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-muted hover:text-ink"
              >
                Export copy
              </button>
            </>
          ) : null}
        </header>
        {sources ? <div className="min-h-0 flex-1 overflow-auto"><MemoryMap open onClose={() => setSources(false)} embedded /></div> : <>
        {exported ? <p className="mt-1 text-[11px] text-muted">{exported}</p> : null}

        <div className="mt-4 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={13} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => { searchTicket.current++; setHits(null); setQuery(event.target.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') searchContents()
              }}
              placeholder="Filter names, or press Enter to search contents"
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
        {problem ? <p className="mt-2 text-[12px] text-warn">{problem}</p> : null}

        <div className="mt-3 flex min-h-0 flex-1 gap-4">
          {/* The tree, grouped by the folders that really exist. */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            {capped ? <p className="mb-2 text-[11px] text-muted">Large vault, the list stops early.</p> : null}
            {hits ? (
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {hits.length ? `${hits.length} ${hits.length === 1 ? 'file mentions it' : 'files mention it'}` : 'Nothing mentions it'}
                  </h2>
                  <button type="button" onClick={() => setHits(null)} className="text-[11px] text-muted hover:text-ink">
                    clear
                  </button>
                </div>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {hits.map((hit) => (
                    <li key={`${hit.path}:${hit.line}`}>
                      <button
                        type="button"
                        onClick={() => openFile(hit.path)}
                        className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04]"
                      >
                        <span className="block truncate text-[12px] text-ink">{leaf(hit.path)}</span>
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
                  {leaf(selected.path)}
                </span>
                <button
                  type="button"
                  onClick={() => onAddToComposer(selected.path, selected.content)}
                  title="Put this note into the composer as context"
                  className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-medium text-[var(--accent-ink)] hover:bg-accent/90"
                >
                  Add to composer
                </button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-muted">
                {selected.content || '(empty file)'}
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
