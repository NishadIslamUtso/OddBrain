import type { Chat, Message } from '../types'
import type { Transcript } from './transcripts'
import { extractArtifacts, wantsArtifact } from './artifacts'
import { extractCitations } from './citations'
/** Idempotent presentation of the complete recorded answer. Tool traces and actual
 * context receipts stay linked to the full archive, never relabelled as chat text. */
export function recordNativeTranscript(chat: Chat, record: Transcript): Chat {
  if (record.header.chatId !== chat.id) throw Error('This transcript belongs to a different conversation.')
  if (record.state === 'running') return chat
  const chunks: Array<{ kind: 'text' | 'thinking' | 'boundary'; text: string }> = []
  for (const event of record.events) {
    const last = chunks.at(-1)
    if (event.kind === 'delta') {
      if (last?.kind === 'text') last.text += event.text
      else chunks.push({ kind: 'text', text: event.text })
    } else if (event.kind === 'text') chunks.push({ kind: 'text', text: event.text })
    else if (event.kind === 'thinking') {
      if (last?.kind === 'thinking') last.text += event.text
      else chunks.push({ kind: 'thinking', text: event.text })
    } else if (event.kind === 'done') {
      if (event.text && !event.alreadyDisplayed && !(last?.kind === 'text' && last.text === event.text)) chunks.push({ kind: 'text', text: event.text })
    } else chunks.push({ kind: 'boundary', text: '' })
  }
  const text = chunks.filter(c => c.kind === 'text').map(c => c.text).join('\n\n'), thinking = chunks.filter(c => c.kind === 'thinking').map(c => c.text).join('\n\n')

  const errors = record.events.filter(e => e.kind === 'error').map(e => e.text).join('\n')
  const session = record.events.filter(e => e.kind === 'session').at(-1)
  const nativeRecord = { pictures: record.header.pictures, ...(record.header.images !== undefined ? { images: record.header.images } : {}), ...(record.header.attachments !== undefined ? { attachments: record.header.attachments } : {}), artifacts: record.events.flatMap(event => event.artifacts || []), transcriptId: record.header.id, chatId: chat.id, engine: record.header.engine, sessionId: session?.kind === 'session' ? session.id : null, context: record.header.context }
  const at = record.header.at, assistantId = record.header.id + ':assistant'
  const artifactRequested = wantsArtifact(record.userPrompt ?? record.prompt) || /```(?:html|svg)\s*\r?\n/i.test(text) || /^\s*(?:<!doctype html|<html\b)/i.test(text)
  const artifacts = extractArtifacts(text, { requested: artifactRequested, messageId: assistantId, chatId: chat.id, title: record.header.title, createdAt: at })
  const citations = extractCitations(text)
  const messages: Message[] = [
    { id: record.header.id + ':user', role: 'user', content: record.userPrompt ?? record.prompt, timestamp: at, nativeRecord, status: 'complete' },
    { id: assistantId, role: 'assistant', content: text, thinking, timestamp: at, nativeRecord, model: record.header.model,
      ...(artifacts.length ? { artifacts } : {}), ...(citations.length ? { citations } : {}),
      status: record.state === 'done' ? 'complete' : record.state === 'error' ? 'error' : 'stopped', ...(errors ? { error: errors } : {}) },
  ]
  const replacements = new Map(messages.map(m => [m.id, m]))
  const existing = new Set(chat.messages.map(m => m.id))
  const next = [...chat.messages.map(m => replacements.get(m.id) || m), ...messages.filter(m => !existing.has(m.id))]
  const added = messages.some(message => !existing.has(message.id))
  return { ...chat, ...(added ? { vaultStatus: undefined, vaultError: undefined, ...(new Date(at).toDateString() === new Date().toDateString() ? { date: 'Today' } : {}) } : {}), messages: next, updatedAt: Math.max(chat.updatedAt || 0, Date.parse(at)) }
}
