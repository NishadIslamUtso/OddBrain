import { useEffect, useRef, useState } from 'react'
import type { CommandBridge, ShellResult, ShellReviewTicket } from '@shared/lib/commands'
import CopyText from '../ui/CopyText'
import { downloadBytes } from '@shared/lib/zip'
export type ChatShellPort = Pick<CommandBridge, 'preview' | 'decide'> & Partial<Pick<CommandBridge, 'context' | 'cancel' | 'output'>>
/** A separate human approval, never a model-prompt fallback. */
export default function ShellReview({ port, onResult }: { port?: ChatShellPort; onResult?: () => void }) {
  const [command, setCommand] = useState(''), [cwd, setCwd] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [executing, setExecuting] = useState(false)
  const [scope, setScope] = useState<Awaited<ReturnType<CommandBridge['context']>> | null>(null)
  const [review, setReview] = useState<ShellReviewTicket | null>(null), [result, setResult] = useState<ShellResult | null>(null)
  const serial = useRef(0), lock = useRef(false), ticket = useRef<string | null>(null)
  const refresh = async () => { const own = ++serial.current; try { if (port?.context) { const next = await port.context(); if (own === serial.current) { setScope(next); setCwd(next.cwd) } } } catch (error) { if (own === serial.current) setNotice((error as Error).message) } }
  useEffect(() => { serial.current++; setReview(null); setResult(null); lock.current = false; setBusy(false); void refresh(); return () => { serial.current++; const id = ticket.current; ticket.current = null; if (id && port) void port.decide(id, 'deny').catch(() => {}) } }, [port])
  async function request(decision?: 'allow' | 'deny') {
    if (!port || lock.current) return
    lock.current = true; setBusy(true); const own = ++serial.current
    try {
      if (!decision) { const next = await port.preview({ command, cwd }); if (own === serial.current) { ticket.current = next.token; setReview(next); setResult(null); setNotice('Review the exact script, program and folder. Nothing has run yet.') } }
      else if (review) {
        ticket.current = null; setExecuting(decision === 'allow')
        const output = await port.decide(review.token, decision)
        if (own === serial.current) { setReview(null); if ('denied' in output) setNotice('Denied. Nothing ran.'); else { setResult(output); setNotice(output.note || 'OS process result, not an AI opinion or proof the whole task succeeded.'); onResult?.() } }
      }
    } catch (failure) { if (own === serial.current) { setReview(null); setNotice((failure as Error).message + ' No automatic retry will be attempted. Inspect command history if a handoff might have started.'); onResult?.() } }
    finally { if (own === serial.current) { lock.current = false; setBusy(false); setExecuting(false); if (port.context) { try { const value = await port.context(); if (own === serial.current) setScope(value) } catch { /* outcome above remains visible */ } } } }
  }
  const stop = async () => { try { const reply = await port?.cancel?.(); if (reply) setNotice(reply.answer) } catch { setNotice('The stop request could not be confirmed. Inspect active processes before retrying.') } }
  const raw = async (stream: 'stdout' | 'stderr') => { try { if (result?.runId && port?.output) { const file = await port.output(result.runId, stream); downloadBytes(Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)), file.name, 'application/octet-stream', setNotice) } } catch (error) { setNotice((error as Error).message) } }
  return <section className="ob-native-controls" aria-label="Review an OS command">
    <p>App-owned OS execution, outside the engine sandbox. Commands can access files and networks as your user; the working folder is not a security boundary. OddBrain does not turn this into a model prompt. Programs you run may themselves use models or networks.</p>
    {scope && <p role="status">{scope.explanation}</p>}
    {!port ? <p>Command execution is unavailable here.</p> : <>
      <label>Exact command<textarea rows={5} disabled={busy || !!review} value={command} onChange={event => setCommand(event.target.value)} /></label>
      <label>Working folder<input readOnly={!!port.context} disabled={busy || !!review} value={cwd} onChange={event => setCwd(event.target.value)} /></label>
      <p>Uses the folder selected under Projects → Engine sessions and working folder, not an unsent chat preference.</p>
      <button type="button" disabled={busy || !!review} onClick={() => void refresh()}>Refresh working folder and access</button>
      <button type="button" disabled={busy || !!review || !command.trim() || !cwd || (!!scope && !scope.allowed)} onClick={() => void request()}>Prepare command review</button>
      {review && <><p>{review.explanation}</p>{review.execution && <p>Program: <code>{review.execution.program}</code><br />Flags: {review.execution.arguments.slice(0, -1).join(' ')} · script shown below. Basic environment only; no saved app API keys.</p>}<pre>{review.execution?.script || review.command}</pre><p>{review.cwd}<br />Review expires at {new Date(review.expiresAt).toLocaleTimeString()}.</p><button type="button" disabled={busy} onClick={() => void request('deny')}>Deny execution</button><button type="button" disabled={busy} onClick={() => void request('allow')}>Allow this command once</button></>}
      {(executing || scope?.activeId) && <button type="button" onClick={() => void stop()}>Stop app command</button>}
    </>}
    {result && <><p>Exit: {result.exitCode ?? 'unknown'} · {result.interrupted ? 'interrupted/unconfirmed' : 'shell exited'} · captured output {result.outputComplete ? 'complete' : 'incomplete'}. Exit zero alone does not verify the requested outcome.</p><h4>Standard output</h4><pre>{result.stdout || '(empty)'}</pre><h4>Standard error</h4><pre>{result.stderr || '(empty)'}</pre><CopyText text={result.stdout} label="Copy stdout" />{result.runId && port?.output && <><button type="button" onClick={() => void raw('stdout')}>Download raw stdout</button><button type="button" onClick={() => void raw('stderr')}>Download raw stderr</button></>}</>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
