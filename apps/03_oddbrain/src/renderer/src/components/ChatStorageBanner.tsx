import { useEffect, useRef, useState } from 'react'
import type { ChatState } from '@/state/useChats'

type StorageControls = Pick<ChatState, 'storage' | 'retryStorage' | 'exportRecovery' | 'importRecovery' | 'openStorageLocation'>
type Action = 'retry' | 'export' | 'import' | 'open'

/** Storage failures stay visible on every screen without covering the composer. */
export default function ChatStorageBanner({ chats }: { chats: StorageControls }) {
  const [working, setWorking] = useState<Action | ''>(''), [answer, setAnswer] = useState(''), [collapsed, setCollapsed] = useState(false)
  const lastFault = useRef(chats.storage.state === 'attention' ? chats.storage.message : '')
  useEffect(() => {
    if (chats.storage.state === 'attention' && chats.storage.message !== lastFault.current) setCollapsed(false)
    lastFault.current = chats.storage.state === 'attention' ? chats.storage.message : ''
  }, [chats.storage])
  // Routine checkpoints never claim screen space. Pre-dispatch commits have
  // their own composer status; this strip is for startup and actionable faults.
  if ((chats.storage.state === 'ready' || chats.storage.state === 'saving') && !answer) return null
  const act = async (kind: Action): Promise<void> => {
    if (working) return
    setWorking(kind); setAnswer('')
    try {
      if (kind === 'retry') setAnswer(await chats.retryStorage() ? 'Conversation storage is working again.' : 'Conversation storage still needs attention.')
      else {
        const result = kind === 'export'
          ? await chats.exportRecovery()
          : kind === 'import'
            ? await chats.importRecovery()
            : await chats.openStorageLocation()
        setAnswer(result.answer)
      }
    } finally { setWorking('') }
  }
  const attention = chats.storage.state === 'attention'
  const loading = chats.storage.state === 'loading'
  if (attention && collapsed) return <aside className="relative z-[80] w-full shrink-0 border-b border-warn/60 bg-bg px-3 py-1.5" role="status" aria-label="Conversation storage needs attention (minimized)">
    <div className="flex items-center gap-2">
      <strong className="min-w-0 flex-1 truncate text-[12px] text-ink">Storage attention: {chats.storage.message}</strong>
      <button type="button" className="ob-small-button shrink-0" onClick={() => setCollapsed(false)}>Show recovery controls</button>
    </div>
  </aside>
  return <aside className={`relative z-[80] w-full shrink-0 border-b px-3 py-2 ${attention ? 'border-warn/60 bg-bg' : 'border-line bg-card'}`} role={attention ? 'alert' : 'status'} aria-label="Conversation storage status">
    <div className="flex flex-wrap items-center gap-2">
      <strong className="text-[12px] text-ink">{attention ? 'Conversation storage needs attention' : loading ? chats.storage.message : 'Conversation storage'}</strong>
      {attention ? <>
        <button type="button" className="ob-small-button" disabled={!!working} onClick={() => void act('retry')}>{working === 'retry' ? 'Retrying…' : 'Retry storage'}</button>
        <button type="button" className="ob-small-button" disabled={!!working} onClick={() => void act('export')}>{working === 'export' ? 'Exporting…' : 'Export recovery'}</button>
        <button type="button" className="ob-small-button" disabled={!!working} onClick={() => void act('import')}>{working === 'import' ? 'Importing…' : 'Import recovery'}</button>
        <button type="button" className="ob-small-button" disabled={!!working} onClick={() => void act('open')}>{working === 'open' ? 'Opening…' : 'Open storage folder'}</button>
        <button type="button" className="ob-small-button ml-auto" disabled={!!working} onClick={() => setCollapsed(true)}>Minimize</button>
      </> : null}
      {!attention && answer ? <button type="button" className="ob-small-button ml-auto" onClick={() => setAnswer('')}>Dismiss</button> : null}
    </div>
    {attention ? <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{chats.storage.message}</p> : null}
    {answer ? <p className="mt-1 text-[11.5px] text-muted">{answer}</p> : null}
  </aside>
}
