export type RecallHit = { id: string; kind: 'conversation' | 'confirmed' | 'file'; title: string; text: string; path: string; date: string; speaker: string; match?: 'lexical' | 'local-semantic'; authority?: 'owner-confirmed' | 'owner-confirmed-context' | 'raw-source' | 'saved-file' | 'quoted-raw-evidence' | 'quoted-file-evidence' }
export type RecallCatalogue = { entriesSeen: number; groups: Array<{ path: string; entries: number }>; capped: boolean }
export type RecallReply = { ok: boolean; hits: RecallHit[]; incomplete: boolean; notices: string[]; catalogue?: RecallCatalogue; semantic?: { mode: 'off' | 'local-distributional-v1'; candidates: number; capped: boolean } }
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

const SEMANTIC_STOP = new Set('a an and are as at be been but by for from had has have he her hers him his i in into is it its me my of on or our ours she that the their theirs them they this to was we were what when where which who will with you your'.split(' '))
const semanticSequence = (text: string): string[] => (fold(text).normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu) || []).map(word => word.replace(/(?:ingly|edly|ing|ed|es|s)$/u, '')).filter(word => word.length >= 3 && !SEMANTIC_STOP.has(word)).slice(0, 2_000)
/** Deterministic local tokens. This is corpus-local distributional expansion, not an embedding-model claim. */
export function semanticTokens(text: string): string[] { return [...new Set(semanticSequence(text))].slice(0, 400) }
/**
 * Finds concepts that occur beside each query concept elsewhere in this exact bounded corpus.
 * A result must cover every query concept directly or through those observed neighbours.
 * No network, model, downloaded vocabulary or hidden index participates.
 */
export function localSemanticScores(rows: Array<{ id: string; text: string }>, query: string): Map<string, number> {
  const seeds = semanticTokens(query).slice(0, 12), documents = rows.map(row => { const sequence = semanticSequence(row.text); return { id: row.id, sequence, words: new Set(sequence) } })
  if (!seeds.length || documents.length < 2) return new Map()
  const neighbours = new Map<string, Map<string, number>>()
  for (const seed of seeds) neighbours.set(seed, new Map())
  for (const document of documents) for (let index = 0; index < document.sequence.length; index++) {
    const seed = document.sequence[index], counts = neighbours.get(seed)
    if (!counts) continue
    for (let nearby = Math.max(0, index - 8); nearby <= Math.min(document.sequence.length - 1, index + 8); nearby++) {
      const word = document.sequence[nearby]
      if (word !== seed) counts.set(word, (counts.get(word) || 0) + 1)
    }
  }
  const related = new Map<string, Map<string, number>>()
  for (const seed of seeds) {
    const ranked = [...neighbours.get(seed)!].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24)
    related.set(seed, new Map(ranked.map(([word, count]) => [word, Math.min(0.9, 0.45 + Math.log2(count + 1) / 10)])))
  }
  const scores = new Map<string, number>()
  for (const document of documents) {
    let score = 0, covered = true
    for (const seed of seeds) {
      if (document.words.has(seed)) { score += 1; continue }
      let best = 0
      for (const word of document.words) best = Math.max(best, related.get(seed)?.get(word) || 0)
      if (!best) { covered = false; break }
      score += best
    }
    if (covered && score >= seeds.length * 0.55) scores.set(document.id, score)
  }
  return scores
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
