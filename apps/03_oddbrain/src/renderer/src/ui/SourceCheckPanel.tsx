import { useEffect, useRef, useState } from 'react'
import { bridge } from '../platform/bridge'
import { trapDialogFocus } from './focus'
import type { SourceCheckRecord, SourceCheckReview } from '@shared/lib/sourceCheck'

type Request = { transcriptId: string; chatId: string; questionStart: string; urls: string[] }

const stateWords: Record<string, string> = { retrieved: 'answered', refused: 'refused', unreachable: 'no answer' }

/**
 * Source checking for one reply's links.
 *
 * Nothing is requested until the owner allows this exact list. The panel shows
 * what actually came back, keeps earlier receipts for the same record, and never
 * turns a receipt into a claim about the answer's truth.
 */
export default function SourceCheckPanel() {
  const [request, setRequest] = useState<Request | null>(null)
  const [review, setReview] = useState<SourceCheckReview | null>(null)
  const [record, setRecord] = useState<SourceCheckRecord | null>(null)
  const [earlier, setEarlier] = useState<SourceCheckRecord[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const serial = useRef(0), lock = useRef(false), token = useRef<string | null>(null), mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const open = (event: Event) => {
      const detail = (event as CustomEvent).detail as Request | undefined
      if (!detail || typeof detail.transcriptId !== 'string' || !Array.isArray(detail.urls) || !detail.urls.length) return
      serial.current++
      setRequest(detail); setReview(null); setRecord(null); setEarlier([]); setNotice(''); setBusy(false); lock.current = false; token.current = null
      void bridge.research.read(detail.transcriptId).then(reply => {
        if (!mounted.current) return
        setEarlier(reply.records); if (reply.notice) setNotice(reply.notice)
      }).catch(error => { if (mounted.current) setNotice((error as Error).message) })
    }
    window.addEventListener('app:check-sources', open)
    return () => { mounted.current = false; window.removeEventListener('app:check-sources', open) }
  }, [])

  if (!request) return null
  const close = () => {
    serial.current++; lock.current = false
    const pending = token.current; token.current = null
    if (pending) void bridge.research.decide(pending, 'deny').catch(() => {})
    setRequest(null); setReview(null); setRecord(null); setEarlier([]); setNotice('')
  }
  const prepare = async () => {
    if (lock.current) return
    lock.current = true; setBusy(true); const own = ++serial.current
    try {
      const next = await bridge.research.preview({ ...request, urls: request.urls })
      if (!mounted.current || own !== serial.current) return
      token.current = next.token; setReview(next); setNotice('')
    } catch (error) { if (mounted.current && own === serial.current) setNotice((error as Error).message) }
    finally { if (mounted.current && own === serial.current) setBusy(false); lock.current = false }
  }
  const decide = async (decision: 'allow' | 'deny') => {
    const pending = token.current
    if (!pending || lock.current) return
    lock.current = true; setBusy(true); const own = ++serial.current
    token.current = null
    try {
      const answer = await bridge.research.decide(pending, decision)
      if (!mounted.current || own !== serial.current) return
      if (answer.denied) { setReview(null); setNotice(answer.answer); return }
      setReview(null); setRecord(answer.record); setEarlier(old => [answer.record, ...old].slice(0, 5))
      setNotice(`Checked ${answer.record.entries.length} link(s). A receipt records what the server returned, not whether the page supports the answer.`)
    } catch (error) {
      // The token is spent either way, so this review can never be reused.
      if (mounted.current && own === serial.current) { setReview(null); setNotice((error as Error).message) }
    }
    finally { if (mounted.current && own === serial.current) setBusy(false); lock.current = false }
  }

  return <div className="ob-modal-backdrop">
    <section className="ob-journal ob-source-check" role="dialog" aria-modal="true" aria-label="Source checks" onKeyDown={event => { trapDialogFocus(event); event.stopPropagation(); if (event.key === 'Escape') close() }}>
      <header><h2>Source checks</h2><button type="button" className="ob-small-button" autoFocus onClick={close}>Close source checks</button></header>
      <p className="ob-control-scope">These are the links the answer actually wrote. Checking them opens each address once from this machine over https, without your cookies, saved app keys or account credentials. A receipt records the status, content type, size and SHA-256 of what came back. It is not proof the model read the page, and not proof the page supports the claim.</p>
      {request.questionStart ? <p className="ob-control-scope">For: {request.questionStart}</p> : null}
      <ol className="ob-source-list">{request.urls.map(url => <li key={url}><code>{url}</code></li>)}</ol>
      {review ? <section aria-label="Source check review">
        <p>{review.explanation}</p>
        <p className="ob-control-scope">This review expires at {new Date(review.expiresAt).toLocaleTimeString()} and can be used once. {review.refused.length ? `${review.refused.length} link(s) are refused and will be recorded, not requested.` : ''}</p>
        {review.refused.length ? <ul className="ob-control-scope">{review.refused.map(item => <li key={item.url}><code>{item.url}</code> — {item.reason}</li>)}</ul> : null}
        <div className="ob-inline-actions"><button type="button" disabled={busy} onClick={() => void decide('deny')}>Deny source check</button><button type="button" disabled={busy} onClick={() => void decide('allow')}>Allow these checks once</button></div>
      </section> : <button type="button" className="ob-small-button" disabled={busy || !bridge.research} onClick={() => void prepare()}>Prepare source check</button>}
      {record ? <section aria-label="Source check result">
        <h3>Checked {new Date(record.at).toLocaleString()}</h3>
        <ul>{record.entries.map(entry => <li key={entry.url}>
          <p><code>{entry.url}</code></p>
          <p className="ob-control-scope">{stateWords[entry.state]}{entry.status ? ` · HTTP ${entry.status}` : ''}{entry.mime ? ` · ${entry.mime}` : ''}{entry.bytes !== undefined ? ` · ${entry.bytes} bytes` : ''}</p>
          {entry.title ? <p>{entry.title}</p> : null}
          {entry.finalUrl && entry.finalUrl !== entry.url ? <p className="ob-control-scope">Ended at {entry.finalUrl}</p> : null}
          {entry.sha256 ? <p className="ob-control-scope">sha256 {entry.sha256}</p> : null}
          {entry.reason ? <p className="ob-control-scope">{entry.reason}</p> : null}
        </li>)}</ul>
        <p className="ob-control-scope">Receipts are private app data outside vault backups. They are not attached to the chat text or the transcript download.</p>
      </section> : null}
      {earlier.length ? <details><summary>Earlier source checks for this record ({earlier.length})</summary>
        {earlier.map(item => <section key={item.id}><h4>{new Date(item.at).toLocaleString()}</h4><ul>{item.entries.map(entry => <li key={entry.url}><p><code>{entry.url}</code></p><p className="ob-control-scope">{stateWords[entry.state]}{entry.status ? ` · HTTP ${entry.status}` : ''}{entry.bytes !== undefined ? ` · ${entry.bytes} bytes` : ''}{entry.reason ? ` — ${entry.reason}` : ''}</p>{entry.sha256 ? <p className="ob-control-scope">sha256 {entry.sha256}</p> : null}</li>)}</ul></section>)}
      </details> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  </div>
}
