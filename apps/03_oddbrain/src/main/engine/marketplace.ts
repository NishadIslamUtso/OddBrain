import { packageSource } from '../../shared/lib/packageInspection'
import { inspectPackage } from './packageInspection'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readRecoverableJson, writeRecoverableJson } from '../recoverableJson'
import { resolveEngineCommand, enginePath } from './enginePath'
import { childEnvironment, killTree } from '../media/process'
import { boundedResponse } from '../network/boundedResponse'
import type { Marketplace, MarketplaceAction, MarketplacePlan } from '../../shared/lib/marketplace'

const SLUG = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/
export function repository(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(value) || value.endsWith('.git')) throw Error('Enter a GitHub owner/repository, without a URL, branch or command flags.')
  return value
}
export function readMarketplace(repo: string, raw: string): Marketplace {
  const value = JSON.parse(raw)
  if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !SLUG.test(value.name) || !Array.isArray(value.plugins) || value.plugins.length > 1000) throw Error('This is not a supported Claude Code marketplace index.')
  const names = new Set<string>()
  const plugins = value.plugins.map((p: any) => {
    if (!p || typeof p.name !== 'string' || !SLUG.test(p.name) || names.has(p.name)) throw Error('Marketplace has an invalid or duplicate plugin name.')
    names.add(p.name)
    return { name: p.name, description: typeof p.description === 'string' ? p.description.slice(0, 800) : '', ...(packageSource(repo, p.source) ? { inspectSource: packageSource(repo, p.source) } : {}), author: typeof p.author === 'string' ? p.author.slice(0, 100) : typeof p.author?.name === 'string' ? p.author.name.slice(0, 100) : 'Not supplied' }
  })
  return { repo: repository(repo), name: value.name, plugins }
}
export function marketplaceArgs(catalog: Marketplace, action: MarketplaceAction, plugin = ''): string[] {
  repository(catalog.repo)
  if (!SLUG.test(catalog.name)) throw Error('Invalid marketplace name.')
  if (action === 'add') return ['plugin', 'marketplace', 'add', catalog.repo]
  if (!SLUG.test(plugin) || !catalog.plugins.some(p => p.name === plugin)) throw Error('Choose a plugin from the fetched catalog.')
  if (action === 'install') return ['plugin', 'install', `${plugin}@${catalog.name}`, '--scope', 'user', '--json']
  if (!['uninstall', 'enable', 'disable', 'update'].includes(action)) throw Error('Unsupported marketplace operation.')
  return ['plugin', action, `${plugin}@${catalog.name}`, '--scope', 'user', ...(action === 'uninstall' ? ['--keep-data'] : []), '--json']
}

