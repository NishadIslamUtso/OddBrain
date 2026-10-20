import { useEffect, useState } from 'react'
import type { ChatState } from '@/state/useChats'

/** Storage health stays visible on every screen; a chat-only notice is too easy to miss. */
export default function ChatStorageBanner({ chats }: { chats: Pick<ChatState, 'storage' | 'retryStorage' | 'exportRecovery' | 'openStorageLocation'> }) {
  const [working, setWorking] = useState<'retry' | 'export' | 'open' | ''>(''), [answer, setAnswer] = useState(''), [showProgress, setShowProgress] = useState(chats.storage.state === 'loading')
  useEffect(() => {
    if (chats.storage.state === 'loading') { setShowProgress(true); return }
    if (chats.storage.state !== 'saving') { setShowProgress(false); return }
    const timer = setTimeout(() => setShowProgress(true), 250)
    return () => clearTimeout(timer)
  }, [chats.storage.state])
  if (chats.storage.state === 'ready' || (chats.storage.state === 'saving' && !showProgress)) return null
  const act = async (kind: 'retry' | 'export' | 'open'): Promise<void> => {
    if (working) return
    setWorking(kind); setAnswer('')
    try {
      if (kind === 'retry') setAnswer(await chats.retryStorage() ? 'Conversation storage is working again.' : 'Conversation storage still needs attention.')
      else {
        const result = kind === 'export' ? await chats.exportRecovery() : await chats.openStorageLocation()
        setAnswer(result.answer)
      }
    } finally { setWorking('') }
  }
  const attention = chats.storage.state === 'attention'
  return <aside className={`fixed bottom-3 left-1/2 z-[80] w-[min(720px,calc(100vw-24px))] -translate-x-1/2 rounded-xl border px-3 py-2 shadow-xl ${attention ? 'border-warn/60 bg-bg' : 'border-line bg-card'}`} role={attention ? 'alert' : 'status'} aria-label="Conversation storage status">
    <div className="flex flex-wrap items-center gap-2"><strong className="text-[12px] text-ink">{chats.storage.state === 'loading' ? 'Opening conversations…' : chats.storage.state === 'saving' ? 'Saving conversation…' : 'Conversation storage needs attention'}</strong>{attention ? <><button type="button" className="ob-small-button" disabled={!!working} onClick={() => void act('retry')}>{working === 'retry' ? 'Retrying…' : 'Retry'}</button><button type="button" className="ob-small-button" disabled={!!working} onClick={() => void act('export')}>{working === 'export' ? 'Exporting…' : 'Export recovery data'}</button><button type="button" className="ob-small-button" disabled={!!working} onClick={() => void act('open')}>{working === 'open' ? 'Opening…' : 'Open storage folder'}</button></> : null}</div>
    {attention ? <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{chats.storage.message}</p> : null}
    {answer ? <p className="mt-1 text-[11.5px] text-muted">{answer}</p> : null}
  </aside>
}
