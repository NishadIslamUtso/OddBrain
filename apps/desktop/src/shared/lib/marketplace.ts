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
