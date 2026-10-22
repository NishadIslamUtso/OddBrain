/**
 * The never-check list.
 *
 * Patterns live in two Markdown documents the user can read and edit without
 * this app: "00 System/Privacy & Access.md" and "00 System/Connectors/Source
 * Scope.md". Both are updated together and the previous text is kept, so a
 * mistake here is always recoverable from the vault itself.
 *
 * Matching is host-aware on purpose. "bank.com/*" must cover secure.bank.com
 * and must NOT cover bank.com.evil.org — that look-alike is exactly the spoof
 * these rules exist to stop. The browser extension keeps its own copy of the
 * same rules (extension/lib/blacklist.js) and
 * Keep this implementation and the browser companion implementation aligned.
 */
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from 'yaml'

export const PRIVACY_FILE = '00 System/Privacy & Access.md'
export const SCOPE_FILE = '00 System/Connectors/Source Scope.md'

/** Escape everything regex-special except *, which stays a wildcard. */
const escapePattern = (text: string): string =>
  String(text).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')

/**
 * Does one URL match one pattern?
 *
 * - "https://host/path" matches that exact href
 * - "host/path" or "host/*" matches the host (and its subdomains) plus the path
 * - "host" alone matches the host and any subdomain, at any path
 */
export function excluded(url: string | undefined | null, patterns: string[]): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return patterns.some(pattern => {
    const value = String(pattern ?? '').trim().toLowerCase()
    if (/^https?:\/\//.test(value)) return new RegExp(`^${escapePattern(value)}$`, 'i').test(parsed.href)
    const [host, ...rest] = value.split('/')
    // A subdomain is part of the same site; a look-alike suffix is not, because
    // it would have to end with ".bank.com" or be exactly "bank.com".
    const hostRegex = new RegExp(`^(?:[^.]+\.)*${escapePattern(host)}$`, 'i')
    if (!hostRegex.test(parsed.hostname)) return false
    if (!rest.length) return true
    return new RegExp(`^/${escapePattern(rest.join('/'))}$`, 'i').test(parsed.pathname + parsed.search)
  })
}

/** Every pattern any YAML block or frontmatter in this document declares. */
export function readPatterns(text: string): string[] {
  const documents = [...text.matchAll(/```ya?ml\s*\n([\s\S]*?)```/gi)].map(match => match[1])
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (front) documents.push(front[1])
  const patterns: string[] = []
  for (const source of documents) {
    const data = parseYaml(source) as { excluded_patterns?: unknown } | null
    if (Array.isArray(data?.excluded_patterns)) {
      patterns.push(...data.excluded_patterns.filter((pattern): pattern is string => typeof pattern === 'string'))
    }
  }
  return patterns
}

/**
 * Rewrite the list wherever this document keeps it — every ```yaml block and
 * the frontmatter — leaving every other field exactly as the user wrote it.
 * A document that never mentioned the list gets the section appended, so the
 * setting is discoverable rather than hidden in the app.
 */
export function replacePatterns(text: string, patterns: string[]): string {
  let replaced = false
  let result = text.replace(/```ya?ml\s*\n([\s\S]*?)```/gi, (all, source: string) => {
    const document = parseDocument(source)
    if (!document.has('excluded_patterns')) return all
    document.set('excluded_patterns', patterns)
    replaced = true
    return `\`\`\`yaml\n${document.toString()}\`\`\``
  })
  result = result.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (all, source: string) => {
    const document = parseDocument(source)
    if (!document.has('excluded_patterns')) return all
    document.set('excluded_patterns', patterns)
    replaced = true
    return `---\n${document.toString()}---`
  })
  if (replaced) return result
  const block = stringifyYaml({ excluded_patterns: patterns })
  return `${text.trim()}\n\n## Never-check blacklist (explicit deny)\n\n\`\`\`yaml\n${block}\`\`\`\n`
}
