/**
 * Characters that can make reviewed text say something different to a model
 * than it appears to say to a person. This scanner NEVER rewrites text: Bangla,
 * Arabic and emoji legitimately use some of these characters. It reports facts
 * so the owner can reveal and judge them while exact source bytes stay intact.
 */
export type TextHazardKind = 'unicode-tags' | 'bidi-controls' | 'zero-width' | 'control-characters' | 'variation-run'
export type TextHazardFinding = {
  kind: TextHazardKind
  label: string
  count: number
  positions: number[]
  codePoints: string[]
  excerpts: string[]
}
export type TextHazardReport = { total: number; findings: TextHazardFinding[]; notice: string }

const LABELS: Record<TextHazardKind, string> = {
  'unicode-tags': 'Unicode tag characters',
  'bidi-controls': 'bidirectional text controls',
  'zero-width': 'zero-width or invisible formatting characters',
  'control-characters': 'unexpected control characters',
  'variation-run': 'unusually long variation-selector runs',
}

const kindOf = (code: number): TextHazardKind | '' => {
  if (code >= 0xe0000 && code <= 0xe007f) return 'unicode-tags'
  if (code === 0x061c || code === 0x200e || code === 0x200f || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x206f)) return 'bidi-controls'
  if ([0x00ad, 0x034f, 0x180e, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff].includes(code)) return 'zero-width'
  if ((code < 0x20 && ![0x09, 0x0a, 0x0d].includes(code)) || code === 0x7f) return 'control-characters'
  return ''
}
const cp = (code: number) => `U+${code.toString(16).toUpperCase().padStart(code > 0xffff ? 6 : 4, '0')}`
/** Labelled display derivative. Callers must keep the exact original separately. */
export function revealTextHazards(text: string): string {
  let visible = ''
  for (const character of text) {
    const code = character.codePointAt(0)!
    const variation = (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0xe0100 && code <= 0xe01ef)
    visible += kindOf(code) || variation ? `⟦${cp(code)}⟧` : character
  }
  return visible.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t')
}
const excerpt = (text: string, index: number) => {
  let start = Math.max(0, index - 24), end = Math.min(text.length, index + 25)
  if (start && text.charCodeAt(start) >= 0xdc00 && text.charCodeAt(start) <= 0xdfff) start--
  if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end++
  return revealTextHazards(text.slice(start, end))
}

/** Bounded report: complete counts, at most eight positions/examples per kind. */
export function scanTextHazards(value: unknown): TextHazardReport {
  const text = typeof value === 'string' ? value : ''
  const found = new Map<TextHazardKind, { count: number; positions: number[]; codePoints: Set<string>; excerpts: string[] }>()
  const add = (kind: TextHazardKind, index: number, code: number, count = 1) => {
    let row = found.get(kind)
    if (!row) { row = { count: 0, positions: [], codePoints: new Set(), excerpts: [] }; found.set(kind, row) }
    row.count += count
    if (row.positions.length < 8) row.positions.push(index)
    if (row.codePoints.size < 8) row.codePoints.add(cp(code))
    if (row.excerpts.length < 4) row.excerpts.push(excerpt(text, index))
  }
  for (let index = 0; index < text.length;) {
    const code = text.codePointAt(index)!
    const kind = kindOf(code)
    if (kind) add(kind, index, code)
    index += code > 0xffff ? 2 : 1
  }
  // Variation selectors are normal. Only a run of four or more is suspicious.
  const variations = /(?:[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]){4,}/gu
  for (const match of text.matchAll(variations)) add('variation-run', match.index, match[0].codePointAt(0)!, [...match[0]].length)
  const findings = [...found.entries()].map(([kind, row]) => ({ kind, label: LABELS[kind], count: row.count, positions: row.positions, codePoints: [...row.codePoints], excerpts: row.excerpts }))
  const total = findings.reduce((sum, item) => sum + item.count, 0)
  return {
    total,
    findings,
    notice: total
      ? `Review warning: ${total.toLocaleString()} invisible or direction-changing character${total === 1 ? '' : 's'} detected. Exact text was preserved; reveal the listed code points before trusting it as instructions.`
      : '',
  }
}

export function textHazardDetails(report: TextHazardReport): string[] {
  return report.findings.map(item => `${item.label}: ${item.count.toLocaleString()} (${item.codePoints.join(', ') || 'code point unavailable'}; UTF-16 positions ${item.positions.join(', ') || 'unavailable'})`)
}
