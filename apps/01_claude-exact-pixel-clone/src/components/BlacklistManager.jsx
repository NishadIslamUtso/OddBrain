import { useEffect, useState } from 'react'
import { Plus, X, Shield } from 'lucide-react'
import { vaultGet, vaultPost } from '../lib/vault.js'
export default function BlacklistManager() {
  const [patterns, setPatterns] = useState([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    vaultGet('/blacklist', controller.signal)
      .then(data => {
        // A vault that answers with the wrong shape must not take the panel down.
        if (!Array.isArray(data?.excluded_patterns)) throw new Error('unexpected blacklist payload')
        setPatterns(data.excluded_patterns)
        setError('')
      })
      .catch(error => { if (!controller.signal.aborted) setError(`Vault unavailable: ${error.message}`) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  async function change(next) {
    setLoading(true)
    try { const data = await vaultPost('/blacklist', { action: 'set', excluded_patterns: next }); setPatterns(data.excluded_patterns); setError(''); setInput('') }
    catch (error) { setError(error.message) }
    finally { setLoading(false) }
  }
  return <section className="blacklist-manager" aria-label="Never-check blacklist"><h3><Shield size={15} />Never-check blacklist</h3><p>Default allow, explicit deny. A domain, URL or pattern such as bank.com/* blocks vault capture until you remove it.</p>
    <form onSubmit={event => { event.preventDefault(); const value = input.trim(); if (value && !patterns.includes(value)) change([...patterns, value]) }}><input aria-label="Excluded URL or domain pattern" value={input} onChange={event => setInput(event.target.value)} placeholder="bank.com/*" /><button className="secondary-button" disabled={loading || !input.trim()} aria-label="Add excluded pattern"><Plus size={16} /></button></form>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!loading && !patterns.length && !error && <p>No excluded patterns.</p>}
    <ul>{patterns.map(pattern => <li key={pattern}><code>{pattern}</code><button className="icon-button" disabled={loading} aria-label={`Remove ${pattern}`} onClick={() => change(patterns.filter(item => item !== pattern))}><X size={14} /></button></li>)}</ul>
    <small>Stored in Privacy & Access.md and Source Scope.md. Browser-side sync is a separate pending extension task.</small>
  </section>
}
