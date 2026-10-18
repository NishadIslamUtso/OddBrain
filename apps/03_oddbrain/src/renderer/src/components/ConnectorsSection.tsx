import { sampleEnabled } from '@shared/lib/sampleWorkspace'
import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useEngine } from '@/state/engine'
import { getEngineApi, isDemo } from '@/platform/bridge'

/** Connect existing installations. No download or installer actions. */
const ENGINES = [
  { id: 'claude-code', label: 'Claude Code', url: 'https://code.claude.com/docs/en/setup', command: 'claude' },
  { id: 'agy', label: 'agy', url: 'https://antigravity.google', command: 'agy' },
] as const

export default function ConnectorsSection(): React.JSX.Element {
  const engine = useEngine()
  const [overrides, setOverrides] = useState({ 'claude-code': '', agy: '' })
  const [runtime, setRuntime] = useState({ checking: false, running: false, answer: '' })
  const [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const checkAll = (): void => {
    if (isDemo && !sampleEnabled()) return
    void engine.checkEngines(true)
    for (const { id } of ENGINES) {
      void getEngineApi().binaryOverride(id).then(reply => setOverrides(old => ({ ...old, [id]: reply.path }))).catch(() => setNote('Could not read executable settings.'))
    }
    setRuntime(old => ({ ...old, checking: true }))
    void getEngineApi().downloads.serveStatus().then(reply => setRuntime({ checking: false, running: reply.running, answer: reply.answer })).catch(() => setRuntime({ checking: false, running: false, answer: 'Could not check Ollama.' }))
  }
  useEffect(checkAll, [])
  const executable = async (id: 'claude-code' | 'agy', clear = false): Promise<void> => {
    setBusy(true); setNote('')
    try {
      const answer = clear ? await getEngineApi().clearBinary(id) : await getEngineApi().pickBinary(id)
      if (!answer.ok) { setNote(answer.answer || 'Executable was not changed.'); return }
      checkAll()
    } catch { setNote('Could not change the executable. Try again.') }
    finally { setBusy(false) }
  }
  const runtimeAction = async (start: boolean): Promise<void> => {
    setBusy(true); setNote('')
    try {
      const answer = start ? await getEngineApi().downloads.serveStart() : await getEngineApi().downloads.serveStop()
      setNote(answer.answer); checkAll()
    } catch { setNote('Could not change the Ollama runtime. Check the installation and try again.') }
    finally { setBusy(false) }
  }
  const address = '127.0.0.1:11434'
  return <div className="ob-connectors">
    <div className="ob-section-actions"><p className="ob-control-scope">Install engines separately, then connect them here.</p><button type="button" className="ob-small-button" onClick={checkAll} disabled={(isDemo && !sampleEnabled()) || busy || runtime.checking || engine.detection.loading}><RefreshCw size={13} />{runtime.checking || engine.detection.loading ? 'Checking…' : 'Check all'}</button></div>
    {ENGINES.map(({ id, label, url, command }) => {
      const found = engine.detection.engines.find(entry => entry.id === id)
      return <section key={id} className="ob-connector-row" aria-label={`${label} connector`}>
        <header><h3>{label}</h3><span>{sampleEnabled() ? 'Simulated engine' : isDemo ? 'Desktop app required' : engine.detection.loading ? 'Checking…' : found?.found ? `Installed${found.version ? ` · ${found.version}` : ''}` : 'Not found'}{engine.settings.id === id ? ' · Selected' : ''}</span></header>
        {found?.path ? <p className="ob-path" title={found.path}>{found.path}</p> : null}
        <div className="ob-inline-actions">
          {found?.found && engine.settings.id !== id ? <button type="button" disabled={busy} onClick={() => void engine.pick(id)}>Use this engine</button> : null}
          <button type="button" disabled={isDemo || busy} onClick={() => void executable(id)}>{overrides[id] ? 'Change executable…' : 'Choose executable…'}</button>
          {overrides[id] ? <button type="button" disabled={busy} onClick={() => void executable(id, true)}>Use automatic detection</button> : null}
          <a href={url} target="_blank" rel="noopener noreferrer">Setup guide <ExternalLink size={12} /></a>
        </div>
        <details className="ob-setting-help"><summary>Connection details</summary><p>Sign in by running <code>{command}</code> in a terminal. Credentials stay with the engine.</p>{overrides[id] ? <p className="ob-path">Selected executable: {overrides[id]}</p> : null}</details>
      </section>
    })}
    <section className="ob-connector-row" aria-label="Ollama connector">
      <header><h3>Ollama</h3><span>{sampleEnabled() ? (runtime.running ? 'Simulated: on' : 'Simulated: off') : isDemo ? 'Desktop app required' : runtime.checking ? 'Checking…' : runtime.running ? 'Running' : 'Not running'}</span></header>
      <p className="ob-path">{address}</p>
      <div className="ob-inline-actions">
        <button type="button" disabled={(isDemo && !sampleEnabled()) || busy} onClick={() => void runtimeAction(true)}>Start Ollama</button>
        <button type="button" disabled={(isDemo && !sampleEnabled()) || busy} onClick={() => void runtimeAction(false)}>Stop app-started runtime</button>
        <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">Setup guide <ExternalLink size={12} /></a>
      </div>
      <details className="ob-setting-help"><summary>Runtime details</summary><p>Start uses an installed Ollama. Stop only affects a runtime started by OddBrain; other running instances are left alone.</p>{runtime.answer ? <p>{runtime.answer}</p> : null}</details>
    </section>
    {note ? <p role="status" className="ob-control-scope">{note}</p> : null}
  </div>
}
