import { useCallback, useEffect, useState } from 'react'
import { Blocks, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { vaultGet } from '../lib/vault.js'

/**
 * Connectors — live status of everything this app depends on.
 *
 * The app is the driver of the vault, Ollama does the inference, and the
 * browser extension collects. When one of them is down the UI degrades
 * quietly, which is right for chat but makes a fault hard to notice. This
 * panel asks each one directly and shows the answer.
 */
export default function Connectors({ models, vaultOk, vaultPath, onRecheck, onVault }) {
  const [vault, setVault] = useState(null)
  const [probing, setProbing] = useState(false)

  const probe = useCallback(async () => {
    setProbing(true)
    const [status] = await Promise.all([
      vaultGet('/status').catch(() => null),
      onRecheck?.() ?? Promise.resolve(),
    ])
    setVault(status)
    setProbing(false)
  }, [onRecheck])

  useEffect(() => { void probe() }, [probe])

  const rows = [
    {
      name: 'Ollama',
      detail: 'Inference on 127.0.0.1:11434',
      ok: models.status === 'online',
      value: models.status === 'online'
        ? `Reachable · ${models.models.length} model${models.models.length === 1 ? '' : 's'} installed · using ${models.model}`
        : 'Not reachable. Start your existing Ollama installation; this app never downloads a model.',
    },
    {
      name: 'AI-Brain vault',
      detail: 'Markdown memory on 127.0.0.1:8765',
      ok: Boolean(vault?.ok ?? vaultOk),
      value: vault?.ok
        ? `Online · ${vault.counts?.files ?? 0} files · ${vault.vault || vaultPath || ''}`
        : 'Offline. Conversation capture and Today view need the vault API running.',
      action: onVault ? { label: 'Open vault', run: onVault } : null,
    },
    {
      name: 'Browser extension',
      detail: 'Collector and inline suggestions',
      ok: null,
      value: 'Chrome cannot be detected from the page. Load the repository extension folder unpacked; it writes straight to this vault, so captures appear in AI-Brain once it is running.',
    },
  ]

  return <div className="settings-copy">
    <div className="connector-list">
      {rows.map(row => <div key={row.name} className={`connector ${row.ok === true ? 'up' : row.ok === false ? 'down' : ''}`}>
        <span className="connector-icon" aria-hidden="true">
          {row.ok === true ? <CheckCircle2 size={17} /> : row.ok === false ? <XCircle size={17} /> : <Blocks size={17} />}
        </span>
        <div className="connector-body">
          <strong>{row.name}</strong>
          <small>{row.detail}</small>
          <p>{row.value}</p>
          {row.action && <button className="secondary-button" onClick={row.action.run}>{row.action.label}</button>}
        </div>
        <span className="connector-state">{row.ok === true ? 'Connected' : row.ok === false ? 'Not connected' : 'Unknown'}</span>
      </div>)}
    </div>
    <button className="secondary-button" onClick={() => void probe()} disabled={probing}>
      <RefreshCw size={13} className={probing ? 'spin' : undefined} />{probing ? 'Checking…' : 'Re-check all'}
    </button>
  </div>
}
