import { boundedResponse } from '../network/boundedResponse'
import { isRemoteModel } from '../../shared/lib/ollama'
import type { EngineModelEntry } from '../../shared/lib/engine'

/** Independent sources: one unavailable service must not hide another's models. */
export async function discoverClaudeModels(input: {
  baseUrl: string
  nativeModels?: () => Promise<EngineModelEntry[]>
  fetchImpl?: typeof fetch
  providerModels?: () => Promise<Array<{ name: string }>>
}): Promise<{ ok: boolean; models: EngineModelEntry[]; error?: string }> {
  const local = async (): Promise<EngineModelEntry[]> => {
    const response = await (input.fetchImpl ?? fetch)(`${input.baseUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(4000), redirect: 'error' })
    if (!response.ok) throw Error(`Ollama answered ${response.status}.`)
    const data = JSON.parse(await boundedResponse(response)) as { models?: Array<{ name?: unknown; size?: unknown; remote_model?: string; remote_host?: string }> }
    if (!Array.isArray(data.models)) throw Error('Ollama returned an unsupported model list.')
    return data.models.filter(m => m && typeof m.name === 'string' && m.name.trim()).map(m => {
      const name = m.name as string
      const cloud = isRemoteModel(name, m)
      return { name, cloud, sizeGB: !cloud && typeof m.size === 'number' && Number.isFinite(m.size) && m.size >= 0 ? Math.round(m.size / 1e9 * 10) / 10 : null }
    })
  }
  const remote = async (): Promise<EngineModelEntry[]> => {
    if (!input.providerModels) return []
    const rows = await input.providerModels()
    return rows.filter(m => m && typeof m.name === 'string' && m.name.trim()).slice(0, 50)
      .map(m => ({ name: m.name, cloud: true, sizeGB: null, provider: 'anthropic' as const }))
  }
  const [native, ollama, anthropic] = await Promise.allSettled([input.nativeModels?.() ?? Promise.resolve([]), local(), remote()])
  const models: EngineModelEntry[] = []
  for (const result of [native, ollama, anthropic]) if (result.status === 'fulfilled') {
    for (const row of result.value) if (!models.some(m => m.name === row.name && m.provider === row.provider)) models.push(row)
  }
  const errors: string[] = []
  if (native.status === 'rejected') errors.push('Native Claude models unavailable. Check the CLI installation and refresh.')
  if (ollama.status === 'rejected') errors.push('Ollama models unavailable. Start Ollama or check its address.')
  if (anthropic.status === 'rejected') errors.push('Anthropic models unavailable. Check provider access, credentials and connectivity.')
  const ok = Boolean(input.nativeModels && native.status === 'fulfilled') || ollama.status === 'fulfilled' || Boolean(input.providerModels && anthropic.status === 'fulfilled')
  return { ok, models, ...(errors.length ? { error: errors.join(' ') } : {}) }
}
