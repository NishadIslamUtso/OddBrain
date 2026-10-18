import { LOOK_PRESETS, LAYOUTS, TASTE_QUIZ } from '../ui/lookCatalog'
export const LAB_KEY = 'oddbrain.look-notes.v1'
export type Verdict = 'love' | 'maybe' | 'no'
export type LookLab = { verdicts: Record<string, Verdict>; notes: Record<string, string>; shortlist: string[]; quiz: Record<string, number> }
export const DEFAULT_LAB: LookLab = { verdicts: {}, notes: {}, shortlist: [], quiz: {} }
const keys = [...LOOK_PRESETS.map(p => p.id), ...LAYOUTS.map(l => 'layout:' + l.id)] as string[]
export function normalizeLab(value: unknown): LookLab {
  const v = value && typeof value === 'object' ? value as Partial<LookLab> : {}
  return {
    verdicts: Object.fromEntries(Object.entries(v.verdicts || {}).filter(([key, x]) => keys.includes(key) && ['love', 'maybe', 'no'].includes(x))),
    notes: Object.fromEntries(Object.entries(v.notes || {}).filter(([key, x]) => keys.includes(key) && typeof x === 'string')),
    shortlist: Array.isArray(v.shortlist) ? [...new Set(v.shortlist.filter(key => keys.includes(key)))] : [],
    quiz: Object.fromEntries(Object.entries(v.quiz || {}).filter(([key, n]) => Number.isInteger(n) && n >= 0 && n < (TASTE_QUIZ[Number(key)]?.options.length || 0))),
  }
}
export function quizMatches(answers: Record<string, number>): { id: string; score: number; reasons: string[] }[] {
  return LOOK_PRESETS.map(p => {
    let score = 0; const reasons: string[] = []
    for (const [step, option] of Object.entries(answers)) {
      const answer = TASTE_QUIZ[Number(step)]?.options[option]
      if (!answer) continue
      const weight = Object.entries(answer.w).find(([id]) => id === p.id)?.[1] || 0
      score += weight
      if (weight) reasons.push(answer.why)
    }
    return { id: p.id, score, reasons }
  }).sort((a, b) => b.score - a.score)
}
export function labMarkdown(lab: LookLab): string {
  return ['# My OddBrain choices', '', ...keys.filter(k => lab.verdicts[k] || lab.notes[k] || lab.shortlist.includes(k)).flatMap(k => {
    const label = LOOK_PRESETS.find(p => p.id === k)?.name || LAYOUTS.find(l => 'layout:' + l.id === k)?.label || k
    return [`## ${label}`, lab.shortlist.includes(k) ? 'Shortlisted' : '', lab.verdicts[k] ? `Verdict: ${lab.verdicts[k]}` : '', lab.notes[k] || '', '']
  })].filter((s, i, arr) => s !== '' || arr[i - 1] !== '').join('\n')
}
