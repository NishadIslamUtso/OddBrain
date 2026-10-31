import { useEffect, useRef, useState } from 'react'
import type { FileReview, FileReviewPort } from '@shared/lib/changeReview'

/** Optional coordinator-owned IPC adapter. No prompt/AI fallback and no implicit allow. */
export default function ChangeReview({ port, label }: { port?: FileReviewPort; label: string }) {
  const [review, setReview] = useState<FileReview | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const serial = useRef(0), lock = useRef(false)
  useEffect(() => { serial.current++; setReview(null); setBusy(false); lock.current = false; return () => { serial.current++ } }, [port])
  async function run(decision?: 'allow' | 'deny') {
    if (!port || lock.current) return
    lock.current = true; setBusy(true); const request = ++serial.current
    try {
      if (!decision) { const next = await port.preview(); if (request === serial.current) { setReview(next); setNotice('') } }
      else if (review) { const result = await port.decide(review.token, decision); if (request === serial.current) { setReview(null); setNotice(result.answer + (result.recoveryPath ? ` Recovery copy: ${result.recoveryPath}` : '')) } }
    } catch (error) { if (request === serial.current) { setReview(null); setNotice((error as Error).message) } }
    finally { if (request === serial.current) { lock.current = false; setBusy(false) } }
  }
  return <section className="ob-native-controls" aria-label={label}><h3>{label}</h3>{!port ? <p>Reviewed backend integration is not available. No change can be applied here.</p> : <button type="button" disabled={busy} onClick={() => void run()}>Preview exact change</button>}
    {review && <><p className="break-all">{review.path} · {review.purpose}</p>{review.hazards?.total ? <div role="alert" className="rounded-md border border-warn/50 bg-warn/5 p-2 text-warn"><strong>{review.hazards.notice}</strong>{review.hazards.findings.map(item => <details key={item.kind}><summary>{item.label}: {item.count.toLocaleString()}</summary><p>Code points: {item.codePoints.join(', ') || 'unavailable'} · UTF-16 positions: {item.positions.join(', ') || 'unavailable'}</p>{item.excerpts.map((text, index) => <pre key={index} className="whitespace-pre-wrap break-words">{text}</pre>)}</details>)}</div> : null}<pre className="whitespace-pre-wrap break-words">{review.diff}</pre><details><summary>Open current text</summary><pre className="whitespace-pre-wrap break-words">{review.before}</pre></details><details><summary>Open proposed text</summary><pre className="whitespace-pre-wrap break-words">{review.after}</pre></details><h4>Actual checks, not AI opinions</h4><ul>{review.checks.map(check => <li key={check}>{check}</li>)}</ul><p>This replaces the reviewed whole file, not a three-way merge. Edits already present before preview must be reviewed too; displaced bytes are retained for recovery. Reviewing rules does not grant filesystem or shell permissions. Changes after preview invalidate approval.</p><button type="button" disabled={busy} onClick={() => void run('deny')}>Deny change</button><button type="button" disabled={busy} onClick={() => void run('allow')}>Allow this exact change</button></>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
