import type { Chat, Message } from '../types'
import type { Transcript, TranscriptHeader } from './transcripts'
/** At most this many turns are written back into conversations at startup. */
export const RECOVERY_LIMIT = 8
/**
 * Recorded turns this app can put back into a conversation: the transcript names
 * a chat that still exists, and that chat has no assistant message for it (the
 * app closed mid-turn, or the copy failed). Nothing is re-run, re-sent or
 * invented; a partial answer keeps its recorded text and stays marked stopped.
 */
export function recoverableTranscripts(entries: TranscriptHeader[], chats: Array<Pick<Chat, 'id' | 'messages'>>, limit = RECOVERY_LIMIT): TranscriptHeader[] {
  const byId = new Map(chats.map(chat => [chat.id, chat]))
  const found: TranscriptHeader[] = []
  for (const entry of entries) {
    if (!entry.chatId || typeof entry.id !== 'string') continue
    const chat = byId.get(entry.chatId)
    if (!chat || chat.messages.some(message => message.id === entry.id + ':assistant')) continue
    if (!found.some(other => other.id === entry.id)) found.push(entry)
    if (found.length >= limit) break
  }
  return found
}
export function recoveryNotice(count: number): string {
  return `Restored ${count} recorded turn${count === 1 ? '' : 's'} into ${count === 1 ? 'its conversation' : 'their conversations'} because the app had not copied ${count === 1 ? 'it' : 'them'} there. Partial answers stay marked interrupted; nothing was re-run, re-sent or completed.`
}
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
  const nativeRecord = { pictures: record.header.pictures, artifacts: record.events.flatMap(event => event.artifacts || []), transcriptId: record.header.id, chatId: chat.id, engine: record.header.engine, sessionId: session?.kind === 'session' ? session.id : null, context: record.header.context }
  const at = record.header.at
  const messages: Message[] = [
    { id: record.header.id + ':user', role: 'user', content: record.userPrompt ?? record.prompt, timestamp: at, nativeRecord, status: 'complete' },
    { id: record.header.id + ':assistant', role: 'assistant', content: text, thinking, timestamp: at, nativeRecord, model: record.header.model,
      status: record.state === 'done' ? 'complete' : record.state === 'error' ? 'error' : 'stopped', ...(errors ? { error: errors } : {}) },
  ]
  const replacements = new Map(messages.map(m => [m.id, m]))
  const existing = new Set(chat.messages.map(m => m.id))
  const next = [...chat.messages.map(m => replacements.get(m.id) || m), ...messages.filter(m => !existing.has(m.id))]
  const added = messages.some(message => !existing.has(message.id))
  return { ...chat, ...(added ? { vaultStatus: undefined, vaultError: undefined, ...(new Date(at).toDateString() === new Date().toDateString() ? { date: 'Today' } : {}) } : {}), messages: next, updatedAt: Math.max(chat.updatedAt || 0, Date.parse(at)) }
}
