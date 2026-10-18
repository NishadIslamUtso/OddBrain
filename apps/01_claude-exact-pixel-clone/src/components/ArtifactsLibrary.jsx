import { useRef } from 'react'
import { Shapes, Code2, Upload } from 'lucide-react'
import { newId } from '../lib/storage.js'
export default function ArtifactsLibrary({ artifacts, onOpen, onImport, notify }) {
  const input = useRef(null)
  async function importFile(file) {
    if (!file) return
    try {
      if (!/\.(?:html?|svg)$/i.test(file.name) || file.size > 200_000) throw new Error('Choose an HTML or SVG source file smaller than 200 KB. No code is run on import.')
      const content = await file.text()
      onImport({ id: newId(), title: file.name, type: /\.svg$/i.test(file.name) ? 'svg' : 'html', origin: 'import', createdAt: new Date().toISOString(), versions: [{ content, savedAt: new Date().toISOString() }] })
    } catch (error) { notify(error.message) }
    finally { input.current.value = '' }
  }
  return <main className="library-view"><header><div><Shapes size={28} /><h1>Artifacts</h1></div><button className="secondary-button" onClick={() => input.current.click()}><Upload size={15} />Open HTML or SVG file</button><input ref={input} hidden type="file" accept=".html,.htm,.svg" onChange={event => importFile(event.target.files[0])} /></header>
    <p className="library-description">Your creations, in one place. Open an artifact to preview or edit its source locally.</p>
    {!artifacts.length ? <div className="library-empty"><Shapes size={38} /><h2>Make something your own</h2><p>Ask for an HTML app in chat, use “Create HTML artifact”, or open a source file. Ordinary replies never create artifacts.</p></div> : <div className="artifact-grid">{artifacts.map(artifact => <button key={artifact.id} className="library-artifact-card" onClick={() => onOpen(artifact.id)}><div className="artifact-thumbnail"><Code2 size={32} /></div><strong>{artifact.title}</strong><small>{artifact.type === 'html' ? 'HTML Application' : 'SVG Image'} · {artifact.versions.length} version{artifact.versions.length === 1 ? '' : 's'}</small></button>)}</div>}
  </main>
}
