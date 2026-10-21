import { useEffect, useState } from 'react'
import { DEFAULT_VIDEO_STUDIO, type VideoStudioView } from '@shared/lib/videoStudio'
import type { McpReview } from '@shared/lib/mcpReview'
import type { FileReview } from '@shared/lib/changeReview'
import { kdenliveEditingSkill } from '@shared/lib/videoEditingSkill'
import { bridge, isDemo } from '../platform/bridge'

const EMPTY: VideoStudioView = { preferences: { ...DEFAULT_VIDEO_STUDIO }, kdenliveVersion: '', kdenliveReady: false, mcpConnected: false, mcpTools: [], nativeKdenlive: { compatible: false, identity: 'Not connected', protocol: '', referenceCommit: '', missingTools: [], reason: 'Connect and test the reviewed native protocol.' }, aiToolsUrl: '', projectReady: false, hasMcpToken: false, hasPixabayKey: false, keyEncryption: 'none', notice: '' }

export default function VideoStudioSettings() {
  const [view, setView] = useState<VideoStudioView>(EMPTY), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const [mcpToken, setMcpToken] = useState(''), [pixabay, setPixabay] = useState(''), [connectorReview, setConnectorReview] = useState<McpReview | null>(null)
  const [skillReview, setSkillReview] = useState<FileReview | null>(null), [skillEngine, setSkillEngine] = useState<'claude-code' | 'agy'>('claude-code')
  useEffect(() => { void bridge.videoStudio.read().then(setView).catch(error => setNote(String(error))) }, [])
  const run = async (action: () => Promise<VideoStudioView>): Promise<void> => { setBusy(true); setNote(''); try { const next = await action(); setView(next); setNote(next.notice) } catch (error) { setNote((error as Error).message) } finally { setBusy(false) } }
  const saveUrl = (): void => { void run(() => bridge.videoStudio.update({ mcpUrl: view.preferences.mcpUrl })) }
  const secret = (kind: 'mcp' | 'pixabay', value: string, clear: () => void): void => { void run(async () => { const next = await bridge.videoStudio.saveSecret(kind, value); clear(); return next }) }
  const reviewEngineConnector = async (): Promise<void> => {
    setBusy(true); setNote('')
    try {
      const saved = await bridge.videoStudio.read(); setView(saved); if (!saved.aiToolsUrl) throw Error('OddBrain’s local video-review tools are not running.')
      if (!saved.mcpConnected) throw Error('Save and test this exact loopback Kdenlive MCP address first.')
      const current = await bridge.mcp.read(); if (current.problem) throw Error(current.problem)
      const servers = current.servers.filter(server => !['kdenlive', 'oddbrain-video'].includes(server.name))
      servers.push({ name: 'oddbrain-video', url: saved.aiToolsUrl })
      setConnectorReview(await bridge.mcp.preview(servers))
    } catch (error) { setNote((error as Error).message) } finally { setBusy(false) }
  }
  const decideEngineConnector = async (decision: 'allow' | 'deny'): Promise<void> => {
    if (!connectorReview) return
    setBusy(true)
    try { const answer = await bridge.mcp.decide(connectorReview.token, decision); setNote(answer.answer); setConnectorReview(null) } catch (error) { setNote((error as Error).message) } finally { setBusy(false) }
  }
  const reviewSkill = async (): Promise<void> => {
    setBusy(true); setNote('')
    try { setSkillReview(await bridge.skills.previewCreate(kdenliveEditingSkill(skillEngine))) }
    catch (error) { setNote((error as Error).message) } finally { setBusy(false) }
  }
  const decideSkill = async (decision: 'allow' | 'deny'): Promise<void> => {
    if (!skillReview) return
    setBusy(true)
    try { const answer = await bridge.skills.decideCreate(skillReview.token, decision); setNote(answer.answer); setSkillReview(null) }
    catch (error) { setNote((error as Error).message) } finally { setBusy(false) }
  }
  const status = view.mcpConnected ? `Connected · ${view.mcpTools.length} live tool${view.mcpTools.length === 1 ? '' : 's'}` : view.kdenliveReady ? 'Kdenlive found · MCP not connected' : 'Not connected'

  return <div className="ob-media-settings space-y-5">
    <section>
      <h3>Kdenlive</h3>
      <p className="ob-control-scope">Kdenlive owns the real timeline, monitor, Undo and export. OddBrain connects only through the loopback MCP address you review here.</p>
      <p className="break-all text-muted">{view.preferences.kdenlive || 'No Kdenlive executable selected.'}</p>
      <p className="text-muted">{status}{view.kdenliveVersion ? ` · ${view.kdenliveVersion}` : ''}</p>
      <div className="ob-inline-actions"><button type="button" disabled={isDemo || busy} onClick={() => void run(() => bridge.videoStudio.chooseKdenlive())}>Choose Kdenlive…</button><button type="button" disabled={isDemo || busy || !view.kdenliveReady} onClick={() => void run(() => bridge.videoStudio.testKdenlive())}>Test Kdenlive + MCP</button><button type="button" disabled={isDemo || busy || !view.kdenliveReady} onClick={() => void bridge.videoStudio.openKdenlive().then(answer => setNote(answer.answer))}>Open Kdenlive</button></div>
    </section>
    <section>
      <h3>Live MCP connection</h3>
      <label className="ob-form-line">Loopback address <input aria-label="Kdenlive MCP address" value={view.preferences.mcpUrl} onChange={event => setView(old => ({ ...old, preferences: { ...old.preferences, mcpUrl: event.target.value } }))} /></label>
      <div className="ob-inline-actions"><button type="button" disabled={busy} onClick={saveUrl}>Save address</button></div>
      <form className="ob-form-line" onSubmit={event => { event.preventDefault(); secret('mcp', mcpToken, () => setMcpToken('')) }}><label htmlFor="video-mcp-token">Optional bearer token</label><input id="video-mcp-token" type="password" value={mcpToken} onChange={event => setMcpToken(event.target.value)} placeholder={view.hasMcpToken ? 'Token saved' : 'Only if your MCP build requires one'} /><button type="submit" disabled={busy || !mcpToken}>Save</button>{view.hasMcpToken ? <button type="button" onClick={() => void run(() => bridge.videoStudio.clearSecret('mcp'))}>Remove</button> : null}</form>
      <p className="ob-control-scope">Public or LAN MCP addresses are refused. Native edit batches require the pinned protocol identity <strong>{view.nativeKdenlive.identity}</strong>. {view.nativeKdenlive.reason}</p>
      <button type="button" disabled={isDemo || busy || !view.mcpConnected || !view.aiToolsUrl} onClick={() => void reviewEngineConnector()}>Review adding safe video evidence, library and Kdenlive read/propose tools to AI chat…</button>
      <p className="ob-control-scope">The AI connector receives only OddBrain’s read/search/proposal tools, never native Kdenlive Apply or asset download. Apply/Undo stay in the app’s exact owner review. {view.hasMcpToken ? 'The protected Kdenlive token is not copied into project files.' : ''}</p>
      {connectorReview ? <div className="ob-control-scope"><strong>Exact connector-file review</strong><p>{connectorReview.explanation}</p>{connectorReview.changes.map(change => <details key={change.path}><summary className="break-all">{change.path}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{change.diff}</pre></details>)}<div className="ob-inline-actions"><button type="button" disabled={busy} onClick={() => void decideEngineConnector('allow')}>Allow exact changes</button><button type="button" disabled={busy} onClick={() => void decideEngineConnector('deny')}>Deny</button></div></div> : null}
      <div className="ob-control-scope"><strong>Reviewed editing Skill</strong><p>Install OddBrain’s independently written adaptation of the pinned native workflow: evidence → state → plan → owner review → one batch → preview → improve → export/verify.</p><div className="ob-inline-actions"><select aria-label="Video editing Skill engine" value={skillEngine} onChange={event => setSkillEngine(event.target.value as 'claude-code' | 'agy')}><option value="claude-code">Claude Code</option><option value="agy">agy</option></select><button type="button" disabled={isDemo || busy} onClick={() => void reviewSkill()}>Review Skill file…</button></div>{skillReview ? <div><p>{skillReview.checks.join(' ')}</p><details><summary className="break-all">{skillReview.path}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{skillReview.diff}</pre></details><div className="ob-inline-actions"><button type="button" disabled={busy} onClick={() => void decideSkill('allow')}>Allow exact Skill</button><button type="button" disabled={busy} onClick={() => void decideSkill('deny')}>Deny</button></div></div> : null}</div>
    </section>
    <section>
      <h3>Project storage</h3>
      <p className="break-all text-muted">{view.preferences.projectFolder || 'No project folder selected.'}</p>
      <button type="button" disabled={isDemo || busy} onClick={() => void run(() => bridge.videoStudio.chooseProjectFolder())}>Choose project folder…</button>
      <p className="ob-control-scope">Chosen stock assets and permitted link downloads go only into this folder, with source, licence and hash receipts. Existing files are not overwritten.</p>
    </section>
    <section>
      <h3>Public video links</h3>
      <p className="break-all text-muted">{view.preferences.ytDlp || 'No yt-dlp executable selected. Direct media links can still be inspected.'}</p>
      <button type="button" disabled={isDemo || busy} onClick={() => void run(() => bridge.videoStudio.chooseYtDlp())}>Choose owner-installed yt-dlp…</button>
      <p className="ob-control-scope">Metadata is inspected before approval. No cookies, login access, playlists, live streams or DRM bypass are used.</p>
    </section>
    <section>
      <h3>Creative Library</h3>
      <p className="ob-control-scope">Openverse and Wikimedia need no key. Pixabay images and videos use a free owner-provided key. Pexels and paid catalogues are not silently substituted.</p>
      <form className="ob-form-line" onSubmit={event => { event.preventDefault(); secret('pixabay', pixabay, () => setPixabay('')) }}><label htmlFor="pixabay-key">Pixabay key</label><input id="pixabay-key" type="password" value={pixabay} onChange={event => setPixabay(event.target.value)} placeholder={view.hasPixabayKey ? 'Key saved' : 'Optional'} /><button type="submit" disabled={busy || !pixabay}>Save</button>{view.hasPixabayKey ? <button type="button" onClick={() => void run(() => bridge.videoStudio.clearSecret('pixabay'))}>Remove</button> : null}</form>
      <p className="ob-control-scope">Keys are {view.keyEncryption === 'os' ? 'sealed by this machine’s keychain' : 'held only for this run'}.</p>
    </section>
    <section><h3>Video OCR</h3><p className="ob-control-scope">No second OCR setting is added. Video preflight reuses the reviewed DeepSeek-OCR-2 adapter from Voice & attachments, and only on selected adaptive evidence frames.</p></section>
    {note ? <p role="status" className="ob-control-scope">{note}</p> : null}
  </div>
}
