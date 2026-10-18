import { sampleEnabled } from '@shared/lib/sampleWorkspace'
import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useEngine } from '@/state/engine'
import { getEngineApi, isDemo } from '@/platform/bridge'
import McpServersSection from './McpServersSection'

/** Connect existing installations. No download or installer actions. */
const ENGINES = [
  { id: 'claude-code', label: 'Claude Code', url: 'https://code.claude.com/docs/en/setup', command: 'claude' },
  { id: 'agy', label: 'agy', url: 'https://antigravity.google', command: 'agy' },
] as const

type AuthView = { checking: boolean; ok: boolean; loggedIn: boolean; answer: string }
const EMPTY_AUTH: AuthView = { checking: false, ok: false, loggedIn: false, answer: '' }

export default function ConnectorsSection(): React.JSX.Element {
  const engine = useEngine()
  const [overrides, setOverrides] = useState({ 'claude-code': '', agy: '' })
  const [runtime, setRuntime] = useState({ checking: false, running: false, answer: '' })
  const [ollama, setOllama] = useState<{ checking: boolean; ok: boolean; version: string; compatible: boolean; answer: string }>({ checking: false, ok: false, version: '', compatible: false, answer: '' })
  const [auth, setAuth] = useState<Record<'claude-code' | 'agy', AuthView>>({ 'claude-code': { ...EMPTY_AUTH }, agy: { ...EMPTY_AUTH } })
  const [busy, setBusy] = useState(false), [note, setNote] = useState('')

  const checkAuth = (id: 'claude-code' | 'agy'): void => {
    if (isDemo && !sampleEnabled()) return
    setAuth((old) => ({ ...old, [id]: { ...old[id], checking: true, answer: '' } }))
    void getEngineApi().authStatus(id)
      .then((reply) => setAuth((old) => ({ ...old, [id]: { checking: false, ok: reply.ok, loggedIn: reply.loggedIn, answer: reply.answer } })))
      .catch(() => setAuth((old) => ({ ...old, [id]: { checking: false, ok: false, loggedIn: false, answer: 'Could not ask the engine about its sign-in state.' } })))
  }

  const checkAll = (): void => {
    if (isDemo && !sampleEnabled()) return
    void engine.checkEngines(true)
    for (const { id } of ENGINES) {
      void getEngineApi().binaryOverride(id).then(reply => setOverrides(old => ({ ...old, [id]: reply.path }))).catch(() => setNote('Could not read executable settings.'))
    }
    setRuntime(old => ({ ...old, checking: true }))
    void getEngineApi().downloads.serveStatus().then(reply => setRuntime({ checking: false, running: reply.running, answer: reply.answer })).catch(() => setRuntime({ checking: false, running: false, answer: 'Could not check Ollama.' }))
    setOllama((old) => ({ ...old, checking: true }))
    void getEngineApi().ollamaVersion()
      .then((reply) => setOllama({ checking: false, ok: reply.ok, version: reply.version, compatible: reply.compatible, answer: reply.answer }))
      .catch(() => setOllama({ checking: false, ok: false, version: '', compatible: false, answer: 'Could not ask Ollama which version it is.' }))
    checkAuth('claude-code')
    checkAuth('agy')
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
  const startSignIn = async (): Promise<void> => {
    setBusy(true); setNote('')
    try {
      const reply = await getEngineApi().openLogin()
      setNote(reply.answer)
      if (reply.ok) checkAuth('claude-code')
    } catch { setNote('The terminal could not be opened. Run `claude` yourself; nothing was changed.') }
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
      const signIn = auth[id]
      return <section key={id} className="ob-connector-row" aria-label={`${label} connector`}>
        <header><h3>{label}</h3><span>{sampleEnabled() ? 'Simulated engine' : isDemo ? 'Desktop app required' : engine.detection.loading ? 'Checking…' : found?.found ? `Installed${found.version ? ` · ${found.version}` : ''}` : 'Not found'}{engine.settings.id === id ? ' · Selected' : ''}</span></header>
        {found?.path ? <p className="ob-path" title={found.path}>{found.path}</p> : null}
        <div className="ob-inline-actions">
          {found?.found && engine.settings.id !== id ? <button type="button" disabled={busy} onClick={() => void engine.pick(id)}>Use this engine</button> : null}
          <button type="button" disabled={isDemo || busy} onClick={() => void executable(id)}>{overrides[id] ? 'Change executable…' : 'Choose executable…'}</button>
          {overrides[id] ? <button type="button" disabled={busy} onClick={() => void executable(id, true)}>Use automatic detection</button> : null}
          <button type="button" disabled={isDemo || signIn.checking} onClick={() => checkAuth(id)}>{signIn.checking ? 'Asking…' : 'Check sign-in'}</button>
          {id === 'claude-code' && signIn.ok && !signIn.loggedIn ? <button type="button" disabled={(isDemo && !sampleEnabled()) || busy} onClick={() => void startSignIn()}>Sign in…</button> : null}
          <a href={url} target="_blank" rel="noopener noreferrer">Setup guide <ExternalLink size={12} /></a>
        </div>
        {signIn.answer ? <p role="status" className={`ob-control-scope ${signIn.loggedIn ? '' : 'text-warn'}`}>{signIn.answer}</p> : null}
        <details className="ob-setting-help"><summary>Connection details</summary><p>Sign in by running <code>{command}</code> in a terminal. Credentials stay with the engine; this app only asks whether a login exists.</p>{overrides[id] ? <p className="ob-path">Selected executable: {overrides[id]}</p> : null}</details>
      </section>
    })}
    <section className="ob-connector-row" aria-label="Ollama connector">
      <header><h3>Ollama</h3><span>{sampleEnabled() ? (runtime.running ? 'Simulated: on' : 'Simulated: off') : isDemo ? 'Desktop app required' : runtime.checking ? 'Checking…' : runtime.running ? 'Running' : 'Not running'}</span></header>
      <p className="ob-path">{address}{ollama.version ? ` · ${ollama.version}` : ''}</p>
      <div className="ob-inline-actions">
        <button type="button" disabled={(isDemo && !sampleEnabled()) || busy} onClick={() => void runtimeAction(true)}>Start Ollama</button>
        <button type="button" disabled={(isDemo && !sampleEnabled()) || busy} onClick={() => void runtimeAction(false)}>Stop app-started runtime</button>
        <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">Setup guide <ExternalLink size={12} /></a>
      </div>
      {ollama.answer ? <p role="status" className={`ob-control-scope ${ollama.ok && !ollama.compatible ? 'text-warn' : ''}`}>{ollama.answer}</p> : null}
      <details className="ob-setting-help"><summary>Runtime details</summary><p>Start uses an installed Ollama. Stop only affects a runtime started by OddBrain; other running instances are left alone. Claude Code needs Ollama 0.14 or newer to use local models through its own door.</p>{runtime.answer ? <p>{runtime.answer}</p> : null}</details>
    </section>
    <McpServersSection />
    {note ? <p role="status" className="ob-control-scope">{note}</p> : null}
  </div>
}
