import { useState } from 'react'
import { bridge } from '../platform/bridge'
import type { NativeMcpInventory as Inventory } from '@shared/lib/mcpReview'
export default function NativeMcpInventory({ engine }: { engine: 'claude-code' | 'agy' }) {
  const [value, setValue] = useState<Inventory | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const read = async () => { if (busy) return; setBusy(true); try { setValue(await bridge.mcp.inventory(engine)); setError('') } catch (failure) { setError((failure as Error).message) } finally { setBusy(false) } }
  return <details className="ob-native-controls"><summary>Inspect native connector configuration</summary><p>Read-only inspection of user and workspace configuration. It does not launch servers, contact endpoints or inspect OAuth tokens. Use the native engine’s MCP manager to complete its own authentication; do not paste those credentials into chat.</p><button type="button" disabled={busy} onClick={() => void read()}>Read native configuration</button>
    {value?.files.map(file => <section key={`${file.path}:${file.scope}`}><h4>{file.scope}</h4><p className="break-all">{file.path}</p>{file.entries.map(entry => <p key={entry.name} className="break-words"><strong>{entry.name}</strong> · {entry.transport} {entry.endpoint}<br />Configured; enabled, loaded, authenticated and used: unverified.{entry.disabledFlag !== undefined ? ` Native disabled flag: ${entry.disabledFlag}.` : ''}{entry.credentialFields ? ' Environment or auth fields exist; values are not displayed.' : ''}</p>)}</section>)}
    {value?.notices.map(notice => <p key={notice}>{notice}</p>)}{error && <p role="status">{error}</p>}
  </details>
}
