import { randomUUID, createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { join } from 'node:path'
import { configBytes, preserveConfig, commitConfigs } from './configTransaction'
import { normalizeMcpServers, readMcpList } from '../../shared/lib/mcp'
import { mcpForClaude, mcpForAgy } from './deploy'
import { unifiedDiff } from '../../shared/lib/changeReview'
import type { McpReview, NativeMcpInventory } from '../../shared/lib/mcpReview'
const decode = (bytes: Buffer | null) => new TextDecoder('utf-8', { fatal: true }).decode(bytes || new Uint8Array())
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
/** Exact multi-file preview; preserves unrelated native fields/servers. Nothing
 * executes here, but an engine may start configured servers when it reloads. */
export function createMcpReview(scope: () => { workspace: string; centralFile: string; authority: string }, now = Date.now) {
  const tickets = new Map<string, { expiresAt: number; authority: string; files: Array<{ path: string; before: Buffer | null; text: string }> }>()
  return {
    preview(raw: unknown): McpReview {
      for (const [key, value] of tickets) if (value.expiresAt <= now()) tickets.delete(key)
      if (tickets.size >= 10) throw Error('Too many pending connector reviews. Deny old reviews or wait for expiry.')
      const normalized = normalizeMcpServers(raw)
      if (normalized.problems.length || !isDeepStrictEqual(raw, normalized.servers)) throw Error(normalized.problems[0] || 'Connector data would be changed by normalization. Nothing was written.')
      const current = scope(), central = configBytes(current.centralFile), old = central ? readMcpList(decode(central)) : { servers: [], problem: '' }
      if (old.problem) throw Error('The saved connector list needs repair. Its original was not replaced.')
      const desiredNames = new Set(normalized.servers.map(server => server.name))
      const markerPath = join(current.workspace, '.agents', '.oddbrain-mcp-owned.json'), markerBytes = configBytes(markerPath)
      const ownership = markerBytes ? JSON.parse(decode(markerBytes)) : {}
      if (!object(ownership)) throw Error('The connector ownership record is invalid. No files changed.')
      const legacyBytes = configBytes(join(current.workspace, '.agents', '.oddbrain-mcp-managed'))
      const legacy = legacyBytes ? JSON.parse(decode(legacyBytes)) : {}
      const nextOwnership: Record<string, Record<string, string>> = {}, preserved: string[] = []
      const files = [
        { path: join(current.workspace, '.mcp.json'), desired: JSON.parse(mcpForClaude(normalized.servers)) },
        { path: join(current.workspace, '.agents', 'mcp_config.json'), desired: JSON.parse(mcpForAgy(normalized.servers)) },
      ].map(({ path, desired }) => {
        const before = configBytes(path), parsed = before ? JSON.parse(decode(before)) : {}
        if (!object(parsed) || (parsed.mcpServers !== undefined && !object(parsed.mcpServers))) throw Error('Native connector configuration has an unsupported shape. No file was changed.')
        const servers = { ...(parsed.mcpServers || {}) }
        const owned = object(ownership[path]) ? ownership[path] : {}
        // Legacy whole-file hashes prove ownership only if the native file is unchanged.
        if (!markerBytes && before && object(legacy) && legacy[path] === hash(before)) for (const [name, value] of Object.entries(servers)) owned[name] = hash(JSON.stringify(value))
        for (const [name, stamp] of Object.entries(owned)) if (!desiredNames.has(name) && Object.hasOwn(servers, name)) {
          if (stamp === hash(JSON.stringify(servers[name]))) delete servers[name]
          else preserved.push(name)
        }
        for (const [name, entry] of Object.entries(desired.mcpServers)) {
          const existing = object(servers[name]) ? { ...servers[name] } : {}
          for (const field of ['command', 'args', 'type', 'url', 'serverUrl']) delete existing[field]
          servers[name] = { ...existing, ...(entry as object) }
        }
        nextOwnership[path] = Object.fromEntries([...desiredNames].map(name => [name, hash(JSON.stringify(servers[name]))]))
        return { path, before, text: JSON.stringify({ ...parsed, mcpServers: servers }, null, 2) + '\n' }
      })
      files.push({ path: current.centralFile, before: central, text: JSON.stringify({ servers: normalized.servers }) }, { path: markerPath, before: markerBytes, text: JSON.stringify(nextOwnership) })
      const changes = files.map(file => ({ path: file.path, diff: unifiedDiff(decode(file.before), file.text, file.path) }))
      const token = randomUUID(), expiresAt = now() + 120_000
      tickets.set(token, { expiresAt, authority: current.authority, files })
      return { token, expiresAt, changes, explanation: 'This changes the shared list and both workspace config files. Unrelated native servers and fields are preserved; exact changes are below. A native engine can start configured programs or network connections when it reloads, even before a tool call. Native tool approvals are not a sandbox for server startup. Backups are kept. Installed, enabled, loaded, authenticated and successfully used remain separate facts.' + (preserved.length ? ` Entries edited outside the app were preserved: ${preserved.join(', ')}. Remove them in the native manager if that is your intention.` : '') }
    },
    decide(token: string, decision: 'allow' | 'deny'): { ok: boolean; answer: string } {
      const ticket = tickets.get(token); tickets.delete(token)
      if (!ticket || ticket.expiresAt <= now()) return { ok: false, answer: 'Connector review expired or was already used. Review again.' }
      if (decision === 'deny') return { ok: true, answer: 'Denied. No connector files changed.' }
      try {
        if (decision !== 'allow' || scope().authority !== ticket.authority) throw Error('Engine, folder or permissions changed. No connector files changed; review again.')
        for (const file of ticket.files) {
          const current = configBytes(file.path)
          if ((current === null) !== (file.before === null) || (current && file.before && !current.equals(file.before))) throw Error('A configuration changed after preview. No newer file was replaced.')
        }
        for (const file of ticket.files) if (file.before) preserveConfig(file.path, file.before)
        commitConfigs(ticket.files.map(({ path, text, before }) => ({ path, text, expected: before })))
        return { ok: true, answer: 'Reviewed connector files saved with backups. No startup, authentication or successful tool use has been verified. Native engines may apply these files when they reload.' }
      } catch (error) { return { ok: false, answer: (error as Error).message } }
    },
  }
}
/** Read only named config files. Return no command arguments, env values, auth
 * headers, account identifiers or tokens. No native MCP process is launched. */
export function inspectNativeMcp(files: Array<{ path: string; scope: string }>): NativeMcpInventory {
  const result: NativeMcpInventory = { files: [], notices: [] }
  for (const file of files) {
    try {
      const bytes = configBytes(file.path)
      if (!bytes) { result.notices.push(`${file.scope}: no configuration file at ${file.path}.`); continue }
      const config = JSON.parse(decode(bytes))
      if (!object(config) || (config.mcpServers !== undefined && !object(config.mcpServers))) throw Error('Unsupported configuration shape.')
      const scopes = [{ scope: file.scope, servers: config.mcpServers || {} }]
      if (object(config.projects)) for (const [project, value] of Object.entries(config.projects)) {
        if (object(value) && value.mcpServers !== undefined) {
          if (!object(value.mcpServers)) throw Error('Unsupported project-local server configuration.')
          scopes.push({ scope: `${file.scope} · project-local declaration: ${project}`, servers: value.mcpServers })
        }
      }
      if (scopes.reduce((n, scope) => n + Object.keys(scope.servers).length, 0) > 500) throw Error('Native inventory exceeds 500 entries.')
      for (const scope of scopes) {
        const entries = Object.entries(scope.servers)
        result.files.push({ path: file.path, scope: scope.scope, entries: entries.map(([name, raw]) => {
          if (!object(raw)) throw Error('Invalid server entry.')
          const address = raw.url || raw.serverUrl; let endpoint = ''
          if (typeof address === 'string') { try { const url = new URL(address); endpoint = `${url.protocol}//${url.host}` } catch { endpoint = 'Unrecognized URL; not contacted' } }
          return { name, endpoint, transport: typeof raw.command === 'string' ? 'local program (arguments hidden)' : address ? 'configured endpoint' : 'unknown', credentialFields: !!raw.env || !!raw.headers || !!raw.authorization,
            ...(typeof raw.disabled === 'boolean' ? { disabledFlag: raw.disabled } : {}) }
        }) })
      }
    } catch { result.notices.push(`${file.scope}: unreadable, linked or unsupported JSON at ${file.path}. Comments/JSONC are not rewritten or repaired by this inspector.`) }
  }
  result.notices.push('Config declarations only, not an inventory of plugin-provided or server-side tools. Project-local declarations may not apply to the current working folder. Enabled, loaded, authenticated and used states are unverified. OAuth/token files are not read. Use the native manager for its own sign-in flow; the app never asks for those credentials.')
  return result
}
