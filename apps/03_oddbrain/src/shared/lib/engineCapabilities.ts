import { THINKING_MODES, type EngineModelEntry, type EngineSettings, type ThinkingMode } from './engine'

export type EffortReport = {
  target: string
  status: 'reported' | 'unsupported' | 'unverified'
  levels: Exclude<ThinkingMode, 'default'>[]
  note: string
}
export type EngineCapabilityReport = {
  ok: boolean
  models: EngineModelEntry[]
  effort: EffortReport
  version?: string
}

/** Bind a choice to its route, not just a model name. No credentials belong here. */
export function effortTarget(settings: EngineSettings): string {
  return JSON.stringify([settings.id, settings.cloudProvider, settings.model, settings.baseUrl, settings.workspace])
}
export function selectedEffort(settings: EngineSettings): ThinkingMode {
  return (settings.id === 'agy' || settings.cloudProvider === 'native') && settings.model && THINKING_MODES.includes(settings.thinking) && settings.effortTarget === effortTarget(settings) ? settings.thinking : 'default'
}
export function unverifiedCapabilities(settings: EngineSettings, note: string): EngineCapabilityReport {
  return { ok: false, models: [], effort: { target: effortTarget(settings), status: 'unverified', levels: [], note } }
}
