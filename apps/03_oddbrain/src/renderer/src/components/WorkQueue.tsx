import { useEffect, useRef, useState } from 'react'
import { bridge } from '../platform/bridge'
import { useEngine } from '../state/engine'
import type { WorkQueueItem } from '@shared/lib/workQueue'
import CopyText from '../ui/CopyText'
export default function WorkQueue() {
  const engine = useEngine(), [history, setHistory] = useState<WorkQueueItem[]>([]), [next, setNext] = useState(''), [notice, setNotice] = useState(''), [uncertain, setUncertain] = useState('')
  const request = useRef(0)
  useEffect(() => { void engine.refreshLine(); const refresh = () => { void engine.refreshLine() }; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) }, [])
  const load = async (before = '') => { const own = ++request.current; try { const page = await bridge.engine.queue.history(before); if (own !== request.current) return; setHistory(old => before ? [...old, ...page.items] : page.items); setNext(page.next); setNotice('') } catch (error) { if (own === request.current) setNotice((error as Error).message) } }
  return <details className="ob-work-queue ob-native-controls"><summary>Saved work queue{engine.line.length ? ` (${engine.line.length})` : ''}</summary>
    <p>Text tasks only. Accepted means handed to the engine, not completed. Recovered or uncertain work never restarts automatically. Saved queue records may contain private context and connection details. Removing an entry archives it; it does not stop a possibly running process.</p>
    <button type="button" onClick={() => void engine.refreshLine()}>Refresh queue</button><button type="button" onClick={() => void load()}>Queue history</button><button type="button" disabled={!engine.line.length} onClick={() => void engine.clearLine()}>Archive all waiting entries</button>
    {engine.line.map(item => <details key={item.id}><summary>{item.status} · {item.prompt.slice(0, 100)}</summary><pre>{item.prompt}</pre><p>{item.notice}</p><p>Saved {new Date(item.at).toLocaleString()}</p>
      <CopyText text={item.prompt} label="Copy queued task" />
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('app:append-draft', { detail: item.prompt }))}>Append task text to draft</button>
      {item.conversation?.chatId && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('app:open-chat', { detail: item.conversation!.chatId }))}>Open original chat</button>}
      {['held', 'blocked'].includes(item.status) && <button type="button" onClick={() => void engine.resumeLine(item.id)}>Resume saved task</button>}
      {item.status === 'uncertain' && <><label><input type="checkbox" checked={uncertain === item.id} onChange={event => setUncertain(event.target.checked ? item.id : '')} />I checked previous work and understand retrying may duplicate it</label><button type="button" disabled={uncertain !== item.id} onClick={() => { void engine.resumeLine(item.id, true); setUncertain('') }}>Create a new retry</button></>}
      <button type="button" disabled={item.status === 'starting'} onClick={() => void engine.removeFromLine(item.id)}>Archive queue entry</button>
      {item.transcriptId && <p><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('app:show-transcript', { detail: item.transcriptId }))}>Inspect recorded result</button></p>}
    </details>)}
    {history.map(item => <details key={item.id}><summary>{item.status} · {item.prompt.slice(0, 100)}</summary><pre>{item.prompt}</pre><p>{item.notice}</p>{item.transcriptId && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('app:show-transcript', { detail: item.transcriptId }))}>Inspect recorded result</button>}<CopyText text={JSON.stringify(item, null, 2)} label="Copy queue record" /></details>)}
    {next && <button type="button" onClick={() => void load(next)}>Load older queue records</button>}
    {engine.queueError || notice ? <p role="status">{engine.queueError || notice}</p> : null}
  </details>
}
