import { useState } from 'react'
import { resetSamples, sampleEnabled, setSampleMode } from '@shared/lib/sampleWorkspace'
export default function SampleWorkspaceControls() {
  const [pending, setPending] = useState<'reset' | 'switch' | null>(null), [error, setError] = useState('')
  const enabled = sampleEnabled()
  if (typeof window === 'undefined' || window.api) return null
  const apply = () => {
    try {
      if (pending === 'reset') resetSamples()
      else setSampleMode(!enabled)
      window.location.reload()
    } catch { setError('Browser storage is unavailable. The workspace was not switched.') }
  }
  return <div className="ob-sample-controls">
    <p>{enabled ? 'Sample workspace: example chats, projects, artifacts and vault notes. Engine runs and extension captures are simulated; no model, website or disk is accessed.' : 'Empty preview: no sample records. Load the sample workspace to explore the populated screens.'}</p>
    <div className="ob-inline-actions"><button type="button" onClick={() => setPending('switch')}>{enabled ? 'Use empty preview' : 'Load sample workspace'}</button>{enabled && <button type="button" onClick={() => setPending('reset')}>Reset sample data</button>}</div>
    {pending && <div role="group" aria-label="Confirm sample workspace change"><p>{pending === 'reset' ? 'Reset only sample chats, files and edits?' : 'Switch preview workspace?'} This reloads the preview. Pending attachments are not kept. Appearance settings and non-sample work stay untouched.</p><div className="ob-inline-actions"><button type="button" onClick={apply}>Confirm</button><button type="button" onClick={() => setPending(null)}>Cancel</button></div></div>}
    {error && <p role="status">{error}</p>}
  </div>
}
