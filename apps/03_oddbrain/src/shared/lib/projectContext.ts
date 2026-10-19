import type { Project } from './projects'

/**
 * projectContext.ts — the project-context resolver contract (Part 2 → Part 4
 * and the coordinator).
 *
 * A project is shared context ONLY in this explicit sense: this resolver
 * describes, for one project, exactly which sources a chat MAY receive,
 * where each came from, and what could not be carried. It never claims a
 * chat already knows the project, never reaches into other chats, and
 * never uploads a whole project anywhere. Originals stay on disk; only
 * extracted text travels, within the limits below, and every shortfall is
 * stated on the source itself — nothing is silently clipped or evicted.
 *
 * Part 4 (conversations/composer) consumes a bundle per chat turn:
 *
 *   const bundle = resolveProjectContext(project, facts)
 *   // include only sources with included === true, in bundle order;
 *   // stamp the turn with bundle.projectId + bundle.revision so a later
 *   // reader can tell exactly which project state the chat saw.
 *
 * `facts` is how the main process (coordinator wiring) reports what it
 * actually found when it opened a reference: size, readability, and — when
 * it extracted text — how much. Without facts a reference is honestly
 * "metadata-only": named and sized as unknown, never read by this module.
 */

export const PROJECT_CONTEXT_LIMITS = Object.freeze({
  /** Total extracted characters one bundle may carry. */
  maxChars: 24_000,
  /** Extracted characters one reference may contribute. */
  perReferenceChars: 8_000,
})

export type ProjectContextSourceKind = 'instruction' | 'goal' | 'reference'

/**
 * What the resolver could honestly say about carrying this source:
 * - `ready`         text is present and fits whole.
 * - `partial`       only part fits; both counts are stated.
 * - `metadata-only` named but not read (no facts supplied yet).
 * - `too-large`     known to exceed the per-reference limit before reading.
 * - `unreadable`    the file could not be opened (missing, locked, damaged).
 * - `linked`        a symlink or reparse point; never followed silently.
 * - `excluded`      the owner left this source out of context.
 */
export type ProjectContextExtraction =
  | 'ready'
  | 'partial'
  | 'metadata-only'
  | 'too-large'
  | 'unreadable'
  | 'linked'
  | 'excluded'

export type ProjectContextSource = {
  /** Stable identity: `instruction`, `goal:<index>`, `reference:<id>`. */
  id: string
  kind: ProjectContextSourceKind
  /** Human title for the inspector. */
  title: string
  /** Where it came from: 'project' (stored text) or the file's own path. */
  origin: string
  included: boolean
  /** Why not, when `included` is false. Empty when included. */
  reason: string
  extraction: ProjectContextExtraction
  /** Characters this source would contribute when included. */
  chars: number
  /** Total characters known to exist, when known. */
  totalChars: number | null
  /** The text itself, only when the resolver actually holds it. */
  text: string | null
}

/** What the main process found when it opened one reference file. */
export type ProjectReferenceFact = {
  sizeBytes?: number
  readable?: boolean
  /** True when the path resolves through a link; such files are refused. */
  linked?: boolean
  /** Extracted text the caller already holds, if it read the file. */
  extractedText?: string
}

export type ProjectContextCoverage = {
  includedSources: number
  excludedSources: number
  partialSources: number
  /** Characters the bundle would actually carry. */
  chars: number
  /** The ceiling those characters were measured against. */
  limitChars: number
  /** True when at least one source could not be carried whole. */
  overLimit: boolean
}

export type ProjectContextBundle = {
  projectId: string
  /** Revision of the project state this bundle was resolved from. */
  revision: string
  resolvedAt: string
  sources: ProjectContextSource[]
  coverage: ProjectContextCoverage
  warnings: string[]
}

