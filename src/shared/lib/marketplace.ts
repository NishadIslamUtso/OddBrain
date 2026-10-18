export type Marketplace = { repo: string; name: string; plugins: { name: string; description: string; author: string }[] }
export type MarketplacePlan = { token: string; command: string[]; explanation: string }
export type MarketResult<T> = { ok: true; value: T } | { ok: false; error: string }
export type MarketplaceAction = 'add' | 'install' | 'uninstall' | 'enable' | 'disable' | 'update'
export type MarketplaceBridge = {
  sources(): Promise<string[]>
  browse(repo: string): Promise<MarketResult<Marketplace>>
  probe(): Promise<MarketResult<string>>
  installed(): Promise<MarketResult<string>>
  plan(repo: string, action: MarketplaceAction, plugin?: string): Promise<MarketResult<MarketplacePlan>>
  confirm(token: string): Promise<MarketResult<string>>
  cancel(): Promise<void>
}

/**
 * Public catalogs that exist, checked against GitHub on 2026-10-18: both
 * answer `/.claude-plugin/marketplace.json` with the shape this app reads.
 * They are offered as starting points, never fetched at launch — choosing one
 * still goes through Browse and the engine's own install commands.
 */
export const KNOWN_MARKETPLACES: ReadonlyArray<{ repo: string; label: string }> = Object.freeze([
  { repo: 'anthropics/claude-code', label: 'Anthropic · Claude Code plugins' },
  { repo: 'anthropics/skills', label: 'Anthropic · Agent skills' },
])
