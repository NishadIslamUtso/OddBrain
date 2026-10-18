import { useEffect, useState } from 'react'
import { X, Search, RefreshCw, Layers, Shield, GripVertical, ChevronRight } from 'lucide-react'
import { CAPSULE_DRAG_TYPE, capsuleText, vaultGet } from '../lib/vault.js'
import BlacklistManager from './BlacklistManager.jsx'
export default function VaultPanel({ onClose, onPreview }) {
  const [tab, setTab] = useState('capsules')
  const [query, setQuery] = useState('')
  const [capsules, setCapsules] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      vaultGet(`/capsules?q=${encodeURIComponent(query)}`, controller.signal).then(data => { setCapsules(data.capsules || []); setError('') }).catch(error => { if (!controller.signal.aborted) setError(error.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, query ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, revision])
  return <aside className="vault-panel side-panel" aria-label="AI-Brain vault">
    <header className="panel-header"><div><h2>AI-Brain</h2><small>Canonical Markdown vault</small></div><button className="icon-button" aria-label="Close vault" onClick={onClose}><X size={17} /></button></header>
    <div className="panel-tabs"><button className={tab === 'capsules' ? 'selected' : ''} onClick={() => setTab('capsules')}><Layers size={14} />Capsules</button><button className={tab === 'access' ? 'selected' : ''} onClick={() => setTab('access')}><Shield size={14} />Access</button></div>
    <div className="vault-body">{tab === 'access' ? <BlacklistManager /> : <>
      <div className="vault-search"><Search size={14} /><input placeholder="Search capsules" aria-label="Search capsules" value={query} onChange={event => setQuery(event.target.value)} /><button className="icon-button" aria-label="Refresh vault" onClick={() => setRevision(value => value + 1)}><RefreshCw size={13} /></button></div>
      <p className="vault-instruction">Drag a capsule into the composer, or click to preview its exact context. Nothing is sent until you send your message.</p>
      {loading && <p className="muted">Reading local vault…</p>}
      {error && <p className="error-text" role="alert">Vault unavailable: {error}</p>}
      {!loading && !error && !capsules.length && <div className="vault-empty"><Layers size={28} /><h3>No capsules yet</h3><p>Capsules saved by the collector will appear here. No sample memories have been invented.</p></div>}
      {capsules.map(capsule => <button key={capsule.id} className="capsule-card" draggable onDragStart={event => { const content = capsuleText(capsule); event.dataTransfer.setData(CAPSULE_DRAG_TYPE, JSON.stringify({ ...capsule, content })); event.dataTransfer.effectAllowed = 'copy' }} onClick={() => onPreview({ ...capsule, content: capsuleText(capsule) })}><div><GripVertical size={13} /><strong>{capsule.title}</strong><ChevronRight size={13} /></div><p>{capsule.background?.slice(0, 120) || 'Source-linked context'}</p><small>v{capsule.version || 1} · {capsule.source || 'Local vault'}</small></button>)}
    </>}</div><footer className="panel-footnote">Local vault API · 127.0.0.1:8765<br />No external account or upload.</footer>
  </aside>
}
