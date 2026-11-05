import { useState } from 'react'
import { resolveChatContext, type ChatOverrides, type ContextDefaults } from '@shared/lib/chatContext'

/** Part 2 owns defaults; Part 1 must authorize resolved folders before dispatch. */
export default function ChatOverridesEditor({ defaults, value, save }: { defaults: ContextDefaults; value: ChatOverrides; save: (next: ChatOverrides) => boolean }) {
  const [next, setNext] = useState<ChatOverrides>(structuredClone(value)), [error, setError] = useState('')
  const inherited = (key: keyof ContextDefaults) => !Object.prototype.hasOwnProperty.call(next, key)
  return <details className="ob-native-controls"><summary>This chat’s goals, style and folder preferences</summary>
    <p>Inherit uses the current project default. This chat can replace it, including an explicitly empty value. Additional folders replace—not extend—the project list. These are references, not filesystem permission grants. Saving does not activate a folder or change a running task; the next send resolves them and asks before using an unapproved working folder.</p>
    {(['goal', 'style', 'workspace', 'additionalFolders'] as const).map(key => <label key={key}>{key}
      <select aria-label={`${key} source`} value={inherited(key) ? 'project' : 'chat'} onChange={event => setNext(previous => { const copy = { ...previous }; if (event.target.value === 'project') delete copy[key]; else if (key === 'additionalFolders') copy.additionalFolders = [...defaults.additionalFolders]; else copy[key] = defaults[key]; return copy })}><option value="project">Project default</option><option value="chat">This chat</option></select>
      <textarea aria-label={`${key} value`} disabled={inherited(key)} value={key === 'additionalFolders' ? (next.additionalFolders ?? defaults.additionalFolders).join('\n') : next[key] ?? defaults[key]} onChange={event => setNext(previous => ({ ...previous, [key]: key === 'additionalFolders' ? event.target.value.split('\n').filter(Boolean) : event.target.value }))} />
    </label>)}
    <button type="button" onClick={() => { try { resolveChatContext(defaults, next); if (save(next)) setError('Saved for this chat’s next send. Folder changes may require your approval before anything runs.') } catch (failure) { setError((failure as Error).message) } }}>Save this chat’s preferences</button>
    {error && <p role="status">{error}</p>}
  </details>
}
