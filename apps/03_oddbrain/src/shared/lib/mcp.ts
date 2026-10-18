/**
 * MCP servers, as the app keeps them and as a person types them.
 *
 * One list, deployed to every engine's own config (main does the writing).
 * Validation lives here so the window and the main process agree before a
 * command travels: a server is either a local program (command + args) or a
 * remote endpoint (http/https URL), never both, never neither.
 *
 * This is not a sandbox. A stdio entry is a program an engine will start, so
 * the screen says that plainly and the person adds only what they trust.
 */
export type McpServerEntry = { name: string; command?: string; args?: string[]; url?: string }

const NAME = /^[a-z0-9][a-z0-9_-]{0,59}$/

export function mcpServerProblem(server: Partial<McpServerEntry>): string {
  const name = typeof server.name === 'string' ? server.name.trim() : ''
  // Lowercase and no dots on purpose: the deploy step normalises names, and a
  // name that changes on the way to an engine would be a lie in the list.
  if (!name) return 'Give the server a name.'
  if (!NAME.test(name)) return 'Server names are lowercase letters, digits, dashes and underscores, and start with a letter or digit.'
  const command = typeof server.command === 'string' ? server.command.trim() : ''
  const url = typeof server.url === 'string' ? server.url.trim() : ''
  if (command && url) return 'Choose one transport: a command or a URL, not both.'
  if (!command && !url) return 'Add a command for a local server, or a URL for a remote one.'
  if (command) {
    if (command.length > 512) return 'That command is too long.'
    if (/[\u0000\r\n]/.test(command)) return 'A command cannot contain a line break.'
    for (const arg of server.args ?? []) {
      if (typeof arg !== 'string' || arg.length > 500 || /[\u0000\r\n]/.test(arg)) return 'Arguments are plain text, up to 500 characters each.'
    }
    return ''
  }
  let parsed: URL
  try { parsed = new URL(url) } catch { return 'That URL is not a URL.' }
  if (url.length > 2048) return 'That URL is too long.'
  if (parsed.protocol === 'https:') return ''
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname)
  if (parsed.protocol === 'http:' && loopback) return ''
  return 'Remote servers use https, or http only on this machine (localhost / 127.0.0.1).'
}

/** A stored entry, cleaned; null when it cannot be used as-is. */
export function normalizeMcpServer(raw: unknown): McpServerEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const entry: McpServerEntry = {
    name: typeof record.name === 'string' ? record.name.trim() : '',
    ...(typeof record.command === 'string' && record.command.trim() ? { command: record.command.trim() } : {}),
    ...(Array.isArray(record.args) ? { args: record.args.filter((arg): arg is string => typeof arg === 'string') } : {}),
    ...(typeof record.url === 'string' && record.url.trim() ? { url: record.url.trim() } : {}),
  }
  return mcpServerProblem(entry) ? null : entry
}

/**
 * Split an arguments line the way a person expects: spaces separate, single or
 * double quotes group, and a backslash escapes the next character. A JSON array
 * is accepted too, because that is how the same list is written on disk.
 */
export function parseMcpArgs(text: string): { ok: boolean; args: string[]; problem: string } {
  const source = String(text ?? '').trim()
  if (!source) return { ok: true, args: [], problem: '' }
  if (source.startsWith('[')) {
    try {
      const value = JSON.parse(source)
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return { ok: false, args: [], problem: 'Use a JSON array of strings, or plain words separated by spaces.' }
      return { ok: true, args: value, problem: '' }
    } catch { return { ok: false, args: [], problem: 'That looks like JSON but does not parse; fix it or write plain words separated by spaces.' } }
  }
  const args: string[] = []
  let current = ''
  let quote = ''
  let escaped = false
  for (const character of source) {
    if (escaped) { current += character; escaped = false; continue }
    if (character === '\\') { escaped = true; continue }
    if (quote) {
      if (character === quote) quote = ''
      else current += character
      continue
    }
    if (character === '"' || character === "'") { quote = character; continue }
    if (/\s/.test(character)) {
      if (current) { args.push(current); current = '' }
      continue
    }
    current += character
  }
  if (escaped) current += '\\'
  if (quote) return { ok: false, args: [], problem: 'That arguments line has an unclosed quote.' }
  if (current) args.push(current)
  return { ok: true, args, problem: '' }
}

/** The whole list, with every problem named; the caller decides what to do. */
export function normalizeMcpServers(raw: unknown): { servers: McpServerEntry[]; problems: string[] } {
  if (!Array.isArray(raw)) return { servers: [], problems: ['The server list is not a list.'] }
  const servers: McpServerEntry[] = []
  const problems: string[] = []
  const seen = new Set<string>()
  for (const item of raw.slice(0, 100)) {
    const entry = normalizeMcpServer(item)
    if (!entry) { problems.push('One entry is not a usable server.'); continue }
    if (seen.has(entry.name)) { problems.push(`Two servers are named ${entry.name}.`); continue }
    seen.add(entry.name)
    servers.push(entry)
  }
  return { servers, problems }
}

/** One line for the list, so the person knows what will start. */
export function describeMcpServer(server: McpServerEntry): string {
  if (server.url) return `${server.url}`
  return [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
}

/**
 * Read the list back from its file.
 *
 * Three outcomes, and they are not the same: a usable list, an empty one, and
 * a file this app cannot read. The third must never look like the second — an
 * empty screen beside a Save button is how a hand-edited list disappears.
 */
export function readMcpList(raw: string): { servers: McpServerEntry[]; problem: string } {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch {
    return { servers: [], problem: 'The saved tool-server list could not be read. Saving again keeps a copy of it first.' }
  }
  const record = parsed && typeof parsed === 'object' ? parsed as { servers?: unknown } : {}
  const normalized = normalizeMcpServers(record.servers)
  return {
    servers: normalized.servers,
    problem: normalized.problems.length ? `The saved list has entries this app cannot use: ${normalized.problems[0]}` : '',
  }
}
