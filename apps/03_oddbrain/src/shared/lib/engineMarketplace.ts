/** Shapes the Store may display from an engine's own plugin catalogue.
 * These are observations from the CLI, not an OddBrain-maintained index. */
export type ClaudeMarketplace = { name: string; source: string; location: string }
export type ClaudePlugin = {
  id: string
  name: string
  marketplace: string
  description: string
  version: string
  author: string
  installed: boolean
  enabled: boolean
  scope: string
}
export type ClaudeMarketplaceListing = {
  ok: boolean
  reason: string
  command: string
  version: string
  marketplaces: ClaudeMarketplace[]
  plugins: ClaudePlugin[]
}
export type ClaudePluginAction = 'add' | 'install' | 'update'
export type ClaudeMarketplacePreview = {
  ok: boolean
  reason: string
  action?: ClaudePluginAction
  value?: string
  command?: string
  source?: string
  /** Author/repo information is supplied by the engine's marketplace, not trusted by OddBrain. */
  warning?: string
}
export type ClaudeMarketplaceResult = {
  ok: boolean
  answer: string
  /** A marketplace-declared shell command requires its OWN separate permission card.
   * The CLI pins the exact command + catalogue by sha256; never use --yes. */
  needsCommand?: { command: string; sha256: string; confirmationLine: string }
}
