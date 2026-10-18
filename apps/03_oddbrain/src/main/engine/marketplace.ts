import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveEngineCommand, enginePath } from './enginePath'
import { childEnvironment, killTree } from '../media/process'
import { boundedResponse } from '../media/provider'
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
    return { name: p.name, description: typeof p.description === 'string' ? p.description.slice(0, 800) : '', author: typeof p.author === 'string' ? p.author.slice(0, 100) : typeof p.author?.name === 'string' ? p.author.name.slice(0, 100) : 'Not supplied' }
  })
  return { repo: repository(repo), name: value.name, plugins }
}
export function marketplaceArgs(catalog: Marketplace, action: MarketplaceAction, plugin = ''): string[] {
  repository(catalog.repo)
  if (!SLUG.test(catalog.name)) throw Error('Invalid marketplace name.')
  if (action === 'add') return ['plugin', 'marketplace', 'add', catalog.repo]
  if (!SLUG.test(plugin) || !catalog.plugins.some(p => p.name === plugin)) throw Error('Choose a plugin from the fetched catalog.')
  if (action === 'install') return ['plugin', 'install', plugin, '--marketplace', catalog.repo, '--scope', 'user', '--json']
  if (!['uninstall', 'enable', 'disable', 'update'].includes(action)) throw Error('Unsupported marketplace operation.')
  return ['plugin', action, `${plugin}@${catalog.name}`, '--scope', 'user', ...(action === 'uninstall' ? ['--keep-data'] : []), '--json']
}

export async function runMarketplace(command: string, args: string[], signal: AbortSignal): Promise<string> {
  const path = await enginePath()
  if (signal.aborted) throw Error('Cancelled.')
  // .cmd shims require cmd.exe on Windows. Only validated constant/slug argv
  // reaches this function. Quoted native executable paths use no shell.
  const batch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
  if (batch && /["\r\n%!]/.test(command)) throw Error('Select a native claude.exe rather than this shell-sensitive shim path.')
  const executable = batch ? (process.env.ComSpec || 'cmd.exe') : command
  const argv = batch ? ['/d', '/s', '/c', `""${command}" ${args.map(arg => `"${arg}"`).join(' ')}"`] : args
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv, { windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...childEnvironment(), PATH: path, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } })
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
  const sources = (): string[] => { try { const data = JSON.parse(readFileSync(options.file, 'utf8')); return Array.isArray(data) ? data.filter(v => { try { return !!repository(v) } catch { return false } }).slice(0, 50) : [] } catch { return [] } }
  const cancel = (owner: number): void => { jobs.get(owner)?.abort(); for (const [key, plan] of plans) if (plan.owner === owner) plans.delete(key) }
  const execute = async (owner: number, argv: string[], binary = command()): Promise<string> => {
    if (jobs.size) throw Error('Another marketplace command is running.')
    const controller = new AbortController(); jobs.set(owner, controller)
    try { return await run(binary, argv, controller.signal) } finally { jobs.delete(owner) }
  }
  const checkSource = async (owner: number, source: { name: string; repo: string }, binary: string): Promise<void> => {
    const list: unknown = JSON.parse(await execute(owner, ['plugin', 'marketplace', 'list', '--json'], binary))
    const match = Array.isArray(list) ? list.find(item => item.name === source.name) : undefined
    if (match?.source !== 'github' || match.repo?.toLowerCase() !== source.repo.toLowerCase()) throw Error('The engine’s installed marketplace name does not match this GitHub source. Review its marketplace list; no plugin was changed.')
  }
  return {
    sources, cancel,
    cancelAll: (): void => { for (const owner of new Set([...jobs.keys(), ...[...plans.values()].map(plan => plan.owner)])) cancel(owner) },
    probe: async (owner: number): Promise<string> => {
      const help = await execute(owner, ['plugin', 'install', '--help'])
      if (!help.includes('--marketplace') || !help.includes('--json') || !help.includes('--scope')) throw Error('This installed CLI lacks the verified marketplace install flags. Update Claude Code or use its own terminal; nothing was installed.')
      return 'Installed Claude Code supports plugin install --marketplace, --scope and --json. Catalogs and installs remain explicit.'
    },
    installed: (owner: number): Promise<string> => execute(owner, ['plugin', 'list', '--json']),
    browse: async (repo: string, owner = 0): Promise<Marketplace> => {
      repo = repository(repo)
      if (jobs.size) throw Error('Another marketplace operation is running.')
      const controller = new AbortController(); jobs.set(owner, controller)
      try {
      const response = await (options.fetchImpl || fetch)(`https://api.github.com/repos/${repo}/contents/.claude-plugin/marketplace.json`, { headers: { Accept: 'application/vnd.github.raw+json' }, redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      if (!response.ok) throw Error(`GitHub returned ${response.status}. A public .claude-plugin/marketplace.json is required.`)
      const catalog = readMarketplace(repo, await boundedResponse(response, 2_000_000))
      catalogs.delete(repo); catalogs.set(repo, catalog)
      if (catalogs.size > 50) catalogs.delete(catalogs.keys().next().value!)
      const saved = [...new Set([...sources(), repo])].slice(-50)
      mkdirSync(dirname(options.file), { recursive: true }); writeFileSync(options.file + '.tmp', JSON.stringify(saved)); renameSync(options.file + '.tmp', options.file)
      return catalog
      } finally { jobs.delete(owner) }
    },
    plan: async (owner: number, repo: string, action: MarketplaceAction, plugin?: string): Promise<MarketplacePlan> => {
      const catalog = catalogs.get(repository(repo)); if (!catalog) throw Error('Fetch this catalog first.')
      const binary = command()
      const args = marketplaceArgs(catalog, action, plugin)
      const help = await execute(owner, action === 'add' ? ['plugin', 'marketplace', 'add', '--help'] : ['plugin', action, '--help'], binary)
      const required = action === 'add' ? ['add'] : ['--scope', '--json', ...(action === 'install' ? ['--marketplace'] : action === 'uninstall' ? ['--keep-data'] : [])]
      if (required.some(flag => !help.includes(flag))) throw Error('Installed Claude Code does not expose the required command options. Nothing was changed.')
      const source = action === 'add' || action === 'install' ? undefined : { repo, name: catalog.name }
      if (source) await checkSource(owner, source, binary)
      // Keep one expiring plan per window, bound to the exact displayed binary/argv.
      for (const [key, p] of plans) if (p.owner === owner || p.expires < Date.now()) plans.delete(key)
      const token = randomUUID(); plans.set(token, { owner, expires: Date.now() + 60_000, command: binary, args, source })
      return { token, command: [binary, ...args], explanation: `Claude Code owns this operation in user scope. Source: ${repo}. Catalogs may change before installation. Plugins may include code, hooks and tools; approve only sources you trust. No -y or automatic approval of marketplace-declared commands is passed.` }
    },
    confirm: async (owner: number, token: string): Promise<string> => {
      const plan = plans.get(token)
      if (!plan || plan.owner !== owner) throw Error('This approval does not belong to this window.')
      plans.delete(token)
      if (plan.expires < Date.now() || plan.command !== command()) throw Error('The approval expired or the selected binary changed. Review a new command.')
      if (plan.source) await checkSource(owner, plan.source, plan.command)
      if (plan.command !== command()) throw Error('Selected binary changed. Review a new command.')
      return execute(owner, plan.args, plan.command)
    },
  }
}
