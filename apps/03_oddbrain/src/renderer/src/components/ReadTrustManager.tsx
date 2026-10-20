import { useEffect, useState } from 'react'
import { getEngineApi } from '@/platform/bridge'
import { loadReadTrust } from '@/state/readTrust'
import type { ReadTrustRule } from '@shared/lib/readTrust'

/** One visible home for remembered Read authority, reused in chat and Settings. */
export default function ReadTrustManager({ always = false }: { always?: boolean }) {
  const [rules, setRules] = useState<ReadTrustRule[]>([]), [notice, setNotice] = useState('')
  useEffect(() => {
    let live = true
    const api = getEngineApi().readTrust
    const refresh = (): void => { if (!api) return; void loadReadTrust(api).then(result => { if (live) { setRules(result.view.rules); setNotice(result.notice || result.view.notice || '') } }).catch(error => { if (live) setNotice((error as Error).message) }) }
    refresh(); window.addEventListener('oddbrain:read-trust', refresh); const stop = api?.onChanged?.(refresh)
    return () => { live = false; stop?.(); window.removeEventListener('oddbrain:read-trust', refresh) }
  }, [])
  const revoke = (id: string): void => {
    const api = getEngineApi().readTrust
    if (!api) return
    void api.revoke(id).then(answer => { if (answer.view) setRules(answer.view.rules); setNotice(answer.answer) }).catch(() => setNotice('The read approval could not be revoked. It remains visible until its state can be confirmed.'))
  }
  if (!always && !rules.length && !notice) return null
  const active = rules.filter(rule => rule.active !== false).length, recovery = rules.length - active
  return <details className="mt-2 text-[11.5px] text-muted" open={always ? true : undefined}>
    <summary>Read-only approvals ({active} active{recovery ? ` · ${recovery} recovery` : ''})</summary>
    <p>These rules can approve only the native <strong>Read</strong> tool for the exact engine and working folder shown. They never approve commands, search patterns, writes, deletion, publishing, providers, linked paths outside the workspace, or executable configuration.</p>
    {rules.length ? <ul className="mt-1 flex flex-col gap-1">{rules.map(rule => <li key={rule.id} className="flex items-center gap-2"><span className="min-w-0 flex-1"><code className="block truncate" title={rule.scope}>{rule.active === false ? 'Inactive recovery' : rule.mode === 'turn' ? 'This turn' : rule.mode === 'project' ? 'This project' : rule.mode === 'folder' ? 'All chats in folder' : 'Exact file'} · {rule.scope}</code><span className="block truncate" title={rule.workspace}>{rule.engine === 'claude-code' ? 'Claude Code' : 'agy'} · Working folder: {rule.workspace}</span></span>{rule.active === false ? null : <button type="button" className="ob-small-button" onClick={() => revoke(rule.id)}>Revoke</button>}</li>)}</ul> : <p>No active read approvals.</p>}
    {notice ? <p role="status" className="mt-1">{notice}</p> : null}
  </details>
}