/** Small deterministic hash — identity for a project state, not security. */
const hashOf = (text: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * The revision Part 4 stamps on a turn. It changes exactly when the
 * context-bearing state changes: instruction, goals, or the reference
 * list with its inclusion choices. Renaming a project does not move it.
 */
export function projectRevision(project: Project): string {
  const parts = [
    project.id,
    project.instruction,
    ...project.goals,
    ...project.references.map((reference) => `${reference.id}:${reference.includeInContext ? 1 : 0}:${reference.path}`),
  ]
  return `p${hashOf(parts.join('\n'))}`
}

const fitText = (text: string, limit: number): { text: string; partial: boolean } =>
  text.length <= limit ? { text, partial: false } : { text: text.slice(0, limit), partial: true }

/**
 * Resolve one project's context bundle. Pure: no files are opened here,
 * no other project or chat is consulted, and the bundle names every
 * source the project holds — included or not — so the inspector and the
 * model-facing inclusion can never quietly disagree.
 */
export function resolveProjectContext(
  project: Project,
  facts: Record<string, ProjectReferenceFact> = {},
  now: string = new Date().toISOString(),
): ProjectContextBundle {
  const limit = PROJECT_CONTEXT_LIMITS.maxChars
  const sources: ProjectContextSource[] = []
  const warnings: string[] = []
  let used = 0

  const spend = (wanted: number): number => {
    const granted = Math.max(0, Math.min(wanted, limit - used))
    used += granted
    return granted
  }

  if (project.instruction.trim()) {
    const fitted = fitText(project.instruction, limit)
    const granted = spend(fitted.text.length)
    sources.push({
      id: 'instruction',
      kind: 'instruction',
      title: 'Project instruction',
      origin: 'project',
      included: granted > 0,
      reason: granted > 0 ? '' : 'No room left in this bundle.',
      extraction: fitted.partial || granted < fitted.text.length ? 'partial' : 'ready',
      chars: granted,
      totalChars: project.instruction.length,
      text: fitted.text.slice(0, granted),
    })
  }

  project.goals.forEach((goal, index) => {
    const fitted = fitText(goal, limit)
    const granted = spend(fitted.text.length)
    sources.push({
      id: `goal:${index}`,
      kind: 'goal',
      title: `Goal ${index + 1}`,
      origin: 'project',
      included: granted > 0,
      reason: granted > 0 ? '' : 'No room left in this bundle.',
      extraction: fitted.partial || granted < fitted.text.length ? 'partial' : 'ready',
      chars: granted,
      totalChars: goal.length,
      text: fitted.text.slice(0, granted),
    })
  })

  for (const reference of project.references) {
    const base = {
      id: `reference:${reference.id}`,
      kind: 'reference' as const,
      title: reference.label,
      origin: reference.path,
    }
    if (!reference.includeInContext) {
      sources.push({
        ...base,
        included: false,
        reason: 'Left out by the owner.',
        extraction: 'excluded',
        chars: 0,
        totalChars: null,
        text: null,
      })
      continue
    }
    const fact = facts[reference.path]
    if (!fact) {
      sources.push({
        ...base,
        included: false,
        reason: 'Not read yet — the app has not opened this file.',
        extraction: 'metadata-only',
        chars: 0,
        totalChars: null,
        text: null,
      })
      continue
    }
    if (fact.linked) {
      sources.push({ ...base, included: false, reason: 'The file is a link; links are not followed.', extraction: 'linked', chars: 0, totalChars: null, text: null })
      continue
    }
    if (fact.readable === false) {
      sources.push({ ...base, included: false, reason: 'The file could not be opened.', extraction: 'unreadable', chars: 0, totalChars: null, text: null })
      continue
    }
    if (typeof fact.extractedText !== 'string') {
      sources.push({
        ...base,
        included: false,
        reason: 'Named but not extracted yet.',
        extraction: 'metadata-only',
        chars: 0,
        totalChars: null,
        text: null,
      })
      continue
    }
    const total = fact.extractedText.length
    if (total > PROJECT_CONTEXT_LIMITS.perReferenceChars && used + PROJECT_CONTEXT_LIMITS.perReferenceChars > limit) {
      sources.push({ ...base, included: false, reason: 'Too large for the room left in this bundle.', extraction: 'too-large', chars: 0, totalChars: total, text: null })
      continue
    }
    const fitted = fitText(fact.extractedText, PROJECT_CONTEXT_LIMITS.perReferenceChars)
    const granted = spend(fitted.text.length)
    sources.push({
      ...base,
      included: granted > 0,
      reason: granted > 0 ? '' : 'No room left in this bundle.',
      extraction: fitted.partial || granted < fitted.text.length ? 'partial' : 'ready',
      chars: granted,
      totalChars: total,
      text: fitted.text.slice(0, granted),
    })
  }

  const coverage: ProjectContextCoverage = {
    includedSources: sources.filter((source) => source.included).length,
    excludedSources: sources.filter((source) => !source.included).length,
    partialSources: sources.filter((source) => source.extraction === 'partial').length,
    chars: used,
    limitChars: limit,
    overLimit: sources.some((source) => source.extraction === 'partial' || source.extraction === 'too-large'),
  }
  if (coverage.overLimit) warnings.push('Some material could not be carried whole; each affected source says so above.')
  if (sources.some((source) => source.extraction === 'metadata-only')) {
    warnings.push('Some references are named but not read yet; nothing from them joins a chat until the app has opened them.')
  }
  warnings.push('Originals stay on this machine. Only the extracted text listed here can travel, and only into a chat that explicitly uses this project.')

  return { projectId: project.id, revision: projectRevision(project), resolvedAt: now, sources, coverage, warnings }
}
