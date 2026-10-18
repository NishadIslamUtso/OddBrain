import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import type { ReviewerModel } from '@shared/lib/automation'
import { getAutomationApi, bridge } from '../platform/bridge'
import { useAutomation, updateAutomation } from '../state/automation'
import { trapDialogFocus } from './focus'

type Kept = { copy: string; original: string; at: string; existed?: boolean }
function Switch({ label, value, disabled, change }: { label: string; value: boolean; disabled: boolean; change: (v: boolean) => void }) {
  return <div className="ob-choices" role="group" aria-label={label}>{[{ label: 'On', value: true }, { label: 'Off', value: false }].map(o => <button key={o.label} type="button" className="ob-choice" aria-pressed={value === o.value} disabled={disabled} onClick={() => change(o.value)}>{o.label}</button>)}</div>
}
export default function AutomationControls({ scope }: { scope: 'keep' | 'review' | 'access' }) {
  const state = useAutomation(), p = state.preferences
  const [busy, setBusy] = useState(false), [models, setModels] = useState<ReviewerModel[]>([]), [note, setNote] = useState('')
  const [copies, setCopies] = useState<Kept[] | null>(null), [restore, setRestore] = useState<string | null>(null), [preview, setPreview] = useState<{ text: string; clipped: boolean } | null>(null)
  const change = (patch: Parameters<typeof updateAutomation>[0]): void => { setBusy(true); void updateAutomation(patch).finally(() => setBusy(false)) }
  const refresh = async (): Promise<void> => { setBusy(true); try { const result = await getAutomationApi().models(); setModels(result.models); setNote(result.error || (!result.models.length ? 'No reviewer models found. Start the local runtime or check saved provider access.' : '')) } catch (error) { setNote(String((error as Error).message)) } finally { setBusy(false) } }
  const kept = async (): Promise<void> => {
    try {
      const result = await bridge.engine.checkpoints.list()
      if (result.ok) { setCopies(result.checkpoints); setNote('') }
      else { setCopies(null); setNote(result.error || 'Kept copies could not be listed.') }
    } catch (error) { setCopies(null); setNote(String((error as Error).message)) }
  }
  if (!state.desktop) return <p className="ob-control-scope">These controls need the installed app. No preference, model call or file was changed in this browser preview.</p>
  return <div className="ob-automation-controls">
    {scope === 'keep' ? <>
      <Switch label="Auto-keep before a write" value={p.autoKeep} disabled={busy} change={autoKeep => change({ autoKeep })} />
      <p className="ob-control-scope">Keeps the previous file state before an app-approved Write/Edit. Turning this off stops new copies, not existing restore history. Actions that bypass app approval cards, including agy/full-speed actions, cannot be intercepted here.</p>
      <button type="button" className="ob-small-button" onClick={() => void kept()}>View kept copies</button>
    </> : scope === 'access' ? <><Switch label="Allow cloud inference" value={p.allowCloudInference} disabled={busy} change={allowCloudInference => change({ allowCloudInference })} /><p className="ob-control-scope">Off blocks external model calls before task text is sent, including remote models behind local Ollama transport. Provider-specific restrictions still apply. Changing inference access stops work using the prior access.</p></> : <>
      <Switch label="Automatic second-pass review" value={p.autoReview} disabled={busy} change={autoReview => change({ autoReview })} />
      <p className="ob-control-scope">Adds a text-only model call after successful work, when the worker is idle. It has no app tools, file access, approvals, hooks or command execution. Off by default to avoid unexpected model calls.</p>
      <label className="ob-reviewer-label">Reviewer model<div className="ob-form-line"><select aria-label="Reviewer model" value={p.reviewModel} onChange={e => change({ reviewModel: e.target.value })}><option value="">Use the engine's model, if it has a text-only API</option>{p.reviewModel && !models.some(m => m.name === p.reviewModel) ? <option value={p.reviewModel}>{p.reviewModel}</option> : null}{models.map(m => <option key={m.name} value={m.name}>{m.label}{m.external ? ' · external' : ' · local'}</option>)}</select><button type="button" className="ob-small-button" disabled={busy} aria-label="Refresh reviewer models" onClick={() => void refresh()}><RefreshCw size={13} />Refresh</button></div></label>
      <div className="ob-control-line"><span>Allow cloud/network review</span><Switch label="Allow external review" value={p.allowExternalReview} disabled={busy} change={allowExternalReview => change({ allowExternalReview })} /></div>
      <p className="ob-control-scope">External review can send the task text outside this machine. Saved keys and Agent access permissions still apply. No model is silently substituted; agy needs an explicitly selected local or saved-key reviewer because its agent has no verified tool-free channel.</p>
      {state.current ? <div className="ob-review-running"><span>Reviewing “{state.current.prompt}” with {state.current.model}</span><button type="button" className="ob-small-button" onClick={() => void getAutomationApi().cancel()}>Cancel review</button></div> : null}
      {state.queued ? <p className="ob-inline-note">{state.queued} review{state.queued === 1 ? '' : 's'} waiting for the worker to be idle.</p> : null}
      {state.reports.slice(0, 5).map(r => <details className="ob-review-report" key={r.id}><summary>{r.automatic ? 'Automatic' : 'Manual'} review · {r.model || 'not sent'} · {r.state}<span>{r.prompt}</span></summary>{r.error ? <p role="status">{r.error}</p> : <pre>{r.text}</pre>}<p className="ob-control-scope">Text evidence only. The reviewer did not read files or run tests.{r.clipped ? ' The report covers only the first 2,000 request characters and 10,000 result characters.' : ''}</p></details>)}
    </>}
    {state.error || note ? <p role="status" className="ob-inline-note">{state.error || note}</p> : null}
    {copies ? <div className="ob-modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setCopies(null) }}><section className="ob-journal" role="dialog" aria-modal="true" aria-label="Kept copies" onKeyDown={e => { trapDialogFocus(e); if (e.key === 'Escape') { e.stopPropagation(); setCopies(null) } }}><header><h2>Kept copies</h2><button type="button" className="ob-icon-button" aria-label="Close kept copies" autoFocus onClick={() => setCopies(null)}><X size={15} /></button></header>{copies.length ? copies.map(k => <div className="ob-kept-row" key={k.copy || k.original}><div><strong>{k.original}</strong><small>{new Date(k.at).toLocaleString()}</small></div>{k.copy ? <button type="button" className="ob-text-button" onClick={() => { void bridge.engine.checkpoints.inspect(k.copy).then(result => result.ok ? setPreview({ text: result.content || '', clipped: !!result.clipped }) : setNote(result.answer || 'The snapshot could not be shown.')) }}>Inspect</button> : null}{restore === (k.copy || k.original) ? <><button type="button" className="ob-small-button" onClick={() => { setRestore(null); void bridge.engine.checkpoints.restore(k.copy, k.original).then(result => { setNote(result.answer); if (result.ok) void kept() }).catch(error => setNote(String(error.message))) }}>{k.existed === false ? 'Confirm undo creation' : 'Confirm restore'}</button><button type="button" className="ob-text-button" onClick={() => setRestore(null)}>Cancel</button></> : <button type="button" className="ob-small-button" onClick={() => setRestore(k.copy || k.original)}>{k.existed === false ? 'Undo creation' : 'Restore'}</button>}</div>) : <p>No copies kept yet.</p>}{preview ? <div className="ob-review-report"><pre>{preview.text}</pre>{preview.clipped ? <p>Snapshot shown as a bounded excerpt; the saved file is unchanged.</p> : null}<button type="button" className="ob-text-button" onClick={() => setPreview(null)}>Close snapshot</button></div> : null}{note ? <p role="status">{note}</p> : null}</section></div> : null}
  </div>
}
