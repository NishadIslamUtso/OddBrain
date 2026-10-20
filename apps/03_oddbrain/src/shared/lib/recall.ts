export type RecallHit = { id: string; kind: 'conversation' | 'confirmed' | 'file'; title: string; text: string; path: string; date: string; speaker: string }
export type RecallReply = { ok: boolean; hits: RecallHit[]; incomplete: boolean; notices: string[] }
const fold = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim()
/** Quoted runs stay together; unquoted words remain literal AND terms. */
export function recallTerms(query: string): string[] {
  return [...new Set([...query.matchAll(/"([^"]+)"|“([^”]+)”|(\S+)/g)].map(m => fold(m[1] || m[2] || m[3]).replace(/^["“”]+|["“”]+$/g, '')).filter(Boolean))]
}
export function recallMatches(text: string, terms: string[]): boolean { const hay = fold(text); return terms.length > 0 && terms.every(t => hay.includes(t)) }
/** Ranking only, never a reason to bypass source/privacy validation. */
export function recallScore(title: string, text: string, terms: string[]): number {
  const heading = fold(title), body = fold(text), phrase = terms.join(' ')
  let score = heading === phrase ? 30 : 0
  if (phrase && body.includes(phrase)) score += 8
  for (const term of terms) {
    if (heading.includes(term)) score += 6
    let at = body.indexOf(term), count = 0
    while (at >= 0 && count < 5) { count++; at = body.indexOf(term, at + term.length) }
    score += count
  }
  const positions = terms.map(t => body.indexOf(t))
  if (terms.length > 1 && positions.every(p => p >= 0) && Math.max(...positions) - Math.min(...positions) < 400) score += 5
  return score
}
export function recallSnippet(text: string, terms: string[]): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const positions = terms.map(t => normalized.toLowerCase().indexOf(t)).filter(at => at >= 0)
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 60)
  return (start ? '…' : '') + normalized.slice(start, start + 240) + (start + 240 < normalized.length ? '…' : '')
}

/** A readable observation, without changing the immutable JSON on disk. */
export function sourceReading(content: string): string {
  try {
    const record = JSON.parse(content), message = record?.message
    if (!message || typeof message.text !== 'string') return content
    return [
      `Speaker: ${typeof message.speaker === 'string' && message.speaker ? message.speaker : message.role || 'Unknown'}`,
      `Message time: ${message.timestamp || 'Not recorded'}`,
      '', message.text,
      ...(Array.isArray(message.attachments) && message.attachments.length ? ['', 'Attachments listed by the source (this text preview does not verify their saved bytes):', ...message.attachments.map((a: any) => `- ${a?.name || a?.kind || 'Attachment'}`)] : []),
    ].join('\n')
  } catch { return content } // A bounded/truncated preview stays visibly raw.
}
