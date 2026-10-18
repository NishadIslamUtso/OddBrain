import type { EngineSettings } from '../../shared/lib/engine'
import { getCapabilities, isRemoteModel } from '../../shared/lib/ollama'
import { mediaModelSupported } from '../../shared/lib/media'
import { parseCloudModel } from '../../shared/lib/providers'

export type VisionCheck = { supported: boolean; reason: string }

/** Check the ACTUAL selected engine and model before pictures leave the window.
 * Claude Code has an image wire; agy's has not been verified. An Ollama model
 * must declare vision in /api/show. The engine's own unnamed choice cannot be
 * certified by a model name the app does not know. */
export async function selectedEngineVision(
  settings: EngineSettings,
  options: { anthropicAllowed: boolean; fetchImpl?: typeof fetch }
): Promise<VisionCheck> {
  if (settings.id !== 'claude-code') return { supported: false, reason: 'agy has no verified picture wire yet.' }
  if (!settings.model) return { supported: false, reason: 'The engine’s own model choice has no verified picture capability.' }
  if (settings.cloudProvider === 'anthropic') {
    const selected = parseCloudModel(settings.model)
    if (!options.anthropicAllowed || selected?.provider.id !== 'anthropic' ||
        !mediaModelSupported('anthropic', 'image', selected.model)) {
      return { supported: false, reason: 'The selected Anthropic model is unavailable or has no verified picture capability.' }
    }
    return { supported: true, reason: '' }
  }
  if (parseCloudModel(settings.model) || settings.model.endsWith(':cloud')) {
    return { supported: false, reason: 'A remote Ollama entry is not an approved vision provider.' }
  }
  try {
    const response = await (options.fetchImpl || fetch)(`${settings.baseUrl.replace(/\/+$/, '')}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: settings.model }),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`model metadata returned ${response.status}`)
    const metadata = await response.json() as { capabilities?: string[]; remote_model?: string }
    if (isRemoteModel(settings.model, metadata)) return { supported: false, reason: 'The Ollama model uses a remote brain, not verified local vision.' }
    if (!getCapabilities(metadata).vision) return { supported: false, reason: 'The selected Ollama model does not report vision support.' }
    return { supported: true, reason: '' }
  } catch (error) {
    return { supported: false, reason: `Could not verify the selected model’s vision support: ${(error as Error).message}.` }
  }
}
