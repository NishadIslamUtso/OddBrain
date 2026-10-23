/**
 * The adversary reviewer: after a turn finishes, the owner can ask the
 * engine to check its own work — what is wrong, risky, or unfinished.
 * Goose's watcher, Block's red-team lesson, two rules kept hard: it is
 * REPORT-ONLY (the review may name problems; it may not fix anything), and
 * it is the SAME brain honestly labeled as such — a second brain's verdict
 * is a Battle away, not a fake. The verdict is parsed from the engine's own
 * words and shown beside the work it judged.
 */

/** The review order. The CLEAN contract makes "nothing wrong" sayable. */
export const REVIEW_ORDER =
  'Review only the supplied completed request and reported result — report only, change nothing. Look for what is wrong, risky, unfinished, or claimed but not shown. ' +
  'Answer with REVIEW: followed by one short line per finding. If and only if nothing at all is wrong, answer exactly CLEAN.'

export type ReviewVerdict =
  | { kind: 'clean' }
  | { kind: 'issues'; lines: string[] }

/**
 * Read the verdict out of the engine's finished words. Strict: CLEAN is
 * CLEAN only as its own word; anything else with a REVIEW: block is its
 * findings; anything else is treated as findings-with-a-warning, because a
 * review that does not follow its own format has still spoken.
 */
export function parseVerdict(text: string): ReviewVerdict {
  const trimmed = text.trim()
  if (/^CLEAN\b\.?$/i.test(trimmed)) return { kind: 'clean' }
  const at = trimmed.indexOf('REVIEW:')
  if (at < 0) {
    return {
      kind: 'issues',
      lines: [trimmed || '(the review said nothing)'],
    }
  }
  const block = trimmed.slice(at + 'REVIEW:'.length)
  const lines = block
    .split('\n')
    .map(line => line.replace(/^\s*(REVIEW:\s*)?[-*\d.)\s]*/i, '').trim())
    .filter(Boolean)
  if (!lines.length) {
    // "REVIEW:" with nothing after it is not a clean bill; it is a shrug.
    return { kind: 'issues', lines: ['(the review named no findings but did not say CLEAN)'] }
  }
  return { kind: 'issues', lines }
}

/** The one-line story: what the review concluded. */
export function verdictLine(verdict: ReviewVerdict): string {
  if (verdict.kind === 'clean') return 'Review: the engine checked its own work and said CLEAN.'
  return `Review: ${verdict.lines.length} ${verdict.lines.length === 1 ? 'finding' : 'findings'} — report only; nothing was changed by the review.`
}
