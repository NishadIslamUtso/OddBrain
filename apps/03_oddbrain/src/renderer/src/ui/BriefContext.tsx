import { useState } from 'react'
import { X } from 'lucide-react'
import { discardSeed, peekSeed, useCompact } from '../state/compact'
import { trapDialogFocus } from './focus'
import CopyText from './CopyText'
/** Real pending context is visible, inspectable and removable before a send. */
export default function BriefContext() {
  useCompact(); const seed = peekSeed(), [open, setOpen] = useState(false)
  if (!seed) return null
  return <div className="ob-brief-context"><span>A brief is queued for the next accepted send.</span><button type="button" className="ob-text-button" onClick={() => setOpen(true)}>View brief</button><button type="button" className="ob-text-button" onClick={discardSeed}>Leave it out</button>{open ? <div className="ob-modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Queued brief" className="ob-journal" onKeyDown={e => { trapDialogFocus(e); if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }}><header><h2>Queued brief</h2><button type="button" className="ob-icon-button" aria-label="Close brief" autoFocus onClick={() => setOpen(false)}><X size={15} /></button></header><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12.5}}>{seed}</pre><CopyText text={seed} label="Copy brief" /><button type="button" className="ob-small-button" onClick={discardSeed}>Leave it out of the next send</button></section></div> : null}</div>
}
