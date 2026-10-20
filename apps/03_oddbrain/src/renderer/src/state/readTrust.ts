import type { EnginePermission } from './engine'
import type { EngineSettings } from '@shared/lib/engine'

const KEY = 'oddbrain:read-trust:v1'
export type ReadTrustRule = { id: string; engine: string; workspace: string; tool: 'Read'; scope: string; summary: string; createdAt: string }

const read = (): ReadTrustRule[] => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is ReadTrustRule => !!item && typeof item === 'object' &&
      typeof (item as ReadTrustRule).id === 'string' && typeof (item as ReadTrustRule).engine === 'string' &&
      typeof (item as ReadTrustRule).workspace === 'string' && (item as ReadTrustRule).tool === 'Read' &&
      typeof (item as ReadTrustRule).scope === 'string' && (item as ReadTrustRule).scope.length > 0 && (item as ReadTrustRule).scope.length <= 32_000 &&
      typeof (item as ReadTrustRule).summary === 'string' && (item as ReadTrustRule).summary.length > 0 && (item as ReadTrustRule).summary.length <= 500 &&
      typeof (item as ReadTrustRule).createdAt === 'string').slice(0, 100)
  } catch { return [] }
}
const write = (rules: ReadTrustRule[]): void => localStorage.setItem(KEY, JSON.stringify(rules.slice(-100)))
const identity = (settings: EngineSettings, permission: EnginePermission): string =>
  JSON.stringify([settings.id, settings.workspace, permission.tool, permission.file])

export const readTrustRules = (): ReadTrustRule[] => read()
/** Only a complete Read file path is stable enough to remember. Truncated summaries, commands and patterns never qualify. */
export const mayRememberRead = (permission: EnginePermission): boolean => permission.tool === 'Read' && !!permission.file && !permission.risk
export const matchingReadTrust = (settings: EngineSettings, permission: EnginePermission): ReadTrustRule | undefined =>
  mayRememberRead(permission) ? read().find(rule => rule.id === identity(settings, permission)) : undefined
export const rememberReadTrust = (settings: EngineSettings, permission: EnginePermission): ReadTrustRule | null => {
  if (!mayRememberRead(permission)) return null
  const rule: ReadTrustRule = { id: identity(settings, permission), engine: settings.id, workspace: settings.workspace, tool: 'Read', scope: permission.file!, summary: permission.summary, createdAt: new Date().toISOString() }
  write([...read().filter(item => item.id !== rule.id), rule])
  window.dispatchEvent(new Event('oddbrain:read-trust'))
  return rule
}
export const revokeReadTrust = (id: string): void => {
  write(read().filter(rule => rule.id !== id))
  window.dispatchEvent(new Event('oddbrain:read-trust'))
}
