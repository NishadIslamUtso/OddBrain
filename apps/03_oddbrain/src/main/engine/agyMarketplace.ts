import { packageSource } from '../../shared/lib/packageInspection'
import { inspectPackage } from './packageInspection'
import { randomUUID } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { AGY_MARKETPLACE, AGY_MARKETPLACE_URL, type Marketplace, type MarketplaceAction, type MarketplacePlan } from '../../shared/lib/marketplace'
import { boundedResponse } from '../network/boundedResponse'
import { noLinkedPath } from './configTransaction'
import { resolveEngineCommand } from './enginePath'
import { runMarketplace } from './marketplace'

const SLUG = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/
const LIMIT = 2_000_000
// Endpoint/cache discovery: Silas-02/antigravity-desktop-cn's marketplace
// sync script. Command contract: google-antigravity/antigravity-cli CHANGELOG
// (1.3.2 install, 1.3.4 list --json), plus the marketplace docs mirror at
// doggy8088/antigravity.google. Installed CLI help is checked before mutation.
// Never run commands, source URLs or archive contents supplied by a catalog.
export function readAgyMarketplace(raw: string): Marketplace {
  const value = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !Array.isArray(value.plugins) || value.plugins.length > 1000 || (value.name !== undefined && value.name !== AGY_MARKETPLACE)) throw Error('The official agy catalog has an unsupported format.')
  const names = new Set<string>()
  const plugins = value.plugins.map((p: any) => {
    if (!p || typeof p.name !== 'string' || !SLUG.test(p.name) || names.has(p.name.toLowerCase())) throw Error('The agy catalog has an invalid or duplicate plugin name.')
    names.add(p.name.toLowerCase())
    return { name: p.name, description: typeof p.description === 'string' ? p.description.slice(0, 800) : '', ...(packageSource('', p.source) ? { inspectSource: packageSource('', p.source) } : {}), author: typeof p.author === 'string' ? p.author.slice(0, 100) : typeof p.author?.name === 'string' ? p.author.name.slice(0, 100) : 'Not supplied' }
  })
  return { repo: AGY_MARKETPLACE, name: AGY_MARKETPLACE, plugins, notice: `Source: ${AGY_MARKETPLACE_URL}. The engine resolves the package at install time; browsing does not pin its version.` }
}
export type AgyInstalledPlugin = { name: string; source: string; enabled: boolean; version?: string; skills?: string[]; mcpServers?: string[] }
export function readAgyInstalled(raw: string): AgyInstalledPlugin[] {
  const value = JSON.parse(raw)
  const names = new Set<string>()
  if (!Array.isArray(value) || value.length > 1000) throw Error('agy did not return a supported installed-plugin list.')
  for (const p of value) {
    if (!p || typeof p.name !== 'string' || !SLUG.test(p.name) || typeof p.enabled !== 'boolean' || typeof p.source !== 'string' || names.has(p.name.toLowerCase())) throw Error('agy returned an invalid or ambiguous installed-plugin record.')
    names.add(p.name.toLowerCase())
  }
  return value
}
export function agyMarketplaceArgs(action: MarketplaceAction, name: string): string[] {
  if (!SLUG.test(name)) throw Error('Invalid plugin name.')
  if (action === 'install') return ['plugin', 'install', `${name}@${AGY_MARKETPLACE}`]
  if (action === 'uninstall' || action === 'enable' || action === 'disable') return ['plugin', action, name]
  throw Error('agy does not expose this verified marketplace operation. Use install to reinstall a package; no Claude flags are borrowed.')
}
export function createAgyMarketplaceService(options: { cacheFile?: string; fetchImpl?: typeof fetch; command?: () => string; run?: typeof runMarketplace } = {}) {
  let catalog: Marketplace | undefined
  const command = options.command || (() => resolveEngineCommand('agy'))
  const run = options.run || runMarketplace
  const jobs = new Map<number, AbortController>()
  const plans = new Map<string, { owner: number; expires: number; binary: string; args: string[]; action: MarketplaceAction; name: string }>()
  const cancel = (owner: number): void => { jobs.get(owner)?.abort(); for (const [token, plan] of plans) if (plan.owner === owner) plans.delete(token) }
  const operation = async <T>(owner: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (jobs.size) throw Error('Another agy marketplace operation is running.')
    const controller = new AbortController(); jobs.set(owner, controller)
    try { const result = await work(controller.signal); controller.signal.throwIfAborted(); return result } finally { jobs.delete(owner) }
  }
  const execute = async (binary: string, args: string[], signal: AbortSignal): Promise<string> => {
    signal.throwIfAborted(); const result = await run(binary, args, signal); signal.throwIfAborted(); return result
  }
  const installed = async (binary: string, signal: AbortSignal): Promise<AgyInstalledPlugin[]> => readAgyInstalled(await execute(binary, ['plugin', 'list', '--json'], signal))
  const checkTarget = async (binary: string, name: string, action: MarketplaceAction, signal: AbortSignal): Promise<void> => {
    const entry = (await installed(binary, signal)).find(p => p.name.toLowerCase() === name.toLowerCase())
    if (entry && entry.source !== AGY_MARKETPLACE) throw Error('A plugin with that name belongs to another source. Nothing was changed.')
    if (!entry && action !== 'install') throw Error('That official-marketplace plugin is not installed. Refresh the installed list.')
  }
  const checkHelp = async (binary: string, action: string, signal: AbortSignal): Promise<void> => {
    const help = await execute(binary, ['plugin', action, '--help'], signal)
    if (!new RegExp(`\\bplugin\\s+${action}\\b`, 'i').test(help) || (action === 'list' && !help.includes('--json'))) throw Error('The installed agy CLI lacks the required plugin command. Update agy or use its own terminal; nothing was changed.')
  }
  return {
    sources: (): string[] => [AGY_MARKETPLACE], cancel,
    cancelAll: (): void => { for (const owner of new Set([...jobs.keys(), ...[...plans.values()].map(p => p.owner)])) cancel(owner) },
    inspect: (owner: number, repo: string, plugin: string) => operation(owner, signal => {
      const source = repo === AGY_MARKETPLACE ? catalog?.plugins.find(p => p.name === plugin)?.inspectSource : undefined
      if (!source) throw Error('This agy listing does not expose a supported public GitHub package source. Review the package in agy; no source was guessed.')
      return inspectPackage(source, signal, options.fetchImpl || fetch)
    }),
    probe: (owner: number): Promise<string> => operation(owner, async signal => {
      const binary = command(); await checkHelp(binary, 'install', signal); await checkHelp(binary, 'list', signal)
      return 'Installed agy exposes plugin install and list --json. Each change still needs your review. Authentication and required plugin settings remain with agy.'
    }),
    installed: (owner: number): Promise<string> => operation(owner, async signal => JSON.stringify(await installed(command(), signal), null, 2)),
    browse: (source: string, owner = 0): Promise<Marketplace> => operation(owner, async signal => {
      if (source !== AGY_MARKETPLACE) throw Error('Only agy’s official marketplace is supported by this adapter.')
      catalog = undefined
      try {
        const response = await (options.fetchImpl || fetch)(AGY_MARKETPLACE_URL, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) })
        if (!response.ok) throw Error(`The official agy catalog returned ${response.status}.`)
        const next = readAgyMarketplace(await boundedResponse(response, LIMIT))
        signal.throwIfAborted(); catalog = next; return next
      } catch (error) {
        signal.throwIfAborted()
        // The engine's cache is a read-only, explicitly labelled fallback, never
        // an invented or shipped catalog. Do not follow linked paths.
        if (options.cacheFile) {
          try {
            noLinkedPath(options.cacheFile)
            const stat = lstatSync(options.cacheFile)
            if (!stat.isFile() || stat.size > LIMIT) throw Error('Unsupported cache.')
            const next = readAgyMarketplace(readFileSync(options.cacheFile, 'utf8'))
            next.notice = `Offline copy from agy’s cache, last written ${stat.mtime.toISOString()}. The online catalog could not be read. Install resolves today’s package, which may differ from this listing.`
            signal.throwIfAborted(); catalog = next; return next
          } catch { signal.throwIfAborted() }
        }
        throw Error(`Could not read agy’s official catalog: ${(error as Error).message}. Open /plugin in agy to populate its cache, or retry when connected.`)
      }
    }),
    plan: (owner: number, source: string, action: MarketplaceAction, name = ''): Promise<MarketplacePlan> => operation(owner, async signal => {
      for (const [token, plan] of plans) if (plan.owner === owner || plan.expires < Date.now()) plans.delete(token)
      if (source !== AGY_MARKETPLACE) throw Error('Unknown agy marketplace.')
      const args = agyMarketplaceArgs(action, name)
      if (action === 'install' && !catalog?.plugins.some(p => p.name === name)) throw Error('Browse the official catalog and choose a plugin first.')
      const binary = command(); await checkHelp(binary, action, signal); await checkTarget(binary, name, action, signal)
      const token = randomUUID(); plans.set(token, { owner, expires: Date.now() + 60_000, binary, args, action, name })
      return { token, command: [binary, ...args], explanation: `agy owns this operation in its user profile, not Claude Code or OddBrain’s shared configuration. Source: ${AGY_MARKETPLACE}. A package can include skills, MCP servers, hooks, rules and agents. Installing can execute third-party code. ${action === 'uninstall' ? 'Uninstall removes this package; agy controls what data is retained. ' : ''}No automatic confirmation is supplied. If settings, sign-in or an interactive confirmation are needed, finish in agy’s /plugin manager.` }
    }),
    confirm: (owner: number, token: string): Promise<string> => operation(owner, async signal => {
      const plan = plans.get(token)
      if (!plan || plan.owner !== owner) throw Error('This approval does not belong to this window.')
      plans.delete(token)
      if (plan.expires < Date.now() || plan.binary !== command()) throw Error('The approval expired or the selected binary changed. Review a new command.')
      await checkTarget(plan.binary, plan.name, plan.action, signal)
      if (plan.binary !== command()) throw Error('Selected binary changed. Review a new command.')
      const output = await execute(plan.binary, plan.args, signal)
      let list: AgyInstalledPlugin[]
      try { list = await installed(plan.binary, signal) } catch { throw Error('The agy command ran, but installed-state read-back failed. Read installed plugins before retrying; do not assume the change was undone.') }
      const entry = list.find(p => p.name.toLowerCase() === plan.name.toLowerCase())
      const matches = plan.action === 'uninstall' ? !entry : entry?.source === AGY_MARKETPLACE && (plan.action === 'install' || entry.enabled === (plan.action === 'enable'))
      if (!matches) throw Error('agy finished the command, but its installed list does not confirm the requested change. Review /plugin in agy before retrying.')
      return `${output}\n\nRead back from agy: ${plan.name} ${entry ? `is installed and ${entry.enabled ? 'enabled' : 'disabled'}` : 'is not installed'}. Installed does not mean its connectors are signed in or configured.`
    }),
  }
}
