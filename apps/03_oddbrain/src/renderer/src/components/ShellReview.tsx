import { useEffect, useRef, useState } from 'react'
import type { createChatShellReview, ShellResult } from '../../../main/chatShellReview'
export type ChatShellPort = ReturnType<typeof createChatShellReview>

/** No bridge fallback: a shell request must never become an ordinary model prompt. */
export default function ShellReview({ port }: { port?: ChatShellPort }) {
  const [command, setCommand] = useState(''), [cwd, setCwd] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [review, setReview] = useState<Awaited<ReturnType<ChatShellPort['preview']>> | null>(null), [result, setResult] = useState<ShellResult | null>(null)
  const serial = useRef(0), lock = useRef(false)
  useEffect(() => { serial.current++; setReview(null); setResult(null); lock.current = false; setBusy(false); return () => { serial.current++ } }, [port])
  async function request(decision?: 'allow' | 'deny') {
    if (!port || lock.current) return
    lock.current = true; setBusy(true); const own = ++serial.current
    try {
      if (!decision) { const next = await port.preview({ command, cwd }); if (own === serial.current) { setReview(next); setResult(null); setNotice('Review the exact command and folder before allowing it.') } }
      else if (review) { const output = await port.decide(review.token, decision); if (own === serial.current) { setReview(null); if ('denied' in output) setNotice('Denied. No command executed.'); else { setResult(output); setNotice('Native execution result; no AI opinion was used to verify it.') } } }
    } catch (failure) { if (own === serial.current) { setReview(null); setNotice((failure as Error).message + ' No automatic retry will be attempted.') } }
    finally { if (own === serial.current) { lock.current = false; setBusy(false) } }
  }
  return <details><summary>Review a shell command</summary>
    <p>Commands can change files. Mentioned folders do not grant access. No command is sent to the model.</p>
    {!port ? <p>Unavailable until a verified, permission-enforcing native transport is connected.</p> : <>
      <label>Exact command<textarea disabled={busy || !!review} value={command} onChange={event => setCommand(event.target.value)} /></label>
      <label>Working folder<input disabled={busy || !!review} value={cwd} onChange={event => setCwd(event.target.value)} /></label>
      <button type="button" disabled={busy || !!review || !command.trim() || !cwd} onClick={() => void request()}>Prepare command review</button>
      {review && <><pre className="whitespace-pre-wrap break-words">{review.command}</pre><p>{review.cwd} · {review.explanation}</p><button type="button" disabled={busy} onClick={() => void request('deny')}>Deny execution</button><button type="button" disabled={busy} onClick={() => void request('allow')}>Allow this command once</button></>}
    </>}
    {result && <><p>Exit: {result.exitCode ?? 'unknown'} · {result.interrupted ? 'interrupted' : 'not reported interrupted'} · output {result.outputComplete ? 'complete per transport' : 'incomplete; consult retained native output'}</p><h4>Standard output</h4><pre className="whitespace-pre-wrap break-words">{result.stdout}</pre><h4>Standard error</h4><pre className="whitespace-pre-wrap break-words">{result.stderr}</pre></>}
    {notice && <p role="status">{notice}</p>}
  </details>
}
