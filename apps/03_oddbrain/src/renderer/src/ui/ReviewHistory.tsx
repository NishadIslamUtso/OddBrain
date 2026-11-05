import { useEffect, useRef, useState } from 'react'
import { getAutomationApi } from '../platform/bridge'
import { useAutomation } from '../state/automation'
import type { ReviewRecord, SavedReview } from '@shared/lib/automation'
import CopyText from './CopyText'
export default function ReviewHistory() {
  const current = useAutomation(), [rows, setRows] = useState<ReviewRecord[]>([]), [next, setNext] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState<SavedReview | null>(null)
  const generation = useRef(0), selection = useRef(0), locked = useRef(false)
  const load = async (before = '') => {
    if (locked.current) return; locked.current = true; setBusy(true); const own = ++generation.current
    try { const page = await getAutomationApi().history(before); if (own !== generation.current) return; setRows(previous => before ? [...previous, ...page.records.filter(row => !previous.some(old => old.id === row.id))] : page.records); setNext(page.next); setNotice(page.notice) }
    catch (error) { if (own === generation.current) setNotice((error as Error).message || 'Review history could not be read; originals are unchanged.') }
    finally { if (own === generation.current) { locked.current = false; setBusy(false) } }
  }
  useEffect(() => { void load(); return () => { generation.current++; selection.current++; locked.current = false } }, [])
  const inspect = async (id: string) => { const own = ++selection.current; try { const value = await getAutomationApi().saved(id); if (own === selection.current) setSelected(value) } catch (error) { if (own === selection.current) setNotice((error as Error).message) } }
  return <div className="ob-native-controls"><p>Twenty records per page, newest requests first. Older records remain on disk. Opening history never restarts a model call. These are AI opinions, not executed checks. Canceled/interrupted requests may still have incurred provider activity or cost.</p>
    <button type="button" disabled={busy} onClick={() => void load()}>Refresh saved reviews</button>
    {rows.map(record => <details key={record.id}><summary>{record.prompt.slice(0, 120)} · {record.model || 'not sent'} · {record.state}</summary><h4>Complete request</h4><pre>{record.prompt}</pre><h4>Complete recorded report</h4><pre>{record.text || record.error}</pre>{record.text && record.error && <p role="status">{record.error}</p>}<p>{record.clipped ? 'The reviewer received an explicitly bounded evidence excerpt, not the entire source.' : 'No evidence clipping was reported by the reviewer transport.'}</p><CopyText text={record.text || record.error} label="Copy review" /><button type="button" onClick={() => void inspect(record.id)}>Inspect saved input and history</button></details>)}
    {next && <button type="button" disabled={busy} onClick={() => void load(next)}>Load older reviews</button>}
    {selected && <details open><summary>Saved evidence and status history</summary><p>This private record can include task text and connection details. It is not sent anywhere by opening this view.</p><pre>{JSON.stringify(selected, null, 2)}</pre>{selected.task.transcriptId && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('app:show-transcript', { detail: selected.task.transcriptId }))}>Open original native transcript</button>}<CopyText text={JSON.stringify(selected, null, 2)} label="Copy complete saved review record" /></details>}
    {!rows.length && !busy && <p>No readable saved review reports are loaded.</p>}
    {notice || current.storageNotice ? <p role="status">{notice || current.storageNotice}</p> : null}
  </div>
}
