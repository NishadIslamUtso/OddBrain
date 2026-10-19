import WorkflowPanel from './WorkflowPanel'
import SavedCommands from './SavedCommands'
import { useEffect, useRef, useState } from 'react'
import { bridge } from '../platform/bridge'
import ShellReview from '../components/ShellReview'
import { trapDialogFocus } from './focus'
import type { CommandRecord, ShellResult } from '@shared/lib/commands'
import CopyText from './CopyText'
import { downloadBytes } from '@shared/lib/zip'
export default function CommandPanel({ close, initialView = 'command' }: { close(): void; initialView?: 'command' | 'workflows' }) {
  const [view, setView] = useState(initialView), [workflowVisited, setWorkflowVisited] = useState(initialView === 'workflows')
  const [records, setRecords] = useState<CommandRecord[]>([]), [next, setNext] = useState(''), [notice, setNotice] = useState(''), [selected, setSelected] = useState<{ record: CommandRecord; result: ShellResult } | null>(null)
  const epoch = useRef(0), selection = useRef(0)
  const load = async (before = '') => { const own = ++epoch.current; try { const page = await bridge.commands.history(before); if (own === epoch.current) { setRecords(old => before ? [...old, ...page.records.filter(r => !old.some(entry => entry.id === r.id))] : page.records); setNext(page.next); setNotice(page.notice) } } catch (error) { if (own === epoch.current) setNotice((error as Error).message) } }
  useEffect(() => { void load(); return () => { epoch.current++; selection.current++ } }, [])
  const inspect = async (id: string) => { const own = ++selection.current; try { const value = await bridge.commands.read(id); if (own === selection.current) setSelected(value) } catch (error) { if (own === selection.current) setNotice((error as Error).message) } }
  useEffect(() => { const open = (event: Event) => { const id = (event as CustomEvent).detail; if (typeof id === 'string') { setView('command'); void inspect(id) } }; window.addEventListener('app:inspect-command-run', open); return () => window.removeEventListener('app:inspect-command-run', open) }, [])
  const raw = async (stream: 'stdout' | 'stderr') => { if (!selected) return; try { const value = await bridge.commands.output(selected.record.id, stream); downloadBytes(Uint8Array.from(atob(value.base64), c => c.charCodeAt(0)), value.name, 'application/octet-stream', setNotice) } catch (error) { setNotice((error as Error).message) } }
  return <div className="ob-modal-backdrop"><section className="ob-journal ob-command-panel" role="dialog" aria-modal="true" aria-label="Command runner" onKeyDown={event => { trapDialogFocus(event); event.stopPropagation(); if (event.key === 'Escape') close() }}>
    <header><h2>Command runner</h2><button type="button" className="ob-small-button" autoFocus onClick={close}>Close command runner</button></header>
    <p className="ob-control-scope">No AI decides whether a command may run. Closing this panel does not stop an already approved command. Closing its app window requests a stop. Command and output records are private app data, outside vault backups.</p>
    <div className="ob-choices"><button type="button" className="ob-choice" aria-pressed={view === 'command'} onClick={() => setView('command')}>Commands</button><button type="button" className="ob-choice" aria-pressed={view === 'workflows'} onClick={() => { setWorkflowVisited(true); setView('workflows') }}>Workflows &amp; schedules</button></div>
    {workflowVisited && <div hidden={view !== 'workflows'}><WorkflowPanel /></div>}
    <div hidden={view !== 'command'}>
    <ShellReview port={bridge.commands} onResult={() => void load()} />
    <SavedCommands onResult={() => void load()} />
    <details className="ob-native-controls" open={!!selected || undefined}><summary>Saved command runs</summary><button type="button" onClick={() => void load()}>Refresh command history</button><p>Twenty records per page. Interrupted runs are never restarted automatically.</p>
      {records.map(record => <details key={record.id}><summary>{record.state} · {record.request.command.slice(0, 100)}</summary><p>{record.at} · {record.request.cwd}</p><pre>{record.request.command}</pre><p>{record.note}</p><button type="button" onClick={() => void inspect(record.id)}>Inspect recorded output</button></details>)}
      {next && <button type="button" onClick={() => void load(next)}>Load older command runs</button>}
      {selected && <section><h3>Recorded output · {selected.record.state}</h3><p>Exit {selected.result.exitCode ?? 'unknown'} · output {selected.result.outputComplete ? 'complete' : 'incomplete'}</p><p>{selected.result.note}</p><h4>Stdout</h4><pre>{selected.result.stdout}</pre><h4>Stderr</h4><pre>{selected.result.stderr}</pre><CopyText text={JSON.stringify(selected, null, 2)} label="Copy command record" /><button type="button" onClick={() => void raw('stdout')}>Export recorded stdout bytes</button><button type="button" onClick={() => void raw('stderr')}>Export recorded stderr bytes</button></section>}
    </details>
    </div>
    {notice && <p role="status">{notice}</p>}
  </section></div>
}
