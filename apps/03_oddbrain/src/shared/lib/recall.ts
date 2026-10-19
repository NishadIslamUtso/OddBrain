export type RecallHit = { id: string; kind: 'conversation' | 'confirmed' | 'file'; title: string; text: string; path: string; date: string; speaker: string }
export type RecallReply = { ok: boolean; hits: RecallHit[]; incomplete: boolean; notices: string[] }
export function recallTerms(query: string): string[] { return query.trim().toLowerCase().split(/\s+/).filter(Boolean) }
export function recallMatches(text: string, terms: string[]): boolean { return terms.length > 0 && terms.every(t => text.toLowerCase().includes(t)) }
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
