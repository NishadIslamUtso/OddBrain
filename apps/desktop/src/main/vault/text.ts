/**
 * The vault's text rules: names that are safe to become files, dates in the
 * vault's own timezone, and the Markdown/YAML helpers its documents are written
 * with.
 *
 * All of this is pure — text in, text out — so every rule here is directly
 * testable without a filesystem.
 */
import { createHash } from 'node:crypto'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { InputError } from './errors'

/** A short, stable id for a file name: the first 24 hex characters of a sha256. */
export const digest = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 24)

/**
 * A single path segment the vault is willing to create. Anything with a slash in
 * it, a leading dot, or a traversal is refused rather than cleaned up: a name
 * that had to be rewritten is not the name the caller asked for.
 */
export function safeSegment(value: unknown, label: string): string {
  const segment = String(value ?? '')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,100}$/.test(segment) || segment === '.' || segment === '..') {
    throw new InputError(`Invalid ${label}.`)
  }
  return segment
}

/** A timestamp the vault will write down, or the fallback when none was given. */
export function timestamp(value: unknown, fallback: string): string {
  if (!value) return fallback
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new InputError('Invalid timestamp.')
  }
  return value
}

/**
 * The vault's day boundary is Asia/Dhaka, not the machine's. A journal entry
 * written at 01:00 in Dhaka belongs to that day even when the machine, or the
 * server it runs on, still thinks it is yesterday.
 */
export function dhakaParts(when: Date = new Date()): { year: string; month: string; date: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(when)
      .map(item => [item.type, item.value])
  )
  return { year: parts.year, month: parts.month, date: `${parts.year}-${parts.month}-${parts.day}` }
}

/** Frontmatter plus body: the shape every source file in the vault is written in. */
export const yamlDocument = (metadata: Record<string, unknown>, body: string): string =>
  `---\n${stringifyYaml(metadata)}---\n\n${body}\n`

/** Split a Markdown file into its YAML frontmatter and everything after it. */
export function splitDocument(text: string): { metadata: Record<string, any>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)/)
  if (!match) return { metadata: {}, body: text }
  return { metadata: (parseYaml(match[1]) as Record<string, any>) || {}, body: match[2].trim() }
}

/** The text under one `## heading`, up to the next heading of that level. */
export function section(body: string, heading: string): string {
  return (
    body
      .match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1]
      ?.trim() || ''
  )
}

export type Followup = {
  topic: string
  next_check: string
  last_update: string
  raw: string
}

/**
 * Read the open checkboxes out of the Open Loops document, with the dates people
 * write beside them ("next check 2026-10-12"). Only unchecked items count: a
 * ticked box is a finished thing, not something waiting for you.
 */
export function parseFollowups(markdown: string): Followup[] {
  const items: Followup[] = []
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const match = line.match(/^\s*[-*+]\s*\[( |x|X)\]\s*(.*)$/)
    if (!match || match[1] !== ' ') continue
    const text = match[2]
    items.push({
      topic: text
        .replace(/\[\[|\]\]/g, '')
        .replace(/\s*-\s*next[ _]?check.*$/i, '')
        .replace(/\s*-\s*last[ _]?update.*$/i, '')
        .trim(),
      next_check: text.match(/next[ _]?check\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1] || '',
      last_update: text.match(/last[ _]?update\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1] || '',
      raw: text,
    })
  }
  return items
}
