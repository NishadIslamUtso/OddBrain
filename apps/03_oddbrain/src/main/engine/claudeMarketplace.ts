import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { detectEngine } from './availability'
import { enginePathSync } from './enginePath'
import type {
  ClaudeMarketplace, ClaudeMarketplaceListing, ClaudeMarketplacePreview, ClaudeMarketplaceResult,
  ClaudePlugin, ClaudePluginAction,
} from '../../shared/lib/engineMarketplace'

/** OddBrain never reads a remote catalogue or assembles plugin folders. Claude
 * Code owns all marketplace state, listing, installs and updates. These are its
 * v2.1.302 --json commands, verified against the real CLI with a local fixture.
 * On a different/older binary we refuse instead of guessing its protocol. */
export type CliOutput = { code: number; stdout: string; stderr: string }
export type CliRunner = (binary: string, args: string[], timeoutMs: number, cwd: string) => Promise<CliOutput>

const MAX_OUTPUT = 1024 * 1024
const TIMEOUT_READ = 20_000
const TIMEOUT_WRITE = 120_000
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,79}@[a-z0-9][a-z0-9._-]{0,79}$/i
const SAFE_SOURCE = /^(?:https:\/\/github\.com\/)?[a-z0-9][a-z0-9._-]{0,79}\/[a-z0-9][a-z0-9._-]{0,79}(?:\.git)?\/?$/i
const SHA256 = /^[a-f0-9]{64}$/i

/** An installed .cmd shim needs a shell on Windows; its arguments are restricted
 * to fixed flags, repo names, plugin ids and digests. An .exe uses execFile
 * directly so no shell interprets either a path or a marketplace value. */
