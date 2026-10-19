import NativeMcpInventory from './NativeMcpInventory'
import NativeSkills from './NativeSkills'
import { useState, type ReactNode } from 'react'
import EngineMarketplace from './EngineMarketplace'

/** Shared configuration stays shared. Engine stores use only that engine's CLI. */
export default function EngineStoreSource({ kind, children }: { kind: 'skills' | 'connectors'; children: ReactNode }) {
  const [source, setSource] = useState('shared')
  const label = kind === 'skills' ? 'Skill' : 'Connector'
  return (
    <div className="space-y-4">
      <label className="ob-form-line">
        Source{' '}
        <select aria-label={`${label} source`} value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="shared">
            {kind === 'skills' ? 'Shared skill collection (both engines)' : 'Shared MCP configuration (both engines)'}
          </option>
          <option value="claude-code">Claude Code marketplaces</option>
          <option value="agy">agy marketplace</option>
        </select>
      </label>
      {source === 'shared' ? (
        children
      ) : (
        <div key={source}>{kind === 'skills' ? <NativeSkills engine={source === 'agy' ? 'agy' : 'claude-code'} /> : <NativeMcpInventory engine={source === 'agy' ? 'agy' : 'claude-code'} />}<EngineMarketplace engine={source === 'agy' ? 'agy' : 'claude-code'} focus={kind} /></div>
      )}
    </div>
  )
}
