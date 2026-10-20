import { useMemo, useState } from 'react'
import { bridge } from '../platform/bridge'
import ChangeReview from './ChangeReview'
export default function NativeRuleReview({ projectId }: { projectId?: string }) {
  const [engine, setEngine] = useState<'claude-code' | 'agy'>('claude-code')
  const port = useMemo(() => ({ preview: () => projectId ? bridge.houseRules.previewProject(projectId, engine) : bridge.houseRules.previewGlobal(engine), decide: bridge.houseRules.decide }), [engine, projectId])
  return <details className="ob-native-controls"><summary>{projectId ? 'Review native project rules' : 'Review native global rules'}</summary>
    <p>{projectId ? 'Optional: write the saved project instruction and goals into a marked block in its native rule file. Chat context already sends these without changing files. Use Work here first.' : 'Saving app instructions does not change native global files. Separately review a marked block here if you also want these rules outside OddBrain. Existing surrounding text is preserved.'} This does not grant tool permissions, authenticate a service or prove that an engine loaded the file.</p>
    <label>Engine rule file <select value={engine} onChange={event => setEngine(event.target.value as typeof engine)}><option value="claude-code">Claude Code · CLAUDE.md</option><option value="agy">agy · GEMINI.md</option></select></label>
    <ChangeReview port={port} label={projectId ? 'Project rule file review' : 'Global rule file review'} />
  </details>
}
