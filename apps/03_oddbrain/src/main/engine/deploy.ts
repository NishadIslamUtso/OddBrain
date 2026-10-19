import { createHash } from 'node:crypto'
import { configBytes, preserveConfig, commitConfigs, noLinkedPath } from './configTransaction'
import { normalizeMcpServers, readMcpList } from '../../shared/lib/mcp'
/**
 * deploy.ts — one vault, every engine.
 *
 * The owner's skills and MCP servers are kept once, in the app. Each engine
 * receives them through its own official channel and format, written into
 * the places the engines already read:
 *
 *   skills   Claude Code → ~/.claude/skills/<name>/SKILL.md (frontmatter)
 *            agy          → <workspace>/.agents/skills/<name>.md (the file
 *                           name becomes its slash command)
 *   mcp      both         → <workspace>/.mcp.json and
 *                           <workspace>/.agents/mcp_config.json
 *
 * Direction of truth is one way: app → engine folders. A change in the app
 * re-deploys everywhere; a hand-edit in an engine folder is that engine's
 * private copy until the next deploy.
 *
 * Remote transport is engine-specific: Claude uses type/http + url; agy
 * uses serverUrl (Antigravity MCP configuration documentation). Local command
 * servers share the same format. Configuration is not an authentication or
 * connection-health check.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/** A skill as the app's vault keeps it: three fields, all plain. */
export type VaultSkill = { name: string; description: string; body: string }

/** A skill as it was found in an engine folder. */
export type FoundSkill = VaultSkill & { source: string }

const cleanName = (name: string): string =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)

/** Pull `name`/`description` out of a markdown frontmatter block, if any. */
export function parseSkillMd(text: string): { name: string; description: string; body: string } {
  const normalized = String(text || '').replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  let name = ''
  let description = ''
  let body = normalized
  if (match) {
    // Skill frontmatter is YAML, not a hand-written `key: value` dialect.
    // Current Anthropic skills use quoted, very long descriptions; slicing the
    // source line used to leave an unmatched quote and made the installed skill
    // invalid. Parse the actual format, then bound the plain values.
    try {
      const header = parseYaml(match[1]) as Record<string, unknown> | null
      if (header && typeof header === 'object') {
        if (typeof header.name === 'string') name = header.name
        if (typeof header.description === 'string') description = header.description
      }
    } catch {
      // Invalid frontmatter remains invalid below: no title/name means the
      // install path refuses it instead of trying to repair untrusted syntax.
    }
    body = normalized.slice(match[0].length)
  }
  const title = /^#\s+(.+)$/m.exec(body.trim())
  return {
    name: cleanName(name || title?.[1] || ''),
    description: description.slice(0, 300),
    body: body.trim(),
  }
}

const frontmatter = (skill: VaultSkill): string => {
  const description = skill.description.replace(/\s+/g, ' ').trim().slice(0, 300)
  // A JSON string is also a valid YAML double-quoted scalar. Quote after
  // truncating so quotes, colons and a cut in the middle of an upstream value
  // can never create malformed frontmatter.
  return `---\nname: ${cleanName(skill.name)}\ndescription: ${JSON.stringify(description)}\n---\n\n`
}

/** The exact bytes each engine expects for one skill. */
export function toClaudeSkill(skill: VaultSkill): { relative: string; content: string } {
  const name = cleanName(skill.name)
  return { relative: join(name, 'SKILL.md'), content: `${frontmatter(skill)}${skill.body}\n` }
}

export function toAgySkill(skill: VaultSkill): { relative: string; content: string } {
  const name = cleanName(skill.name)
  // agy: the file name IS the slash command, so the file lands flat.
  return { relative: `${name}.md`, content: `${frontmatter(skill)}${skill.body}\n` }
}

/** Write one skill into both engines' own folders. Returns where it landed. */
export function deploySkill(
  skill: VaultSkill,
  targets: { claudeSkillsDir: string; agySkillsDir: string },
): string[] {
  const written: string[] = []
  const claude = toClaudeSkill(skill)
  const claudePath = join(targets.claudeSkillsDir, claude.relative)
  mkdirSync(dirname(claudePath), { recursive: true })
  writeFileSync(claudePath, claude.content, 'utf8')
  written.push(claudePath)

  const agy = toAgySkill(skill)
  const agyPath = join(targets.agySkillsDir, agy.relative)
  mkdirSync(targets.agySkillsDir, { recursive: true })
  writeFileSync(agyPath, agy.content, 'utf8')
  written.push(agyPath)
  return written
}

