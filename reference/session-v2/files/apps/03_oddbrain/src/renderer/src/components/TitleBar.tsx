import type { ReactNode } from 'react'
import BrainMark from './BrainMark'
import FindBar from './FindBar'
import type { VaultState } from '../hooks/useVault'

/** A compact native-app header. Actual work/approvals belong by the composer;
 * provider location remains in the model picker. No general status ornaments. */
export default function TitleBar({ children, interactive = true }: {
  children?: ReactNode
  interactive?: boolean
  // Retained for source compatibility with callers; no longer painted as chips.
  engineId?: string; engineModel?: string; engineAlive?: boolean; preview?: boolean
  vault?: VaultState; onOpenEngine?: () => void
}) {
  return <>{interactive ? <FindBar /> : null}<header className="ob-titlebar"><BrainMark size={18} /><span className="ob-brand-name">OddBrain</span>{children}</header></>
}
