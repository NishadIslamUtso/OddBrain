import ConnectionGraph from './ConnectionGraph'
import { Mascot } from '../motion/Mascot'
import type { VaultState } from '../hooks/useVault'

/** The full-size view and Settings embed share one real-data graph. */
export default function BrainView({ vault, isDemo, onOpenVault }: { vault: VaultState; isDemo: boolean; onOpenVault: () => void }) {
  return <div className="ob-brain-view" aria-label="Brain">
    <header className="ob-screen-header"><Mascot motion="branch-merge" size={32} static /><h1>Brain</h1>{vault.path && <span title={vault.path}>{vault.path}</span>}<button type="button" className="ob-small-button" onClick={onOpenVault}>Open Vault</button></header>
    <ConnectionGraph path={vault.path} isDemo={isDemo} variant="full" />
  </div>
}
