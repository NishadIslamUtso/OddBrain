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
 * agy's remote-MCP field naming changed when Gemini CLI became agy; local
 * (command) servers are identical everywhere. Remote entries are written
 * with `url` for both, and the exact translation is confirmed at the agy
 * Windows check rather than guessed now.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
    for (const line of match[1].split('\n')) {
      const pair = /^(\w[\w-]*):\s*(.*)$/.exec(line.trim())
      if (!pair) continue
      if (pair[1] === 'name') name = pair[2].trim()
      if (pair[1] === 'description') description = pair[2].trim()
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

const frontmatter = (skill: VaultSkill): string =>
  `---\nname: ${cleanName(skill.name)}\ndescription: ${skill.description.replace(/\n/g, ' ').slice(0, 300)}\n---\n\n`

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
      ? { remote: { url: server.url } }
      : { command: server.command, args: server.args ?? [] }
  }
  return `${JSON.stringify({ mcpServers: out }, null, 2)}\n`
}

/** Write the canonical list into both engines' config files in the workspace. */
export function deployMcp(servers: McpServer[], workspace: string): string[] {
  mkdirSync(join(workspace, '.agents'), { recursive: true })
  const claudePath = join(workspace, '.mcp.json')
  const agyPath = join(workspace, '.agents', 'mcp_config.json')
  writeFileSync(claudePath, mcpForClaude(servers), 'utf8')
  writeFileSync(agyPath, mcpForAgy(servers), 'utf8')
  return [claudePath, agyPath]
}
