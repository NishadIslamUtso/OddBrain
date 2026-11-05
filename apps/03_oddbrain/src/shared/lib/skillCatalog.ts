/**
 * The skill catalog (Track D, sourced 2026-10-16).
 *
 * Research duty first: anthropics/skills is the canonical collection
 * (verified live: the repo lists exactly these skills under skills/). Each
 * entry names an allowlisted upstream directory. Installation resolves main
 * to an immutable commit, downloads that commit archive, and preserves the
 * complete directory — SKILL.md, licenses, scripts, references and assets —
 * rather than producing a broken one-file imitation.
 *
 * Curation rule: only what a person doing real work on one machine would
 * use. Upstream license files are preserved byte-for-byte with each skill.
 */

export type CatalogSkill = {
  name: string
  /** What it is, in one honest sentence. */
  what: string
  /** The one curated repository the installer may resolve and download. */
  repo: 'anthropics/skills'
  /** Human-readable upstream main file; installation pins a commit archive. */
  source: string
}

const REPO = 'anthropics/skills' as const
const RAW = `https://raw.githubusercontent.com/${REPO}/main/skills`

const entry = (name: string, what: string): CatalogSkill => ({
  name,
  what,
  repo: REPO,
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
