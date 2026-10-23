import { useEffect, useState } from 'react'
import { draftStash, type SavedDraft } from '@shared/lib/draftStash'
import { workspaceKey } from '@shared/lib/sampleWorkspace'
import { newId } from '@shared/lib/storage'
import { trapDialogFocus } from './focus'
import CopyText from './CopyText'

export default function SavedDrafts({ draft, insert, close }: { draft: string; insert: (text: string) => void; close: () => void }) {
  const [notice, setNotice] = useState(''), [entries, setEntries] = useState<SavedDraft[]>(() => {
    try { return draftStash(localStorage, workspaceKey('oddbrain.saved-drafts')).list() } catch { return [] }
  })
  const act = (run: (store: ReturnType<typeof draftStash>) => void) => {
    try { const store = draftStash(localStorage, workspaceKey('oddbrain.saved-drafts')); run(store); setEntries(store.list()) } catch (e) { setNotice((e as Error).message) }
  }
  useEffect(() => { act(() => {}) }, [])
  return <div className="ob-modal-backdrop"><section className="ob-journal" role="dialog" aria-modal="true" aria-label="Saved drafts" onKeyDown={e => { trapDialogFocus(e); if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }}>
    <h2>Saved drafts</h2><p className="ob-control-scope">Text only, saved on this device. Attachments stay in the composer. Inserting adds to your current draft; it never sends a message. Sample and real drafts are separate.</p>
    <div className="ob-inline-actions"><button type="button" autoFocus onClick={close}>Close drafts</button><button type="button" disabled={!draft.trim()} onClick={() => act(store => { store.save(draft, newId()); setNotice('Saved a copy. Your current draft is unchanged.') })}>Save current draft</button><button type="button" onClick={() => act(() => setNotice('Refreshed.'))}>Refresh drafts</button></div>
    {entries.length ? <ul>{entries.map(entry => <li key={entry.id} className="border-b border-line py-3"><time>{new Date(entry.at).toLocaleString()}</time><details><summary>{entry.text.slice(0, 100)}{entry.text.length > 100 ? '…' : ''}</summary><pre className="whitespace-pre-wrap break-words">{entry.text}</pre></details><div className="ob-inline-actions"><button type="button" onClick={() => { insert(entry.text); close() }}>Insert into draft</button><CopyText text={entry.text} label="Copy saved draft" /><button type="button" onClick={() => act(store => { store.remove(entry.id); setNotice('Saved copy removed. Composer text was not changed.') })}>Remove saved copy</button></div></li>)}</ul> : <p>No saved drafts loaded. Refresh to check this device.</p>}
    {notice ? <p role="status">{notice}</p> : null}
  </section></div>
}
