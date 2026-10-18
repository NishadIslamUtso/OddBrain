import { useRef, useState } from 'react'
import { ChevronDown, Check, RefreshCw, Circle, Eye, Brain } from 'lucide-react'
import useDismiss from '../hooks/useDismiss.js'
export default function ModelSelector({ models, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useDismiss(ref, () => setOpen(false), open)
  return <div className="model-selector" ref={ref}>
    <button className="model-trigger" aria-label="Select local model" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)} title={`Actual local model: ${models.model}`}><span>{models.model}</span><ChevronDown size={12} /></button>
    {open && <div className="popup model-menu" role="menu" aria-label="Installed Ollama models">
      <header><span><Circle size={8} fill={models.status === 'online' ? '#84a68b' : '#aaa'} stroke="none" />Local · Ollama</span><button className="icon-button" aria-label="Refresh models" onClick={models.refresh}><RefreshCw size={14} className={models.status === 'loading' ? 'spin' : ''} /></button></header>
      {models.status === 'loading' && <p className="model-description">Checking installed models…</p>}
      {models.error && <p className="model-description error-text">{models.error}</p>}
      {models.status === 'online' && !models.models.length && <p className="model-description">No installed models returned by Ollama. Nothing is downloaded automatically.</p>}
      {models.models.map(model => <button key={model.name} role="menuitemradio" aria-checked={model.name === models.model} onClick={() => { models.select(model.name); setOpen(false) }}><span>{model.name}<small>{model.details?.parameter_size || 'Installed'}{model.size ? ` · ${(model.size / 1024 ** 3).toFixed(1)} GB` : ''}</small></span>{model.name === models.model && <Check size={15} />}</button>)}
      <div className="model-capabilities"><span><Eye size={12} />Vision {models.capabilities.vision ? 'verified' : 'not verified'}</span><span><Brain size={12} />Thinking {models.capabilities.thinking ? 'verified' : 'not verified'}</span></div>
      <p className="model-footnote">Uses only your installed models. This interface does not use Sonnet or any hosted model.</p>
    </div>}
  </div>
}
