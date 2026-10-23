import { sampleEnabled } from '@shared/lib/sampleWorkspace'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import BrainMark from './BrainMark'
import FindBar from './FindBar'
import type { VaultState } from '../hooks/useVault'

/** Shared navigation for every workspace layout and Settings. */
export default function TitleBar({ children, interactive = true, onNew, onBack, canBack = false }: {
  children?: ReactNode
  interactive?: boolean
  onNew?: () => void
  onBack?: () => void
  canBack?: boolean
  engineId?: string; engineModel?: string; engineAlive?: boolean; preview?: boolean
  vault?: VaultState; onOpenEngine?: () => void
}) {
  return <>{interactive ? <FindBar /> : null}<header className="ob-titlebar">
    <button type="button" className="ob-brand-home" onClick={onNew} disabled={!onNew} aria-label="OddBrain, new chat" title="New chat"><BrainMark size={18} /><span className="ob-brand-name">OddBrain</span></button>
    <button type="button" className="ob-icon-button ob-back" onClick={onBack} disabled={!canBack} aria-label="Back" title="Back"><ArrowLeft size={16} /></button>
    {onNew && typeof window !== 'undefined' && !window.api && <button type="button" className="ob-sample-label" title="Browser-only examples; no real model, extension or files" onClick={() => window.dispatchEvent(new Event('app:sample-settings'))}>{sampleEnabled() ? 'Sample workspace' : 'Empty preview'}</button>}
    {children}
  </header></>
}
