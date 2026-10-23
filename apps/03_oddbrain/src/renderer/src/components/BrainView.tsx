import { useEffect, useState } from 'react'
import ConnectionGraph from './ConnectionGraph'
import MemoryWorkspace, { type MemoryTab } from './MemoryWorkspace'
import MemorySection from './MemorySection'
import ReviewCenter from './ReviewCenter'
import AttachmentCenter from './AttachmentCenter'
import MemoryTrash from './MemoryTrash'
import { Mascot } from '../motion/Mascot'
import type { VaultState } from '../hooks/useVault'
import type { Chat } from '@shared/types'
const tabs = ['Memory inbox','Review','Files','People','Journal','Life Story','Map','Trash','Engine notes'] as const
/** The original graph and legacy notes remain while Memory_OB takes authority incrementally. */
export default function BrainView({ vault, isDemo, onOpenVault, chats, onRestoreChat }: { vault: VaultState; isDemo: boolean; onOpenVault: () => void; chats: Chat[]; onRestoreChat: (chatId: string) => void }) {
  const [tab, setTab] = useState<typeof tabs[number]>('Memory inbox')
  useEffect(() => { const open = (e: Event) => { const next = (e as CustomEvent).detail; if (tabs.includes(next)) setTab(next) }; window.addEventListener('app:memory-open', open); return () => window.removeEventListener('app:memory-open', open) }, [])
  return <div className="ob-brain-view" aria-label="Brain">
    <header className="ob-screen-header"><Mascot motion="branch-merge" size={32} static /><h1>Brain</h1>{vault.path && <span title={vault.path}>{vault.path}</span>}<button type="button" className="ob-small-button" onClick={onOpenVault}>Open Vault</button></header>
    <div className="ob-brain-tabs" role="tablist" aria-label="Brain sections">{tabs.map(name => <button type="button" role="tab" aria-selected={tab === name} className="ob-small-button" key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === 'Map' ? <ConnectionGraph path={vault.path} isDemo={isDemo} variant="full" /> : <div className="ob-brain-memory" role="tabpanel">{tab === 'Review' ? <ReviewCenter /> : tab === 'Files' ? <AttachmentCenter /> : tab === 'Trash' ? <MemoryTrash chats={chats} onRestoreChat={onRestoreChat} /> : tab === 'Engine notes' ? <MemorySection /> : <MemoryWorkspace key={tab} tab={tab as MemoryTab} />}</div>}
  </div>
}
