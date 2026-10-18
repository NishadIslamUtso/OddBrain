import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
export default function Dialog({ title, onClose, children, className = '', labelledBy = 'dialog-title' }) {
  const ref = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previouslyFocused = document.activeElement
    const root = document.getElementById('root')
    const wasInert = root.inert
    root.inert = true
    const elements = () => [...ref.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(element => element.getClientRects().length)
    ;(elements()[0] || ref.current).focus()
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); close.current() }
      if (event.key === 'Tab') {
        const nodes = elements()
        if (!nodes.length) { event.preventDefault(); ref.current.focus(); return }
        if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === ref.current)) { event.preventDefault(); nodes.at(-1).focus() }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { root.inert = wasInert; document.removeEventListener('keydown', onKey); previouslyFocused?.focus?.() }
  }, [])
  return createPortal(<div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={`dialog ${className}`}>
      {title && <header className="dialog-header"><h2 id={labelledBy}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></header>}
      {children}
    </section>
  </div>, document.body)
}
