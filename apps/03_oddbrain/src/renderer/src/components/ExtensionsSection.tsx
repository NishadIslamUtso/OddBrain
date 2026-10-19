import { useState } from 'react'
import type { Appearance } from '../state/appearance'
import ModsSection from './ModsSection'
import EngineMarketplace from './EngineMarketplace'

export default function ExtensionsSection(props: { appearance: Appearance; onAppearanceChange(value: Appearance): void }) {
  const [source, setSource] = useState('packs')
  return <div className="space-y-4"><label className="ob-form-line">Source <select aria-label="Plugin source" value={source} onChange={e => setSource(e.target.value)}><option value="packs">OddBrain packs</option><option value="claude">Claude Code marketplaces</option><option value="agy">agy</option></select></label>
    {source === 'packs' ? <ModsSection {...props} /> : <EngineMarketplace key={source} engine={source === 'agy' ? 'agy' : 'claude-code'} />}
  </div>
}
