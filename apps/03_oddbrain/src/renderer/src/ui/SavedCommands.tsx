import { useEffect, useRef, useState } from 'react'
import { bridge } from '../platform/bridge'
import type { SavedCommand } from '@shared/lib/commands'
import ShellReview from '../components/ShellReview'
import CopyText from './CopyText'
export default function SavedCommands({ onResult }: { onResult(): void }) {
  const [items, setItems] = useState<SavedCommand[]>([]), [next, setNext] = useState(''), [notice, setNotice] = useState(''), [selected, setSelected] = useState<SavedCommand | null>(null)
  const serial = useRef(0)
  const load = async (before = '') => { const own = ++serial.current; try { const page = await bridge.commands.saved(before); if (own !== serial.current) return; setItems(old => before ? [...old, ...page.items.filter(item => !old.some(value => value.id === item.id))] : page.items); setNext(page.next); setNotice(page.notice) } catch (error) { if (own === serial.current) setNotice((error as Error).message) } }
  useEffect(() => { void load(); const changed = () => { void load() }; window.addEventListener('app:commands-library-changed', changed); return () => { serial.current++; window.removeEventListener('app:commands-library-changed', changed) } }, [])
  const archive = async (item: SavedCommand) => { try { await bridge.commands.archiveSaved(item.id, !item.archived); if (selected?.id === item.id) setSelected(null); await load() } catch (error) { setNotice((error as Error).message) } }
  return <details className="ob-native-controls"><summary>Saved commands</summary><p>Literal commands and their original working folders, not permanent approvals or verified test outcomes. Each run needs a fresh exact review. Commands saved for another OS cannot run here unchanged.</p><button type="button" onClick={() => void load()}>Refresh saved commands</button>
    {items.map(item => <details key={item.id}><summary>{item.name}{item.archived ? ' · archived' : ''}</summary><p>{item.cwd} · {item.platform}<br />Saved {new Date(item.at).toLocaleString()}</p><pre>{item.command}</pre><CopyText text={item.command} label="Copy saved command" /><button type="button" disabled={item.archived} onClick={() => setSelected(item)}>Review this saved command</button><button type="button" onClick={() => void archive(item)}>{item.archived ? 'Restore saved command' : 'Archive saved command'}</button></details>)}
    {next && <button type="button" onClick={() => void load(next)}>Load older saved commands</button>}
    {selected && <section><h3>{selected.name} · exact review</h3><ShellReview key={selected.id} port={bridge.commands} saved={selected} onResult={onResult} /></section>}
    {notice && <p role="status">{notice}</p>}
  </details>
}