export async function runMarketplace(command: string, args: string[], signal: AbortSignal): Promise<string> {
  const path = await enginePath()
  if (signal.aborted) throw Error('Cancelled.')
  // Marketplace mutation never crosses a command shell. Windows batch shims
  // are refused; engine discovery must select the native executable instead.
  if (/\.(cmd|bat)$/i.test(command)) throw Error('Marketplace changes require the native engine executable, not a command-script shim.')
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...childEnvironment(), PATH: path, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } })
    let output = '', error = '', problem = ''
    const kill = (why: string): void => { problem = why; killTree(child) }
    const abort = (): void => kill('Cancelled. Check the engine’s installed list before retrying; cancelling cannot undo an installation already completed.')
    const timer = setTimeout(() => kill('The engine command timed out. Check installed plugins before retrying.'), 120_000)
    signal.addEventListener('abort', abort, { once: true })
    const clear = (): void => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    child.stdout.on('data', data => { output += data.toString(); if (output.length > 1_000_000) kill('Engine output exceeded the size limit.') })
    child.stderr.on('data', data => { error = (error + data.toString()).slice(-8000) })
    child.on('error', e => { clear(); reject(e) })
    child.on('close', code => { clear(); if (problem || code !== 0) reject(Error(problem || `${output.slice(-8000)}\n${error}`.trim() || `Engine exited ${code}.`)); else resolve(output.trim() || error.trim() || 'The engine completed the command.') })
  })
}
export function createMarketplaceService(options: { file: string; fetchImpl?: typeof fetch; run?: typeof runMarketplace; command?: () => string }) {
  const catalogs = new Map<string, Marketplace>()
  const plans = new Map<string, { owner: number; expires: number; command: string; args: string[]; source?: { repo: string; name: string } }>()
  const jobs = new Map<number, AbortController>()
  const command = options.command || (() => resolveEngineCommand('claude-code'))
  const run = options.run || runMarketplace
  const sources = (): string[] => readRecoverableJson(options.file, value => {
    if (!Array.isArray(value) || value.length > 50) throw Error('Saved marketplaces are damaged or exceed 50 entries. Nothing was omitted.')
    return value.map(repository)
  }, []).value
  const cancel = (owner: number): void => { jobs.get(owner)?.abort(); for (const [key, plan] of plans) if (plan.owner === owner) plans.delete(key) }
  // Hold one operation lease across every await, not just each child command.
  // Otherwise cancel during a source check can be followed by a fresh mutation.
  const operation = async <T>(owner: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (jobs.size) throw Error('Another marketplace operation is running.')
    const controller = new AbortController(); jobs.set(owner, controller)
    try {
      const value = await work(controller.signal)
      controller.signal.throwIfAborted()
      return value
    } finally { jobs.delete(owner) }
  }
  const execute = async (argv: string[], binary: string, signal: AbortSignal): Promise<string> => {
    signal.throwIfAborted()
    const result = await run(binary, argv, signal)
    signal.throwIfAborted()
    return result
  }
  const checkSource = async (source: { name: string; repo: string }, binary: string, signal: AbortSignal): Promise<void> => {
    const list: unknown = JSON.parse(await execute(['plugin', 'marketplace', 'list', '--json'], binary, signal))
    const match = Array.isArray(list) ? list.find(item => item.name === source.name) : undefined
    if (match?.source !== 'github' || match.repo?.toLowerCase() !== source.repo.toLowerCase()) throw Error('The engine’s installed marketplace name does not match this GitHub source. Review its marketplace list; no plugin was changed.')
  }
  return {
    sources, cancel,
    cancelAll: (): void => { for (const owner of new Set([...jobs.keys(), ...[...plans.values()].map(plan => plan.owner)])) cancel(owner) },
    inspect: (owner: number, repo: string, plugin: string) => operation(owner, signal => {
      const source = catalogs.get(repository(repo))?.plugins.find(p => p.name === plugin)?.inspectSource
      if (!source) throw Error('Browse first and choose a package with a supported public GitHub source. No package code was run.')
      return inspectPackage(source, signal, options.fetchImpl || fetch)
    }),
    probe: (owner: number): Promise<string> => operation(owner, async signal => {
      const help = await execute(['plugin', 'install', '--help'], command(), signal)
      if (!help.includes('--json') || !help.includes('--scope')) throw Error('This installed CLI lacks the verified marketplace install flags. Update Claude Code or use its own terminal; nothing was installed.')
      return 'Installed Claude Code supports plugin install with --scope and --json. Catalogs and installs remain explicit.'
    }),
    installed: (owner: number): Promise<string> => operation(owner, signal => execute(['plugin', 'list', '--json'], command(), signal)),
    browse: (repo: string, owner = 0): Promise<Marketplace> => operation(owner, async signal => {
      repo = repository(repo)
      const response = await (options.fetchImpl || fetch)(`https://api.github.com/repos/${repo}/contents/.claude-plugin/marketplace.json`, { headers: { Accept: 'application/vnd.github.raw+json' }, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) })
      if (!response.ok) throw Error(`GitHub returned ${response.status}. A public .claude-plugin/marketplace.json is required.`)
      const catalog = readMarketplace(repo, await boundedResponse(response, 2_000_000))
      signal.throwIfAborted()
      catalogs.delete(repo); catalogs.set(repo, catalog)
      if (catalogs.size > 50) catalogs.delete(catalogs.keys().next().value!)
      const before = sources()
      if (!before.includes(repo) && before.length >= 50) throw Error('Fifty marketplace sources are retained. Remove one before saving another; nothing was evicted.')
      const saved = [...new Set([...before, repo])]
      writeRecoverableJson(options.file, saved)
      return catalog
    }),
    plan: (owner: number, repo: string, action: MarketplaceAction, plugin?: string): Promise<MarketplacePlan> => operation(owner, async signal => {
      for (const [key, plan] of plans) if (plan.owner === owner) plans.delete(key)
      const catalog = catalogs.get(repository(repo)); if (!catalog) throw Error('Fetch this catalog first.')
      const binary = command()
      const args = marketplaceArgs(catalog, action, plugin)
      const help = await execute(action === 'add' ? ['plugin', 'marketplace', 'add', '--help'] : ['plugin', action, '--help'], binary, signal)
      const required = action === 'add' ? ['add'] : ['--scope', '--json', ...(action === 'uninstall' ? ['--keep-data'] : [])]
      if (required.some(flag => !help.includes(flag))) throw Error('Installed Claude Code does not expose the required command options. Nothing was changed.')
      const source = action === 'add' ? undefined : { repo, name: catalog.name }
      if (source) await checkSource(source, binary, signal)
      // Keep one expiring plan per window, bound to the exact displayed binary/argv.
      for (const [key, p] of plans) if (p.owner === owner || p.expires < Date.now()) plans.delete(key)
      const token = randomUUID(); plans.set(token, { owner, expires: Date.now() + 60_000, command: binary, args, source })
      return { token, command: [binary, ...args], explanation: `Claude Code owns this operation in user scope. Source: ${repo}. Catalogs may change before installation. Plugins may include code, hooks and tools; approve only sources you trust. No -y or automatic approval of marketplace-declared commands is passed.` }
    }),
    confirm: (owner: number, token: string): Promise<string> => operation(owner, async signal => {
      const plan = plans.get(token)
      if (!plan || plan.owner !== owner) throw Error('This approval does not belong to this window.')
      plans.delete(token)
      if (plan.expires < Date.now() || plan.command !== command()) throw Error('The approval expired or the selected binary changed. Review a new command.')
      if (plan.source) await checkSource(plan.source, plan.command, signal)
      if (plan.command !== command()) throw Error('Selected binary changed. Review a new command.')
      return execute(plan.args, plan.command, signal)
    }),
  }
}
