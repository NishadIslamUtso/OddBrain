/**
 * The skill catalog (Track D, sourced 2026-10-16).
 *
 * Research duty first: anthropics/skills is the canonical open collection
 * (verified live: the repo lists exactly these skills under skills/). Each
 * entry here points at the raw SKILL.md the engine folders actually need —
 * one click installs it through the app's one-vault-to-every-engine deploy
 * (Claude Code's ~/.claude/skills, agy's .agents/skills), which already
 * exists from Track A.
 *
 * Curation rule: only what a person doing real work on one machine would
 * use. Anthropic's license rides along with every file — the app adds
 * nothing to it and takes nothing from it.
 */

export type CatalogSkill = {
  name: string
  /** What it is, in one honest sentence. */
  what: string
  /** The raw file the install door fetches. Only this exact host is allowed. */
  source: string
}

const RAW = 'https://raw.githubusercontent.com/anthropics/skills/main/skills'

const entry = (name: string, what: string): CatalogSkill => ({
  name,
  what,
  source: `${RAW}/${name}/SKILL.md`,
})

export const SKILL_CATALOG: readonly CatalogSkill[] = Object.freeze([
  entry('docx', 'Word documents: create, edit with tracked changes, comments.'),
  entry('pptx', 'PowerPoint decks: create, edit, thumbnails.'),
  entry('xlsx', 'Spreadsheets: formulas, recalculation, error reporting.'),
  entry('pdf', 'PDFs: read, create, merge, forms, OCR.'),
  entry('doc-coauthoring', 'Write and revise a document together, draft by draft.'),
  entry('internal-comms', 'Status updates, announcements, org messages.'),
  entry('mcp-builder', 'Build an MCP server for wiring tools into engines.'),
  entry('skill-creator', 'Design and test a skill of your own.'),
  entry('webapp-testing', 'Drive a real browser with Playwright to test a web app.'),
  entry('frontend-design', 'Production-grade UI that does not look machine-made.'),
  entry('web-artifacts-builder', 'Interactive React + Tailwind artifacts.'),
])

export function catalogEntry(name: unknown): CatalogSkill | null {
  return SKILL_CATALOG.find((skill) => skill.name === String(name ?? '')) ?? null
}
