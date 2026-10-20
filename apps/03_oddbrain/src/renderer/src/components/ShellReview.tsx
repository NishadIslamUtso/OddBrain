import { useEffect, useRef, useState } from 'react'
import type { CommandBridge, ShellResult, ShellReviewTicket, SavedCommand } from '@shared/lib/commands'
import { WORKTREE_DISCLOSURE, type Worktree } from '@shared/lib/worktrees'
import CopyText from '../ui/CopyText'
import { downloadBytes } from '@shared/lib/zip'
export type ChatShellPort = Pick<CommandBridge, 'preview' | 'decide'> & Partial<Pick<CommandBridge, 'context' | 'cancel' | 'output' | 'save' | 'previewSaved' | 'worktrees'>>
/** A separate human approval, never a model-prompt fallback. */
export default function ShellReview({ port, onResult, saved }: { port?: ChatShellPort; onResult?: () => void; saved?: SavedCommand }) {
  const [command, setCommand] = useState(saved?.command || ''), [name, setName] = useState(''), [cwd, setCwd] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [executing, setExecuting] = useState(false)
  const [scope, setScope] = useState<Awaited<ReturnType<CommandBridge['context']>> | null>(null)
  const [review, setReview] = useState<ShellReviewTicket | null>(null), [result, setResult] = useState<ShellResult | null>(null)
  const serial = useRef(0), lock = useRef(false), ticket = useRef<string | null>(null)
  const [checkouts, setCheckouts] = useState<Worktree[]>([]), [checkoutProblem, setCheckoutProblem] = useState(''), [picked, setPicked] = useState(''), [discard, setDiscard] = useState(false), [checkoutBusy, setCheckoutBusy] = useState(false)
  const target = saved?.cwd || picked || cwd
  const refresh = async () => { const own = ++serial.current; try { if (port?.context) { const next = await port.context(); if (own === serial.current) { setScope(saved && saved.cwd !== next.cwd ? { ...next, allowed: false, explanation: 'Select this saved command’s working folder before preparing its review. No folder was changed automatically.' } : next); setCwd(saved?.cwd || next.cwd) } } } catch (error) { if (own === serial.current) setNotice((error as Error).message) } }
  const loadCheckouts = async () => {
    if (!port?.worktrees) return
    try {
      const reply = await port.worktrees.list()
      setCheckouts(reply.worktrees.filter(entry => !entry.removedAt)); setCheckoutProblem(reply.problem)
    } catch (error) { setCheckoutProblem((error as Error).message) }
  }
  const createCheckout = async () => {
    if (!port?.worktrees || checkoutBusy) return
    setCheckoutBusy(true)
    try {
      const reply = await port.worktrees.create()
      setNotice(reply.answer)
      if (reply.ok && reply.worktree) setPicked(reply.worktree.path)
      await loadCheckouts()
    } catch (error) { setNotice((error as Error).message) }
    finally { setCheckoutBusy(false) }
  }
  const removeCheckout = async (id: string) => {
    if (!port?.worktrees || checkoutBusy) return
    setCheckoutBusy(true)
    try {
      const reply = await port.worktrees.remove(id, discard)
      setNotice(reply.answer)
      if (reply.ok) { const gone = checkouts.find(entry => entry.id === id); if (gone && gone.path === picked) setPicked(''); await loadCheckouts() }
    } catch (error) { setNotice((error as Error).message) }
    finally { setCheckoutBusy(false) }
  }
  useEffect(() => { serial.current++; setReview(null); setResult(null); lock.current = false; setBusy(false); void refresh(); void loadCheckouts(); return () => { serial.current++; const id = ticket.current; ticket.current = null; if (id && port) void port.decide(id, 'deny').catch(() => {}) } }, [port])
  async function request(decision?: 'allow' | 'deny') {
    if (!port || lock.current) return
    lock.current = true; setBusy(true); const own = ++serial.current
    try {
      if (!decision) { const next = saved && port.previewSaved ? await port.previewSaved(saved.id) : await port.preview({ command, cwd: target }); if (own === serial.current) { ticket.current = next.token; setReview(next); setResult(null); setNotice('Review the exact script, program and folder. Nothing has run yet.') } }
      else if (review) {
        ticket.current = null; setExecuting(decision === 'allow')
        const output = await port.decide(review.token, decision)
        if (own === serial.current) { setReview(null); if ('denied' in output) setNotice('Denied. Nothing ran.'); else { setResult(output); setNotice(output.note || 'OS process result, not an AI opinion or proof the whole task succeeded.'); onResult?.() } }
      }
    } catch (failure) { if (own === serial.current) { setReview(null); setNotice((failure as Error).message + ' No automatic retry will be attempted. Inspect command history if a handoff might have started.'); onResult?.() } }
    finally { if (own === serial.current) { lock.current = false; setBusy(false); setExecuting(false); if (port.context) { try { const value = await port.context(); if (own === serial.current) setScope(saved && saved.cwd !== value.cwd ? { ...value, allowed: false, explanation: 'Select the saved command’s working folder first.' } : value) } catch { /* outcome above remains visible */ } } } }
  }
  const save = async () => {
    if (!port?.save || lock.current) return
    lock.current = true; setBusy(true); const own = ++serial.current
    try {
      await port.save({ name, command, cwd: target })
      window.dispatchEvent(new Event('app:commands-library-changed'))
      if (own === serial.current) setNotice('Saved as a new command. Nothing ran and no approval was saved.')
    } catch (error) { if (own === serial.current) setNotice((error as Error).message) }
    finally { if (own === serial.current) { lock.current = false; setBusy(false) } }
  }
  const stop = async () => { try { const reply = await port?.cancel?.(); if (reply) setNotice(reply.answer) } catch { setNotice('The stop request could not be confirmed. Inspect active processes before retrying.') } }
  const raw = async (stream: 'stdout' | 'stderr') => { try { if (result?.runId && port?.output) { const file = await port.output(result.runId, stream); downloadBytes(Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)), file.name, 'application/octet-stream', setNotice) } } catch (error) { setNotice((error as Error).message) } }
  return <section className="ob-native-controls" aria-label="Review an OS command">
    <p>App-owned OS execution, outside the engine sandbox. Commands can access files and networks as your user; the working folder is not a security boundary. OddBrain does not turn this into a model prompt. Programs you run may themselves use models or networks.</p>
    {scope && <p role="status">{scope.explanation}</p>}
    {!port ? <p>Command execution is unavailable here.</p> : <>
      <label>Exact command<textarea rows={5} readOnly={!!saved} disabled={busy || !!review} value={command} onChange={event => setCommand(event.target.value)} /></label>
      <label>Working folder<input readOnly={!!port.context} disabled={busy || !!review} value={target} onChange={event => setCwd(event.target.value)} /></label>
      <p>Uses the folder selected under Projects → Engine sessions and working folder, not an unsent chat preference.</p>
      {!saved && port.worktrees && <details>
        <summary>Run in an isolated checkout</summary>
        <p>{WORKTREE_DISCLOSURE}</p>
        <button type="button" disabled={checkoutBusy || busy || !!review} onClick={() => void createCheckout()}>Create isolated checkout</button>
        {checkouts.length > 0 && <ul>{checkouts.map(entry => <li key={entry.id}>
          <code>{entry.path}</code> — {entry.changes < 0 ? 'changes could not be read' : entry.changes === 0 ? 'clean' : `${entry.changes} changed or untracked ${entry.changes === 1 ? 'file' : 'files'}`}, created {new Date(entry.createdAt).toLocaleString()}.{' '}
          <button type="button" disabled={checkoutBusy || busy || !!review} onClick={() => setPicked(entry.path)}>Run here</button>
          <button type="button" disabled={checkoutBusy || busy || !!review} onClick={() => void removeCheckout(entry.id)}>Remove checkout</button>
        </li>)}</ul>}
        <label><input type="checkbox" checked={discard} onChange={event => setDiscard(event.target.checked)} disabled={checkoutBusy || busy} /> Discard uncommitted changes when removing a checkout</label>
        {picked && <><p role="status">Commands will run in the checkout at {picked}. Nothing is committed, pushed or merged back.</p><button type="button" disabled={checkoutBusy || busy || !!review} onClick={() => setPicked('')}>Use the selected folder instead</button></>}
        {checkoutProblem && <p role="status">{checkoutProblem}</p>}
      </details>}
      {!saved && port.save && <details><summary>Save this command for later</summary><label>Saved command name<input value={name} onChange={event => setName(event.target.value)} disabled={busy || !!review} /></label><button type="button" disabled={busy || !!review || !name.trim() || !command.trim() || !target} onClick={() => void save()}>Save new command</button><p>Saved commands still need a fresh review for every execution. Revising creates a new entry; older text is not overwritten.</p></details>}
      <button type="button" disabled={busy || !!review} onClick={() => void refresh()}>Refresh working folder and access</button>
      <button type="button" disabled={busy || !!review || !command.trim() || !target || (!!scope && !scope.allowed && !picked)} onClick={() => void request()}>Prepare command review</button>
      {review && <><p>{review.explanation}</p>{review.execution && <p>Program: <code>{review.execution.program}</code><br />Flags: {review.execution.arguments.slice(0, -1).join(' ')} · script shown below. Basic environment only; no saved app API keys.</p>}<pre>{review.execution?.script || review.command}</pre><p>{review.cwd}<br />Review expires at {new Date(review.expiresAt).toLocaleTimeString()}.</p><button type="button" disabled={busy} onClick={() => void request('deny')}>Deny execution</button><button type="button" disabled={busy} onClick={() => void request('allow')}>Allow this command once</button></>}
      {(executing || scope?.activeId) && <button type="button" onClick={() => void stop()}>Stop app command</button>}
    </>}
    {result && <><p>Exit: {result.exitCode ?? 'unknown'} · {result.interrupted ? 'interrupted/unconfirmed' : 'shell exited'} · captured output {result.outputComplete ? 'complete' : 'incomplete'}. Exit zero alone does not verify the requested outcome.</p><h4>Standard output</h4><pre>{result.stdout || '(empty)'}</pre><h4>Standard error</h4><pre>{result.stderr || '(empty)'}</pre><CopyText text={result.stdout} label="Copy stdout" />{result.runId && port?.output && <><button type="button" onClick={() => void raw('stdout')}>Download raw stdout</button><button type="button" onClick={() => void raw('stderr')}>Download raw stderr</button></>}</>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
