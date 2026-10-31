import type { TextHazardReport } from './textHazards'
export type FileReview = { token: string; path: string; diff: string; expiresAt: number; purpose: 'restore' | 'project-rules' | 'skill'; checks: string[]; before: string; after: string; hazards?: TextHazardReport }
export type FileDecision = { ok: boolean; answer: string; recoveryPath?: string }
export type FileReviewPort = { preview(): Promise<FileReview>; decide(token: string, decision: 'allow' | 'deny'): Promise<FileDecision>; reveal?(token: string): Promise<{ ok: boolean; answer: string }> }

/** Exact whole-file unified diff; refuse large comparisons rather than omit changed lines. */
export function unifiedDiff(before: string, after: string, name = 'file'): string {
  const lines = (text: string) => { const result = text ? text.split('\n') : []; if (text.endsWith('\n')) result.pop(); return result }
  const a = lines(before), b = lines(after)
  if (before.length + after.length > 500_000 || a.length > 1000 || b.length > 1000) throw Error('Diff exceeds 1,000 lines per file or 500,000 characters. No content was clipped; review the full files separately.')
  if (before === after) return 'No content changes.'
  const width = b.length + 1, table = new Uint16Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
  const safe = name.replace(/[\r\n\t]/g, ' ')
  const out = [`--- a/${safe}`, `+++ b/${safe}`, `@@ -${a.length ? 1 : 0},${a.length} +${b.length ? 1 : 0},${b.length} @@`]
  let i = 0, j = 0
  const emit = (prefix: string, text: string, noNewline: boolean) => { out.push(prefix + text); if (noNewline) out.push('\\ No newline at end of file') }
  while (i < a.length || j < b.length) {
    const aEnd = i === a.length - 1 && !before.endsWith('\n'), bEnd = j === b.length - 1 && !after.endsWith('\n')
    if (i < a.length && j < b.length && a[i] === b[j] && aEnd === bEnd) { emit(' ', a[i++], aEnd); j++ }
    else if (i < a.length && (j === b.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) emit('-', a[i++], aEnd)
    else emit('+', b[j++], bEnd)
  }
  return out.join('\n') + '\n'
}
