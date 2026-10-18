import { useEffect, useMemo, useRef, useState } from 'react'
import { Code2, Eye, X, Copy, Download, RefreshCw, Save, FileCode2, MessageSquarePlus, Crosshair, Wand2, PackageOpen, Loader2, Check } from 'lucide-react'
import { applyElementRewrite, artifactSource, buildPreviewHtml, parseElementPick, rewritePrompt, sourceSignature, withDesignTokens } from '../lib/artifacts.js'
import { DEFAULT_DESIGN_SYSTEM, DESIGN_SYSTEMS, designSystemLabel, loadDesignTokens } from '../design-systems/index.js'
import usePersistentState from '../hooks/usePersistentState.js'
import { askLocal } from '../lib/ask.js'
import { createZip, downloadBytes, slugify, staticSiteEntries } from '../lib/zip.js'
import { newId } from '../lib/storage.js'

/** Live previews refresh at this pace — fast enough to feel live, cheap enough for a 3B model on one GPU. */
const LIVE_INTERVAL = 700

const REWRITE_SYSTEM = 'You are a precise HTML editor. You change exactly one element and return only that element, with no markdown fence and no explanation. You never rewrite the whole document and you never rename ids or classes you were not asked to change.'

export default function ArtifactPanel({ artifact, onClose, onSave, notify, models, live = false, onExternalLink, inference }) {
  const [view, setView] = useState('preview')
  const [version, setVersion] = useState(artifact.versions.length - 1)
  const [draft, setDraft] = useState(artifactSource(artifact))
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [liveSource, setLiveSource] = useState(() => artifactSource(artifact))
  const [pickMode, setPickMode] = useState(false)
  const [pin, setPin] = useState(null)
  const [comment, setComment] = useState('')
  const [rewriting, setRewriting] = useState(false)
  const [rewritePreview, setRewritePreview] = useState('')
  const [exported, setExported] = useState(false)
  const frame = useRef(null)
  const rewriteJob = useRef(null)
  const channel = useRef(newId())
  const source = live ? liveSource : artifactSource(artifact, version)
  const savingVersion = artifact.versions.length - 1
  const dirty = draft !== artifactSource(artifact, savingVersion)
  // A visual language for generated markup. Without one, a 3B model produces
  // unstyled output; with one it produces something that looks designed.
  const [designId, setDesignId] = usePersistentState('artifact_design_system', DEFAULT_DESIGN_SYSTEM)
  const [tokens, setTokens] = useState('')
  useEffect(() => {
    let alive = true
    loadDesignTokens(designId).then(css => { if (alive) setTokens(css) }).catch(() => { if (alive) setTokens('') })
    return () => { alive = false }
  }, [designId])
  const html = useMemo(() => buildPreviewHtml(draft === artifactSource(artifact, savingVersion) ? source : draft, channel.current, tokens), [source, draft, savingVersion, artifact, tokens])
  const signature = sourceSignature(source)

  useEffect(() => { setVersion(artifact.versions.length - 1) }, [artifact.versions.length])
  useEffect(() => { setDraft(artifactSource(artifact)); setError('') }, [artifact])

  // While the reply is still streaming the iframe must not be rebuilt on every
  // token; the document is re-rendered on a timer instead.
  useEffect(() => {
    if (!live) { setLiveSource(artifactSource(artifact)); return undefined }
    setLiveSource(artifactSource(artifact))
    const timer = setInterval(() => setLiveSource(artifactSource(artifact)), LIVE_INTERVAL)
    return () => clearInterval(timer)
  }, [live, artifact, signature])

  useEffect(() => {
    const onMessage = event => {
      if (event.source !== frame.current?.contentWindow) return
      const data = event.data
      if (data?.channel !== channel.current) return
      if (data.type === 'ai-assistant-artifact-error' && typeof data.message === 'string') setError(data.message.slice(0, 500))
      if (data.type === 'ai-assistant-pick-cancelled') setPickMode(false)
      if (data.type === 'ai-assistant-pick') {
        const parsed = parseElementPick(data, channel.current)
        if (parsed) { setPin(parsed); setPickMode(false); setRewritePreview('') }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Tell the preview when to highlight elements instead of running the app.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'ai-assistant-mode', channel: channel.current, mode: pickMode ? 'pick' : 'browse' }, '*')
  }, [pickMode, signature, reload, view])

  useEffect(() => () => rewriteJob.current?.abort(), [])

  async function copy() {
    try { await navigator.clipboard.writeText(draft); notify('Artifact source copied.') } catch { notify('Clipboard permission is unavailable. Select and copy the source instead.') }
  }
  function download() {
    const blob = new Blob([draft], { type: artifact.type === 'svg' ? 'image/svg+xml' : 'text/html' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `${slugify(artifact.title)}.${artifact.type === 'svg' ? 'svg' : 'html'}`
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('Source downloaded. Review it before running outside the sandbox; the exported source is not network-isolated.')
  }
  /** A folder a static host can publish with no build step. */
  function exportSite() {
    try {
      // Export what the preview shows, so a deployed copy looks the same.
      const body = withDesignTokens(draft, tokens)
      const entries = staticSiteEntries({
        title: artifact.title, source: body, type: artifact.type,
        note: `Exported from AI ASSistant on ${new Date().toLocaleString()}. The preview inside the app is sandboxed; a deployed copy is a normal web page and should be reviewed before publishing.`,
      })
      const bytes = createZip(entries)
      if (downloadBytes(bytes, `${slugify(artifact.title)}-site.zip`, 'application/zip', notify)) {
        setExported(true)
        setTimeout(() => setExported(false), 4000)
        notify('Exported a deployable static site: index.html plus host config. No build step is needed.')
      }
    } catch (caught) { notify(`Export failed: ${caught.message}`) }
  }
  /** Comment mode: ask the local model to rewrite just the pinned element. */
  async function rewrite() {
    if (!pin || rewriting) return
    if (!comment.trim()) { notify('Write what should change about the pinned element first.'); return }
    if (!models?.available) { notify(models?.error || 'The selected local model is not ready, so the region cannot be rewritten.') ; return }
    const controller = new AbortController()
    rewriteJob.current = controller
    setRewriting(true); setRewritePreview(''); setError('')
    try {
      const messages = [
        { role: 'system', content: REWRITE_SYSTEM },
        { role: 'user', content: rewritePrompt({ pick: pin, comment, source: draft, type: artifact.type }) },
      ]
      const { content } = await askLocal({
        model: models.model, messages, signal: controller.signal, budgetLabel: 'This region rewrite', timeoutMs: 240_000, inference,
        onChunk: piece => setRewritePreview(piece.content),
      })
      const next = applyElementRewrite(draft, pin.path, content)
      setDraft(next)
      setView('source')
      setPin(null); setComment('')
      notify('Region rewritten. Review the source, then choose Save version to keep it.')
    } catch (caught) {
      if (!controller.signal.aborted) notify(`Region rewrite failed: ${caught.message}`)
    } finally {
      rewriteJob.current = null
      setRewriting(false); setRewritePreview('')
    }
  }

  return <aside className="artifact-panel side-panel" aria-label="Artifact workbench">
    <header className="panel-header"><div><h2>{artifact.title}</h2><small>{artifact.type === 'html' ? 'HTML Application' : 'SVG Image'}{live ? ' · streaming' : ''}</small></div><button className="icon-button" aria-label="Close artifact" onClick={onClose}><X size={17} /></button></header>
    <div className="artifact-toolbar">
      <div className="panel-tabs">
        <button className={view === 'preview' ? 'selected' : ''} onClick={() => { if (dirty && !live) { notify('Save your source as a new version before previewing changes.'); return } setView('preview') }}><Eye size={14} />Preview</button>
        <button className={view === 'source' ? 'selected' : ''} onClick={() => setView('source')}><Code2 size={14} />Source</button>
      </div>
      <div>
        <label className="design-system-picker" title="Visual language used to style this artifact">
          <span aria-hidden="true" className="design-swatch" style={{ background: DESIGN_SYSTEMS.find(entry => entry.id === designId)?.accent || '#888' }} />
          <select aria-label="Design system" value={designId} onChange={event => setDesignId(event.target.value)}>
            {DESIGN_SYSTEMS.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </label>
        <button className={`icon-button ${pickMode ? 'active' : ''}`} aria-label="Comment on an element" aria-pressed={pickMode} title="Comment mode: click an element to pin a change" onClick={() => { if (view !== 'preview') { notify('Switch to Preview to pin an element.'); return } setPickMode(!pickMode) }}><Crosshair size={14} /></button>
        <button className="icon-button" aria-label="Export a deployable site" title="Export a ZIP that any static host can publish" onClick={exportSite}>{exported ? <Check size={14} /> : <PackageOpen size={14} />}</button>
        <button className="icon-button" aria-label="Copy artifact source" onClick={copy}><Copy size={14} /></button>
        <button className="icon-button" aria-label="Download artifact source" onClick={download}><Download size={14} /></button>
      </div>
    </div>
    <div className="workbench-file">
      <FileCode2 size={14} /><span>{artifact.type === 'html' ? 'index.html' : 'image.svg'}</span>
      {live ? <span className="live-badge"><i />Live</span> : <select aria-label="Artifact version" value={version} onChange={event => setVersion(Number(event.target.value))}>{artifact.versions.map((entry, index) => <option key={index} value={index}>Version {index + 1}{entry.edited ? ' · edited' : ''}</option>)}</select>}
      {view === 'preview' && <button className="icon-button" aria-label="Refresh artifact preview" onClick={() => { setError(''); setReload(value => value + 1) }}><RefreshCw size={14} /></button>}
    </div>
    {pickMode && <p className="pick-hint" role="status"><Crosshair size={13} />Click any element in the preview to pin a change. Press Escape to stop.</p>}
    {pin && <div className="pin-card">
      <header><Crosshair size={13} /><span>&lt;{pin.picked.tag}{pin.picked.id ? ` #${pin.picked.id}` : ''}&gt;</span><small>{pin.width}×{pin.height}</small><button className="icon-button" aria-label="Clear pinned element" onClick={() => setPin(null)}><X size={13} /></button></header>
      {pin.picked.text && <p className="pin-text">“{pin.picked.text}”</p>}
      <textarea rows={2} aria-label="What should change about this element" placeholder="Make this blue and 20% wider" value={comment} onChange={event => setComment(event.target.value)} />
      {rewriting && <p className="pin-progress"><Loader2 size={12} className="spin" />Rewriting this element… {rewritePreview.length ? `${rewritePreview.length} characters` : ''}</p>}
      <footer>
        <button className="white-button" disabled={rewriting || !comment.trim()} onClick={rewrite}><Wand2 size={13} />Rewrite this region</button>
        {rewriting && <button className="secondary-button" onClick={() => rewriteJob.current?.abort()}>Stop</button>}
        <small>Only this element is replaced. The rest of the document is kept byte for byte.</small>
      </footer>
    </div>}
    {view === 'source' ? <><textarea className="source-editor" aria-label="Artifact source editor" spellCheck={false} value={draft} onChange={event => setDraft(event.target.value)} /><div className="source-actions"><small>{dirty ? 'Unsaved source changes' : live ? 'Streaming — the saved version appears when the reply finishes' : 'Source kept in local chat history'}</small><button className="secondary-button" disabled={!dirty || live || !draft.trim() || draft.length > 200_000} onClick={() => onSave(artifact.id, draft)}><Save size={14} />Save version</button></div></> : <>
      {error && <p className="preview-error" role="alert">Preview error: {error}</p>}
      <iframe key={`${version}-${reload}`} ref={frame} title={`Artifact preview: ${artifact.title}`} srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer" />
    </>}
    <footer className="panel-footnote">
      {live ? 'Live preview — updates while the model is still writing.' : 'Isolated preview · no network, vault access, forms or popups.'}<br />
      HTML/inline JS, SVG and <code>canvas[data-chart]</code>. No CDN libraries: charts render from inline JSON.
    </footer>
  </aside>
}
