import { useMemo, useRef, useState } from 'react'
import { bridge, isDemo } from '../platform/bridge'
import type { SkillDraft, SkillInventory } from '@shared/lib/installedSkills'
import ChangeReview from './ChangeReview'
import CopyText from '../ui/CopyText'
export default function NativeSkills({ engine: fixedEngine }: { engine?: 'claude-code' | 'agy' }) {
  const [engine, setEngine] = useState<'claude-code' | 'agy'>(fixedEngine || 'claude-code')
  const [inventory, setInventory] = useState<SkillInventory | null>(null), [notice, setNotice] = useState(''), [content, setContent] = useState('')
  const [draft, setDraft] = useState({ name: '', description: '', body: '', requirements: '', replaceExisting: false }), [reviewing, setReviewing] = useState<SkillDraft | null>(null)
  const serial = useRef(0)
  const selected = fixedEngine || engine
  const read = async () => { const own = ++serial.current; try { const reply = await bridge.skills.inventory(selected); if (own === serial.current) { setInventory(reply); setNotice('') } } catch (error) { if (own === serial.current) setNotice((error as Error).message) } }
  const port = useMemo(() => reviewing ? { preview: () => bridge.skills.previewCreate(reviewing), decide: bridge.skills.decideCreate } : undefined, [reviewing])
  return <details className="ob-native-controls" onToggle={event => { if (event.currentTarget.open && !inventory) void read() }}>
    <summary>Installed skill files and skill authoring</summary>
    {!fixedEngine && <label>Engine <select value={engine} onChange={event => { serial.current++; setEngine(event.target.value as typeof engine); setInventory(null); setContent(''); setReviewing(null) }}><option value="claude-code">Claude Code</option><option value="agy">agy</option></select></label>}
    <p>File inspection only. Installed, enabled, loaded, authenticated and successfully used are separate facts. Required programs and account access are not installed or granted by saving a skill.</p>
    <button type="button" onClick={() => void read()}>Refresh installed files</button>
    {inventory && <><ul>{inventory.entries.map(item => <li key={item.id}><strong>{item.name}</strong> · {item.format}<p>{item.description}</p><p>File present; enabled, loaded, authenticated and used: unknown.</p><button type="button" onClick={() => { const own = ++serial.current; void bridge.skills.inspectInstalled(selected, item.id).then(reply => { if (own === serial.current) setContent(reply.content) }).catch(error => { if (own === serial.current) setNotice(error.message) }) }}>Inspect {item.name}</button></li>)}</ul>{inventory.notices.map(line => <p key={line}>{line}</p>)}</>}
    {content && <details open><summary>Full installed manifest</summary><pre className="whitespace-pre-wrap break-words">{content}</pre><CopyText text={content} label="Copy manifest" /></details>}
    <details><summary>Create or revise a skill</summary><p>{selected === 'claude-code' ? 'Writes one skill in your Claude user skill folder.' : 'Writes one skill in the selected working folder’s .agents/skills directory.'} Both use a skill folder with SKILL.md. No setup scripts run. Portability still depends on the tools, packages and accounts the skill requires.</p>
      <label>Skill name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>When to use it<textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Instructions<textarea rows={8} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></label>
      <label>Required tools, platforms or accounts<textarea value={draft.requirements} onChange={e => setDraft({ ...draft, requirements: e.target.value })} /></label>
      <label><input type="checkbox" checked={draft.replaceExisting} onChange={e => setDraft({ ...draft, replaceExisting: e.target.checked })} />Review replacement if this skill already exists</label>
      <button type="button" disabled={isDemo} onClick={() => setReviewing({ ...draft, engine: selected })}>Review skill file</button>
      {isDemo && <p>Native file creation is unavailable in this browser preview.</p>}
      {port && <ChangeReview port={port} label="Review native skill file" />}
    </details>
    {notice && <p role="status">{notice}</p>}
  </details>
}
