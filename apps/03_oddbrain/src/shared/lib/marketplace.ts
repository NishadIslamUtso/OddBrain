export type StoreEngine = 'claude-code' | 'agy'
export const AGY_MARKETPLACE = 'antigravity-plugins-official'
export const AGY_MARKETPLACE_URL = 'https://www.gstatic.com/antigravity/plugins/marketplace.json'

export type Marketplace = { repo: string; name: string; plugins: { name: string; description: string; author: string }[]; notice?: string }
export type MarketplacePlan = { token: string; command: string[]; explanation: string }
export type MarketResult<T> = { ok: true; value: T } | { ok: false; error: string }
export type MarketplaceAction = 'add' | 'install' | 'uninstall' | 'enable' | 'disable' | 'update'
export type MarketplaceBridge = {
  sources(engine?: StoreEngine): Promise<string[]>
  browse(repo: string, engine?: StoreEngine): Promise<MarketResult<Marketplace>>
  probe(engine?: StoreEngine): Promise<MarketResult<string>>
  installed(engine?: StoreEngine): Promise<MarketResult<string>>
  plan(repo: string, action: MarketplaceAction, plugin?: string, engine?: StoreEngine): Promise<MarketResult<MarketplacePlan>>
  confirm(token: string, engine?: StoreEngine): Promise<MarketResult<string>>
  cancel(engine?: StoreEngine): Promise<void>
}

/**
 * Public catalogs checked against GitHub on 2026-10-18/19: all
 * answer `/.claude-plugin/marketplace.json` with the shape this app reads.
 * They are offered as starting points, never fetched at launch — choosing one
 * still goes through Browse and the engine's own install commands.
 */
export const KNOWN_MARKETPLACES: ReadonlyArray<{ repo: string; label: string }> = Object.freeze([
  { repo: 'anthropics/claude-plugins-official', label: 'Anthropic · Official marketplace' },
  { repo: 'anthropics/claude-code', label: 'Anthropic · Claude Code plugins' },
  { repo: 'anthropics/skills', label: 'Anthropic · Agent skills' },
])

export type InstalledPluginSummary = { name: string; source: string; enabled?: boolean; version: string; skills: string[]; connectors: string[] }
/** Display only; authority stays with the backend's fresh CLI read-back. A
 * changed CLI shape falls back to its raw report instead of invented status. */
export function installedPluginSummaries(raw: string): InstalledPluginSummary[] {
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || value.length > 1000) return []
    const names = (v: unknown): string[] => Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string').slice(0, 200).map(n => n.slice(0, 200)) : []
    return value.flatMap(p => {
      if (!p || typeof p !== 'object') return []
      const id = typeof p.id === 'string' ? p.id.split('@') : []
      const name = typeof p.name === 'string' ? p.name : id[0]
      if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(name)) return []
      return [{ name, source: typeof p.source === 'string' ? p.source.slice(0, 200) : id[1] || '', enabled: typeof p.enabled === 'boolean' ? p.enabled : undefined, version: typeof p.version === 'string' ? p.version.slice(0, 100) : '', skills: names(p.skills), connectors: names(p.mcpServers) }]
    })
  } catch { return [] }
}
