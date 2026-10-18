/**
 * houseRulesDeploy.ts — the rulebook, delivered where engines actually read.
 *
 * The engines read global instructions from their own user files: Claude Code
 * reads ~/.claude/CLAUDE.md; agy reads ~/.gemini/GEMINI.md. Those files may
 * hold the owner's own words too, so the app never owns the whole file — only
 * a marker-bounded block inside it. Deploying replaces that block (and only
 * that block); everything around it is the owner's, untouched.
 *
 * The block is compiled from the canonical rulebook (shared/lib/houseRules)
 * plus the current brain's footnote, so every engine and every brain hears
 * the same house rules, in the file it already obeys.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_HOUSE_RULES, instructionBlock, type HouseRules } from '../../shared/lib/houseRules'
import type { EngineId } from '../../shared/lib/engine'

export const BLOCK_START = '<!-- oddbrain:house-rules:start -->'
export const BLOCK_END = '<!-- oddbrain:house-rules:end -->'

/** The full block as it lands in a file: markers, rules, brain footnote. */
export function houseRulesBlock(engineId: EngineId, model: string, rules?: Partial<HouseRules>, memoryFolder = ''): string {
  return `${BLOCK_START}\n${instructionBlock(engineId, model, mergedRules(rules), memoryFolder)}\n${BLOCK_END}`
}

/** The rules with any blank field filled from the defaults — never an empty rule. */
function mergedRules(rules?: Partial<HouseRules>): HouseRules {
  const pick = (value: string | undefined, fallback: string): string => (value && value.trim() ? value : fallback)
  return {
    identity: pick(rules?.identity, DEFAULT_HOUSE_RULES.identity),
    artifacts: pick(rules?.artifacts, DEFAULT_HOUSE_RULES.artifacts),
    permissions: pick(rules?.permissions, DEFAULT_HOUSE_RULES.permissions),
    memory: pick(rules?.memory, DEFAULT_HOUSE_RULES.memory),
    style: pick(rules?.style, DEFAULT_HOUSE_RULES.style),
  }
}

/** Insert or replace the marked block inside an existing file's text. */
export function upsertBlock(existing: string, block: string): string {
  const text = String(existing || '')
  const start = text.indexOf(BLOCK_START)
  const end = text.indexOf(BLOCK_END)
  if (start !== -1 && end !== -1 && end > start) {
    const before = text.slice(0, start)
    const after = text.slice(end + BLOCK_END.length)
    return `${before}${block}${after.replace(/^\n/, '\n')}`
  }
  const glue = text.trim().length === 0 ? '' : text.endsWith('\n') || text.endsWith('\n\n') ? '\n' : '\n\n'
  return `${text}${glue}${block}\n`
}

/** The marked block, if the file has one — what the Settings screen edits. */
export function extractBlock(existing: string): string {
  const start = String(existing || '').indexOf(BLOCK_START)
  const end = String(existing || '').indexOf(BLOCK_END)
  if (start === -1 || end === -1 || end <= start) return ''
  return String(existing)
    .slice(start + BLOCK_START.length, end)
    .trim()
}

/** Where each engine reads its global instructions from. */
export function houseRulesFile(engineId: 'claude-code' | 'agy', home: string): string {
  return engineId === 'agy' ? join(home, '.gemini', 'GEMINI.md') : join(home, '.claude', 'CLAUDE.md')
}

/**
 * Deploy to every engine's global file. Both engines always receive the
 * rules — the chosen engine decides who works today, not what the house
 * believes. Returns the files written.
 */
export function deployHouseRules(engineId: EngineId, model: string, home: string, rules?: Partial<HouseRules>, memoryFolder = ''): string[] {
  const block = houseRulesBlock(engineId, model, rules, memoryFolder)
  const written: string[] = []
  for (const target of ['claude-code', 'agy'] as const) {
    const file = houseRulesFile(target, home)
    let existing = ''
    try {
      existing = readFileSync(file, 'utf8')
    } catch {
      existing = ''
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, upsertBlock(existing, block), 'utf8')
    written.push(file)
  }
  return written
}