/** The skills an engine already has — what "import into the vault" finds. */
export function scanClaudeSkills(claudeSkillsDir: string): FoundSkill[] {
  const found: FoundSkill[] = []
  let entries: string[] = []
  try {
    entries = readdirSync(claudeSkillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return found
  }
  for (const dir of entries) {
    const file = join(claudeSkillsDir, dir, 'SKILL.md')
    try {
      const parsed = parseSkillMd(readFileSync(file, 'utf8'))
      found.push({
        name: parsed.name || cleanName(dir),
        description: parsed.description,
        body: parsed.body,
        source: file,
      })
    } catch {
      // A skill folder without a readable SKILL.md is skipped, never fatal.
    }
  }
  return found
}

/** One MCP server, engine-blind. Local servers run a command; remote ones have a URL. */
export type McpServer = { name: string; command?: string; args?: string[]; url?: string }

const safeServer = (server: McpServer): McpServer | null => {
  const name = cleanName(server.name)
  if (!name) return null
  if (typeof server.command === 'string' && server.command.trim()) {
    return {
      name,
      command: server.command.trim(),
      args: Array.isArray(server.args) ? server.args.map(String).slice(0, 32) : [],
    }
  }
  if (typeof server.url === 'string' && /^https?:\/\//.test(server.url)) {
    return { name, url: server.url }
  }
  return null
}

/** The canonical list as both engine formats express it. */
export function mcpForClaude(servers: McpServer[]): string {
  const out: Record<string, unknown> = {}
  for (const server of servers.map(safeServer)) {
    if (!server) continue
    out[server.name] = server.url ? { type: 'http', url: server.url } : { command: server.command, args: server.args ?? [] }
  }
  return `${JSON.stringify({ mcpServers: out }, null, 2)}\n`
}

export function mcpForAgy(servers: McpServer[]): string {
  const out: Record<string, unknown> = {}
  for (const server of servers.map(safeServer)) {
    if (!server) continue
    out[server.name] = server.url
      ? { serverUrl: server.url }
      : { command: server.command, args: server.args ?? [] }
  }
  return `${JSON.stringify({ mcpServers: out }, null, 2)}\n`
}

/** Backups are verified before any managed file changes. Later outside edits
 * are detected against the last written hashes and receive their own backup. */
export function deployMcp(servers: McpServer[], workspace: string, centralFile?: string): { written: string[]; kept: string[] } {
  const normalized = normalizeMcpServers(servers)
  if (normalized.problems.length) throw Error(normalized.problems.join(' '))
  noLinkedPath(workspace)
  const marker = join(workspace, '.agents', '.oddbrain-mcp-managed')
  let managed: Record<string, string> = {}
  try {
    const parsed: unknown = JSON.parse(configBytes(marker)?.toString('utf8') || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) managed = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)))
  } catch { /* An old marker proves no ownership; preserve the files. */ }
  const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
  const entries = [{ path: join(workspace, '.mcp.json'), text: mcpForClaude(normalized.servers) }, { path: join(workspace, '.agents', 'mcp_config.json'), text: mcpForAgy(normalized.servers) }]
  const kept: string[] = []
  for (const entry of entries) {
    const previous = configBytes(entry.path)
    if (previous && hash(previous) !== managed[entry.path]) kept.push(preserveConfig(entry.path, previous))
  }
  if (centralFile) {
    const previous = configBytes(centralFile)
    if (previous && readMcpList(previous.toString('utf8')).problem) kept.push(preserveConfig(centralFile, previous))
    entries.push({ path: centralFile, text: JSON.stringify({ servers: normalized.servers }) })
  }
  const written = entries.slice(0, 2).map(entry => entry.path)
  entries.push({ path: marker, text: JSON.stringify(Object.fromEntries(entries.slice(0, 2).map(entry => [entry.path, hash(entry.text)]))) })
  commitConfigs(entries)
  return { written, kept }
}
