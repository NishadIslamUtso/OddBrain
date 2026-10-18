import { boundedResponse } from '../network/boundedResponse'
import type { EngineSettings } from '../../shared/lib/engine'
import { isRemoteModel } from '../../shared/lib/ollama'
/** Decide before sending task text. Model-list requests contain no prompt.
 * Existing CLI/provider transports still do the work after this gate. */
export async function inferenceAllowed(engine: EngineSettings, local: boolean, cloud: boolean, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; answer?: string }> {
  if (local && cloud) return { ok: true }
  if (!local && !cloud) return { ok: false, answer: 'Local and cloud inference are both off in Agent access. Nothing was sent.' }
  // With no named model, Claude uses its own login, never the Ollama endpoint.
  if (engine.id === 'claude-code' && !engine.model) return cloud ? { ok: true } : { ok: false, answer: 'The engine default uses its own external service. Enable cloud inference, or select a verified local model. Nothing was sent.' }
  if (engine.id === 'agy' || engine.cloudProvider === 'anthropic') return cloud ? { ok: true } : { ok: false, answer: 'Cloud inference is off in Agent access. This engine/model runs externally; nothing was sent.' }
  let remote = isRemoteModel(engine.model)
  try {
    const url = new URL(engine.baseUrl || 'http://localhost:11434')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error()
    if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) remote = true
    if (!remote) {
      const response = await fetchImpl(url.href.replace(/\/$/, '') + '/api/tags', { signal: AbortSignal.timeout(5000), redirect: 'error' })
      if (!response.ok) throw Error()
      const text = await boundedResponse(response)
      const data = JSON.parse(text), model = (Array.isArray(data.models) ? data.models : []).find((m: {name?:string;model?:string}) => m.name === engine.model || m.model === engine.model)
      if (!model) throw Error()
      remote = isRemoteModel(engine.model, model)
    }
  } catch { return { ok: false, answer: 'The app could not verify where this model runs. Refresh models or enable the intended inference access; no task text was sent.' } }
  return remote ? cloud ? { ok: true } : { ok: false, answer: 'Cloud/external inference is off in Agent access. Local transport does not make this a local model; nothing was sent.' }
    : local ? { ok: true } : { ok: false, answer: 'Local inference is off in Agent access. Nothing was sent.' }
}
