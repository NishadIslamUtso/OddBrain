import { useState } from 'react'
import CopyText from './CopyText'
import { downloadText } from '../lib/downloadText'
import { trapDialogFocus } from './focus'

/** Plain prompt text only, not a code editor or external command launcher. */
export default function PromptEditor({ initial, apply, close }: { initial: string; apply: (text: string) => void; close: () => void }) {
  const [text, setText] = useState(initial), [error, setError] = useState('')
  return <div className="ob-modal-backdrop"><section className="ob-journal" role="dialog" aria-modal="true" aria-label="Edit prompt text" onKeyDown={event => { trapDialogFocus(event); if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
    <h2>Edit prompt text</h2><p>Text only. Attachments stay in the composer. Export or copy for your preferred writing app; no editor is launched and nothing is sent.</p>
    <textarea autoFocus aria-label="Prompt editor text" rows={16} className="w-full" value={text} onChange={event => setText(event.target.value)} />
    <div className="ob-inline-actions"><button type="button" onClick={() => { try { apply(text); close() } catch (failure) { setError((failure as Error).message) } }}>Use edited text</button><CopyText text={text} label="Copy edited prompt" /><button type="button" onClick={() => downloadText(text, 'prompt.txt')}>Export prompt text</button><button type="button" onClick={close}>Cancel editor</button></div>
    {error && <p role="alert">{error}</p>}
  </section></div>
}