export const runClaudePlugin: CliRunner = async (binary, args, timeoutMs, cwd) => new Promise(resolve => {
  const needsShell = process.platform === 'win32' && (binary === 'claude' || /\.(cmd|bat)$/i.test(binary))
  const executable = needsShell && binary !== 'claude' ? `"${binary}"` : binary
  execFile(executable, args, {
    cwd, shell: needsShell, windowsHide: true, timeout: timeoutMs, maxBuffer: MAX_OUTPUT,
    env: { ...process.env, PATH: enginePathSync(), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
  }, (error, stdout, stderr) => resolve({
    code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
    stdout: typeof stdout === 'string' ? stdout : '', stderr: typeof stderr === 'string' ? stderr : '',
  }))
})

function jsonReply(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.length > MAX_OUTPUT) throw new Error('Claude Code returned too much marketplace data.')
  try { return JSON.parse(trimmed) }
  catch {
    // CLI --json promises one result line, but may print a human warning first.
    for (const line of trimmed.split(/\r?\n/).reverse()) {
      if (!/^[{[]/.test(line.trim())) continue
      try { return JSON.parse(line) }
      catch { /* read the next candidate */ }
    }
    throw new Error('Claude Code did not return a readable marketplace answer.')
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function label(value: unknown, limit = 200): string { return typeof value === 'string' ? value.trim().slice(0, limit) : '' }
function failure(out: CliOutput): string {
  try {
    const result = record(jsonReply(out.stdout))
    return label(result?.message || result?.error, 300) || 'Claude Code refused this operation.'
  } catch { return label(out.stderr || out.stdout, 300) || 'The Claude Code CLI did not answer.' }
}
function tooMany(raw: unknown, maximum: number): raw is unknown[] {
  if (!Array.isArray(raw)) throw new Error('Claude Code returned an unexpected marketplace list.')
  if (raw.length > maximum) throw new Error(`Claude Code listed more than ${maximum} entries. None were silently hidden.`)
  return true
}
function marketplaceAuthors(marketplace: ClaudeMarketplace): Map<string, { author: string; description: string }> {
  const info = new Map<string, { author: string; description: string }>()
  // This is the index in the directory CLAUDE reports as its own installed
  // marketplace, not a separately fetched catalogue. No symlink is followed
  // during installs here; Claude owns that operation, not the app.
  if (!marketplace.location) return info
  try {
    const path = join(marketplace.location, '.claude-plugin', 'marketplace.json')
    if (!existsSync(path) || statSync(path).size > 256 * 1024) return info
    const data = record(JSON.parse(readFileSync(path, 'utf8')))
    if (!data || !Array.isArray(data.plugins) || data.plugins.length > 500) return info
    for (const item of data.plugins) {
      const entry = record(item), name = label(entry?.name, 80)
      if (!name) continue
      const author = record(entry?.author)
      info.set(name, { author: label(author?.name || entry?.author, 100), description: label(entry?.description, 280) })
    }
  } catch { /* A marketplace can be remote, missing or changed since listing. */ }
  return info
}

function isNewEnough(version: string): boolean {
  const match = version.match(/(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:\s|$)/)
  if (!match) return false
  const [major, minor, patch] = match.slice(1).map(Number)
  return major > 2 || major === 2 && (minor > 1 || minor === 1 && patch >= 300)
}

/** The exact command for the card, including the resolved binary. Values here
 * pass strict regex gates; the app never quotes a free-form command as data. */
function commandLine(binary: string, args: string[]): string {
  const shownBinary = /[\s&|<>^()]/.test(binary) ? `"${binary}"` : binary
  return [shownBinary, ...args].join(' ')
}
function commandArgs(action: ClaudePluginAction, value: string, sha?: string): string[] {
  const subcommand = action === 'add' ? ['marketplace', 'add', value] : [action, value]
  return ['plugin', ...subcommand, '--scope', 'user', '--json', ...(sha ? ['--accept-command', sha] : [])]
}

type Context = { binary: string; version: string }

/** All calls run in the app-data folder so a source listed for the user's
 * WORKING project is not silently installed into a different project. */
export function createClaudeMarketplace(options: {
  cwd: string
  detect?: () => Promise<{ found: boolean; version?: string; path?: string }>
  run?: CliRunner
}) {
  const runner = options.run || runClaudePlugin
  const context = async (): Promise<Context> => {
    const state = await (options.detect || (() => detectEngine('claude-code', true)))()
    if (!state.found || !state.path) throw new Error('Claude Code is not installed or cannot be launched. Install or point to it in Connectors first.')
    if (!isNewEnough(state.version || '')) throw new Error(`This Claude Code (${state.version || 'unknown version'}) has no verified plugin marketplace protocol. Upgrade to 2.1.300 or newer.`)
    return { binary: state.path, version: state.version || '' }
  }
  const runRead = async (ctx: Context, args: string[]): Promise<unknown> => {
    const out = await runner(ctx.binary, args, TIMEOUT_READ, options.cwd)
    if (out.code !== 0) throw new Error(failure(out))
    return jsonReply(out.stdout)
  }
  const catalogue = async (ctx: Context): Promise<ClaudeMarketplaceListing> => {
    const rawMarketplaces = await runRead(ctx, ['plugin', 'marketplace', 'list', '--json'])
    const rawPlugins = await runRead(ctx, ['plugin', 'list', '--available', '--json'])
    if (!tooMany(rawMarketplaces, 64)) throw new Error('No marketplace list.')
    const pluginsResult = record(rawPlugins)
    if (!pluginsResult || !tooMany(pluginsResult.available, 500) || !tooMany(pluginsResult.installed, 500)) {
      throw new Error('The Claude Code plugin listing has an unrecognized shape.')
    }
    const marketplaces = rawMarketplaces.map(raw => {
      const item = record(raw)
      return { name: label(item?.name, 80), source: label(item?.source, 80), location: label(item?.installLocation || item?.path, 500) }
    }) as ClaudeMarketplace[]
    if (marketplaces.some(item => !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(item.name)) ||
        new Set(marketplaces.map(item => item.name)).size !== marketplaces.length) {
      throw new Error('Claude Code returned marketplace names this Store cannot label safely. No sources were hidden.')
    }
    const authors = new Map(marketplaces.map(marketplace => [marketplace.name, marketplaceAuthors(marketplace)]))
    const mapPlugin = (raw: unknown, installed: boolean): ClaudePlugin | null => {
      const item = record(raw)
      const id = label(installed ? item?.id : item?.pluginId, 180)
      if (!SAFE_ID.test(id)) return null
      const [name, marketplace] = id.split('@')
      const info = authors.get(marketplace)?.get(name)
      return {
        id, name, marketplace,
        description: label(item?.description || info?.description, 280),
        version: label(item?.version, 60),
        author: info?.author || '', installed,
        enabled: installed ? item?.enabled === true : false,
        scope: installed ? label(item?.scope, 40) : '',
      }
    }
    const plugins = [
      ...(pluginsResult.available as unknown[]).map(item => mapPlugin(item, false)),
      ...(pluginsResult.installed as unknown[]).map(item => mapPlugin(item, true)),
    ].filter((item): item is ClaudePlugin => item !== null)
    // A malformed or oversized entry is not a partial success masquerading as
    // a complete catalogue; the owner can still use the engine's own CLI.
    if (plugins.length !== (pluginsResult.available as unknown[]).length + (pluginsResult.installed as unknown[]).length) {
      throw new Error('Claude Code returned plugin IDs the Store cannot validate; no entries were hidden.')
    }
    if (plugins.some(plugin => !plugin.installed && !marketplaces.some(source => source.name === plugin.marketplace))) {
      throw new Error('Claude Code listed an available plugin without its marketplace. Browse in the CLI; no source was guessed.')
    }
    return { ok: true, reason: '', command: ctx.binary, version: ctx.version, marketplaces, plugins }
  }
  const invalid: ClaudeMarketplacePreview = { ok: false, reason: 'Use a GitHub owner/repo or a plugin@marketplace id without spaces or shell characters.' }
  const preview = async (action: ClaudePluginAction, value: string): Promise<ClaudeMarketplacePreview> => {
    if (!['add', 'install', 'update'].includes(action) || typeof value !== 'string' ||
        !(action === 'add' ? SAFE_SOURCE : SAFE_ID).test(value)) return invalid
    try {
      const ctx = await context()
      let source = value
      if (action !== 'add') {
        const state = await catalogue(ctx)
        const plugin = state.plugins.find(item => item.id === value && item.installed === (action === 'update'))
        if (!plugin || !state.marketplaces.some(marketplace => marketplace.name === plugin.marketplace)) {
          return { ok: false, reason: 'This plugin’s Claude Code marketplace is no longer listed. Browse or restore its source in the CLI before installing.' }
        }
        if (action === 'update' && plugin.scope !== 'user') {
          return { ok: false, reason: 'This plugin is not installed at user scope. Update it from its own project or through the Claude Code CLI.' }
        }
        source = plugin.marketplace
      }
      return {
        ok: true, reason: '', action, value, source,
        command: commandLine(ctx.binary, commandArgs(action, value)),
        warning: action === 'add'
          ? 'Claude Code will fetch and register this repository as a marketplace. Its contents are not audited by OddBrain.'
          : 'Plugins can supply hooks, commands and MCP servers that run as your Windows user. Review this source before approving. No other engine or provider is changed.',
      }
    } catch (error) { return { ok: false, reason: (error as Error).message } }
  }
  const execute = async (action: ClaudePluginAction, value: string, expectedCommand: string, sha256 = ''): Promise<ClaudeMarketplaceResult> => {
    if (sha256 && (action === 'add' || !SHA256.test(sha256))) return { ok: false, answer: 'That marketplace command digest is invalid. Nothing was run.' }
    const card = await preview(action, value)
    if (!card.ok) return { ok: false, answer: card.reason }
    const args = commandArgs(action, value, sha256 || undefined)
    try {
      const ctx = await context()
      if (expectedCommand !== commandLine(ctx.binary, args)) return { ok: false, answer: 'The CLI command changed after the permission card was shown. Browse and review it again; nothing was run.' }
      const out = await runner(ctx.binary, args, TIMEOUT_WRITE, options.cwd)
      let result: Record<string, unknown> | null = null
      try { result = record(jsonReply(out.stdout)) } catch { /* present CLI error below */ }
      if (out.code === 0 && result?.outcome === 'ok') return { ok: true, answer: label(result.message, 400) || 'Claude Code completed the request.' }
      const shown = record(result?.shownCommand)
      const command = label(shown?.command, 1000)
      const digest = label(shown?.sha256, 64)
      if (!sha256 && action !== 'add' && command && SHA256.test(digest) && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(command)) {
        return { ok: false, answer: 'Claude Code needs approval for a marketplace-declared command before continuing. Nothing was run.',
          needsCommand: { command, sha256: digest, confirmationLine: commandLine(ctx.binary, commandArgs(action, value, digest)) } }
      }
      return { ok: false, answer: `${failure(out)}${sha256 ? ' The approved command may have changed; no retry was attempted.' : ''}` }
    } catch (error) { return { ok: false, answer: `Claude Code did not finish: ${(error as Error).message}. No other installer was used.` } }
  }
  return {
    list: async (): Promise<ClaudeMarketplaceListing> => {
      try { return await catalogue(await context()) }
      catch (error) { return { ok: false, reason: (error as Error).message, command: '', version: '', marketplaces: [], plugins: [] } }
    },
    preview,
    execute,
  }
}
