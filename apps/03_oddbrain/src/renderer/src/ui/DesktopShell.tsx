import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, Plus, Search, X } from 'lucide-react'
import AppNav, { type View, NAV_ITEMS } from '../components/AppNav'
import TitleBar from '../components/TitleBar'
import ProfileButton from './ProfileButton'
import { usePermissionsWaiting } from '../state/engine'
import type { LayoutId } from '../state/look'

export type ShellItem = { id: string; title: string; detail?: string; open: () => void }
export type CommandItem = { id: string; title: string; detail?: string; run: () => void }
export type ShellNavigation = { view: View; onView: (view: View) => void; onNew: () => void; onBack?: () => void; canBack?: boolean; onSettings: () => void; name: string }
/** Exactly the same structural host in the app and the scaled Appearance
 * preview. The caller supplies real content and real callbacks in the app,
 * small read-only sample components in the preview. */
export default function DesktopShell({ layout, navigation, sidebar, items = [], commands = [], children, preview = false, suspended = false, extraSearch, onSearchQuery, searchNote = '' }: {
  layout: LayoutId; navigation: ShellNavigation; sidebar: ReactNode
  items?: ShellItem[]; commands?: CommandItem[]; children: ReactNode; preview?: boolean; suspended?: boolean; extraSearch?: (query: string) => CommandItem[]
  /**
   * The palette's own query, so a screen can search something the shell cannot
   * (the vault lives behind the main process). The shell stays synchronous and
   * unaware of what that search costs; results arrive as ordinary commands.
   */
  onSearchQuery?: (query: string) => void
  /** A line under the results when the search could not see everything, e.g. a bound was reached. */
  searchNote?: string
}) {
  const pending = usePermissionsWaiting()
  const { view, onView, onNew, onBack, canBack, onSettings, name } = navigation
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement | null>(null), results = useRef<HTMLDivElement | null>(null), returnFocus = useRef<HTMLElement | null>(null)
  const list = useMemo(() => { const found = commands.filter(c => `${c.title} ${c.detail || ''}`.toLowerCase().includes(query.trim().toLowerCase())); const all = query.trim() && extraSearch ? [...found, ...extraSearch(query)] : found; return [...new Map(all.map(c => [c.id, c])).values()] }, [commands, query, extraSearch])
  // What the arrow keys move through: the first 30, the same ones on screen.
  const shown = useMemo(() => list.slice(0, 30), [list])
  const chosen = shown.length ? Math.min(active, shown.length - 1) : -1
  // A new query starts at the best match; results that arrive late (the vault
  // answers 220 ms behind the keystroke) do not move the highlight under a
  // finger that is already on the arrow key.
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { if (open) results.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [open, chosen])
  const search = (): void => { if (preview) return; returnFocus.current = document.activeElement as HTMLElement; setQuery(''); setActive(0); onSearchQuery?.(''); setOpen(true) }
  const close = (): void => { setOpen(false); setActive(0); onSearchQuery?.(''); returnFocus.current?.focus() }
  useEffect(() => {
    if (preview || suspended) return
    const key = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search() }
      if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, preview, suspended])
  useEffect(() => { if (open) input.current?.focus() }, [open])
  const headerNav = ['topbar', 'twopane', 'bento', 'floating'].includes(layout)
  const profile = <ProfileButton name={name} onOpen={onSettings} />
  const header = <TitleBar interactive={!preview && !suspended} onNew={preview ? undefined : onNew} onBack={onBack} canBack={!preview && canBack}>
    {headerNav ? <AppNav view={view} onView={onView} waiting={preview ? 0 : pending} horizontal /> : null}
    <span className="ob-grow" />
    {layout !== 'classic' && layout !== 'rail' ? <><button type="button" className="ob-icon-button" aria-label="Search chats, screens and the vault" title="Search · Ctrl K" onClick={search}><Search size={15} /></button>{profile}</> : null}
  </TitleBar>
  const itemList = <aside className="ob-item-list" aria-label="Workspace items"><div className="ob-item-list-title">{view === 'projects' ? 'Projects' : view === 'artifacts' ? 'Artifacts' : 'Recent chats'}</div><div>{items.length ? items.map(item => <button key={item.id} type="button" onClick={item.open} className="ob-item"><span>{item.title}</span>{item.detail ? <small>{item.detail}</small> : null}<ArrowRight size={13} /></button>) : <p className="ob-empty-line">Nothing here yet.</p>}</div></aside>
  const main = <div className="ob-shell-content">{children}</div>
  const rail = <aside className="ob-nav-rail"><button type="button" className="ob-rail-new" aria-label="New chat" onClick={onNew}><Plus size={16} /></button><AppNav view={view} onView={onView} waiting={preview ? 0 : pending} collapsed /><span className="ob-grow" /><ProfileButton name={name} onOpen={onSettings} compact /></aside>
  return <div className={`ob-desktop ob-layout-${layout}`} data-layout={layout} data-readonly={preview || undefined}>
    {header}
    {layout === 'classic' ? <div className="ob-shell-body">{sidebar}{main}</div> :
      layout === 'rail' ? <div className="ob-shell-body">{rail}{itemList}{main}</div> :
      layout === 'twopane' ? <div className="ob-shell-body">{itemList}{main}</div> :
      layout === 'command' ? <div className="ob-command-body"><button type="button" onClick={search} className="ob-command-search"><Search size={16} /><span>Search chats, screens and the vault</span><kbd>Ctrl K</kbd></button>{main}</div> :
      layout === 'console' ? <div className="ob-console-body">{main}<form className="ob-console-prompt" onSubmit={e => { e.preventDefault(); const match = commands.find(c => c.title.toLowerCase().includes(query.trim().toLowerCase())); if (query.trim() && match) { match.run(); setQuery('') } else search() }}><span aria-hidden="true">&gt;</span><input aria-label="Go to a chat or screen" placeholder="Go to…" value={query} onChange={e => setQuery(e.target.value)} /><button type="button" onClick={search}><ChevronDown size={14} />Browse</button><button type="submit" aria-label="Open matching screen"><ArrowRight size={14} /></button></form></div> :
      <div className="ob-shell-body">{main}</div>}
    {open ? <div className="ob-command-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) close() }}><section className="ob-command-dialog" role="dialog" aria-modal="true" aria-label="Search chats, screens and the vault" onKeyDown={e => {
      if (e.key === 'Tab') { const nodes = [...e.currentTarget.querySelectorAll<HTMLElement>('input,button')]; const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() } }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(chosen + 1, shown.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(chosen - 1, 0)) }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
      else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1) }
      else if (e.key === 'Enter') { const command = shown[chosen]; if (command) { e.preventDefault(); close(); command.run() } }
    }}><div className="ob-command-input"><Search size={16} /><input ref={input} aria-label="Search chats, screens and the vault" placeholder="Search chats, screens and the vault" role="combobox" aria-expanded="true" aria-controls="ob-command-list" aria-activedescendant={chosen >= 0 ? `ob-command-option-${chosen}` : undefined} value={query} onChange={e => { setQuery(e.target.value); onSearchQuery?.(e.target.value) }} /><button className="ob-icon-button" type="button" onClick={close} aria-label="Close search"><X size={16} /></button></div><div ref={results} className="ob-command-results" id="ob-command-list" role="listbox" aria-label="Results">{shown.map((c, index) => <button type="button" key={c.id} id={`ob-command-option-${index}`} role="option" aria-selected={index === chosen} onMouseEnter={() => setActive(index)} onClick={() => { close(); c.run() }}><span>{c.title}{c.detail ? <small>{c.detail}</small> : null}</span><ArrowRight size={14} /></button>)}{!shown.length ? <p className="ob-empty-line">No matches.</p> : null}</div>{query.trim() && searchNote ? <p className="ob-command-note" role="status">{searchNote}</p> : null}</section></div> : null}
  </div>
}
export function screenCommands(onView: (view: View) => void): CommandItem[] { return NAV_ITEMS.map(item => ({ id: 'screen-' + item.id, title: item.label, detail: 'Screen', run: () => onView(item.id) })) }
