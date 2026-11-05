import { useId, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, Plus, Search, X } from 'lucide-react'
import AppNav, { type View, NAV_ITEMS } from '../components/AppNav'
import TitleBar from '../components/TitleBar'
import ProfileButton from './ProfileButton'
import { usePermissionsWaiting } from '../state/engine'
import type { LayoutId } from '../state/look'

export type ShellItem = { id: string; title: string; detail?: string; open: () => void }
export type SavedSearch = (query: string, signal: AbortSignal) => Promise<{ items: CommandItem[]; notice: string }>
export type CommandItem = { id: string; title: string; detail?: string; run: () => void }
export type ShellNavigation = { view: View; onView: (view: View) => void; onNew: () => void; onBack?: () => void; canBack?: boolean; onSettings: () => void; name: string }
/** Exactly the same structural host in the app and the scaled Appearance
 * preview. The caller supplies real content and real callbacks in the app,
 * small read-only sample components in the preview. */
export default function DesktopShell({ layout, navigation, sidebar, items = [], commands = [], children, preview = false, suspended = false, extraSearch, searchSaved }: {
  layout: LayoutId; navigation: ShellNavigation; sidebar: ReactNode
  items?: ShellItem[]; commands?: CommandItem[]; children: ReactNode; preview?: boolean; suspended?: boolean; extraSearch?: (query: string) => CommandItem[]; searchSaved?: SavedSearch
}) {
  const pending = usePermissionsWaiting()
  const { view, onView, onNew, onBack, canBack, onSettings, name } = navigation
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const [saved, setSaved] = useState<{ query: string; items: CommandItem[]; notice: string; owner?: SavedSearch }>({ query: '', items: [], notice: '' })
  useEffect(() => {
    const controller = new AbortController()
    if (!open || !query.trim() || !searchSaved || preview) { setSaved({ query: '', items: [], notice: '' }); return }
    setSaved({ query, owner: searchSaved, items: [], notice: 'Searching saved conversations, confirmed memory and files…' })
    const timer = setTimeout(() => {
      void searchSaved(query, controller.signal).then(result => { if (!controller.signal.aborted) setSaved({ query, owner: searchSaved, ...result }) }).catch(() => { if (!controller.signal.aborted) setSaved({ query, owner: searchSaved, items: [], notice: 'Saved vault search is unavailable. Your app chats are still searched.' }) })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [open, query, searchSaved, preview])
  const savedItems = saved.query === query && saved.owner === searchSaved ? saved.items : []
  const [activeId, setActiveId] = useState<string | null>(null)
  const listId = useId(), results = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null), returnFocus = useRef<HTMLElement | null>(null)
  const list = useMemo(() => { const found = commands.filter(c => `${c.title} ${c.detail || ''}`.toLowerCase().includes(query.trim().toLowerCase())); const all = query.trim() && extraSearch ? [...found, ...extraSearch(query)] : found; return [...new Map(all.map(c => [c.id, c])).values()] }, [commands, query, extraSearch])
  const shown = [...list.slice(0, 30), ...savedItems]
  const activeIndex = shown.findIndex(item => item.id === activeId)
  const chosen = shown.length ? Math.max(0, activeIndex) : -1
  useEffect(() => { if (open) results.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [open, chosen, shown.length])
  const search = (): void => { if (preview) return; returnFocus.current = document.activeElement as HTMLElement; setQuery(''); setActiveId(null); setOpen(true) }
  const close = (): void => { setOpen(false); setActiveId(null); returnFocus.current?.focus() }
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
    <button type="button" className="ob-icon-button" aria-label="Search OddBrain" title="Search conversations, memory and files · Ctrl K" onClick={search}><Search size={15} /></button>
    {layout !== 'classic' && layout !== 'rail' ? profile : null}
  </TitleBar>
  const itemList = <aside className="ob-item-list" aria-label="Workspace items"><div className="ob-item-list-title">{view === 'projects' ? 'Projects' : view === 'artifacts' ? 'Artifacts' : 'Recent chats'}</div><div>{items.length ? items.map(item => <button key={item.id} type="button" onClick={item.open} className="ob-item"><span>{item.title}</span>{item.detail ? <small>{item.detail}</small> : null}<ArrowRight size={13} /></button>) : <p className="ob-empty-line">Nothing here yet.</p>}</div></aside>
  const main = <div className="ob-shell-content">{children}</div>
  const rail = <aside className="ob-nav-rail"><button type="button" className="ob-rail-new" aria-label="New chat" onClick={onNew}><Plus size={16} /></button><AppNav view={view} onView={onView} waiting={preview ? 0 : pending} collapsed /><span className="ob-grow" /><ProfileButton name={name} onOpen={onSettings} compact /></aside>
  return <div className={`ob-desktop ob-layout-${layout}`} data-layout={layout} data-readonly={preview || undefined}>
    {header}
    {layout === 'classic' ? <div className="ob-shell-body">{sidebar}{main}</div> :
      layout === 'rail' ? <div className="ob-shell-body">{rail}{itemList}{main}</div> :
      layout === 'twopane' ? <div className="ob-shell-body">{itemList}{main}</div> :
      layout === 'command' ? <div className="ob-command-body"><button type="button" onClick={search} className="ob-command-search"><Search size={16} /><span>Search OddBrain</span><kbd>Ctrl K</kbd></button>{main}</div> :
      layout === 'console' ? <div className="ob-console-body">{main}<form className="ob-console-prompt" onSubmit={e => { e.preventDefault(); const match = commands.find(c => c.title.toLowerCase().includes(query.trim().toLowerCase())); if (query.trim() && match) { match.run(); setQuery('') } else search() }}><span aria-hidden="true">&gt;</span><input aria-label="Go to a chat or screen" placeholder="Go to…" value={query} onChange={e => setQuery(e.target.value)} /><button type="button" onClick={search}><ChevronDown size={14} />Browse</button><button type="submit" aria-label="Open matching screen"><ArrowRight size={14} /></button></form></div> :
      <div className="ob-shell-body">{main}</div>}
    {open ? <div className="ob-command-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) close() }}><section className="ob-command-dialog" role="dialog" aria-modal="true" aria-label="Search OddBrain" onKeyDown={e => {
      if (e.key === 'Tab') { const nodes = [...e.currentTarget.querySelectorAll<HTMLElement>('input,button:not([tabindex="-1"])')]; const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && e.target === first) { e.preventDefault(); last?.focus() } else if (!e.shiftKey && e.target === last) { e.preventDefault(); first?.focus() } }
      // Enter on Close must close, not accidentally execute the selected result.
      if (e.target !== input.current || e.nativeEvent.isComposing) return
      let next = chosen
      if (e.key === 'ArrowDown') next = Math.min(chosen + 1, shown.length - 1)
      else if (e.key === 'ArrowUp') next = Math.max(chosen - 1, 0)
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = shown.length - 1
      else if (e.key === 'Enter') { e.preventDefault(); const command = shown[chosen]; if (command) { close(); command.run() } return }
      else return
      e.preventDefault(); setActiveId(shown[next]?.id || null)
    }}><div className="ob-command-input"><Search size={16} /><input ref={input} role="combobox" aria-label="Search everything" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={chosen >= 0 ? `${listId}-${chosen}` : undefined} placeholder='Search conversations, memory, files or screens; quote a phrase' maxLength={500} value={query} onChange={e => { setActiveId(null); setQuery(e.target.value) }} /><button className="ob-icon-button" type="button" onClick={close} aria-label="Close search"><X size={16} /></button></div><div ref={results} id={listId} role="listbox" aria-label="Search results" className="ob-command-results">{shown.map((c, index) => <button className={savedItems.includes(c) ? 'ob-recall-result' : undefined} type="button" key={c.id} id={`${listId}-${index}`} role="option" aria-selected={index === chosen} tabIndex={-1} onMouseEnter={() => setActiveId(c.id)} onClick={() => { close(); c.run() }}><span>{c.title}{c.detail ? <small>{c.detail}</small> : null}</span><ArrowRight size={14} /></button>)}{saved.query === query && saved.notice && <p className="ob-empty-line" role="status">{saved.notice}</p>}{!list.length && !savedItems.length && !saved.notice ? <p className="ob-empty-line">No matches.</p> : null}</div></section></div> : null}
  </div>
}
export function screenCommands(onView: (view: View) => void): CommandItem[] { return NAV_ITEMS.map(item => ({ id: 'screen-' + item.id, title: item.label, detail: 'Screen', run: () => onView(item.id) })) }
