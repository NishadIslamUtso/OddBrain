import { recordNativeTranscript } from '@shared/lib/nativeChat'
import type { Transcript } from '@shared/lib/transcripts'
import type { Chat } from '@shared/types'

const messageTime = (message: Chat['messages'][number]): number => {
  const stamp = message.timestamp || message.at
  const parsed = stamp ? Date.parse(stamp) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Put recorded turns back into saved chats after a restart.
 *
 * This is not a live engine call and not an import of native history: every
 * candidate comes from this app's own transcript archive. A turn is restored only
 * when its record names a chat that still exists, is already finished (running
 * records keep streaming in the live view), is missing from that chat, and is not
 * older than the chat's newest message — otherwise inserting it would silently
 * reorder the conversation. Message IDs are the record's own, so restoring twice
 * is idempotent rather than duplicating a turn.
 */
export function recoverRecordedTurns(chats: Chat[], records: Transcript[], limit = 20): { chats: Chat[]; recovered: Array<{ chatId: string; transcriptId: string }> } {
  if (!Array.isArray(chats) || !records.length) return { chats, recovered: [] }
  const recovered: Array<{ chatId: string; transcriptId: string }> = []
  let next = chats
  for (const record of records) {
    if (recovered.length >= limit) break
    const chatId = record.header.chatId
    if (!chatId || record.state === 'running') continue
    const chat = next.find(entry => entry.id === chatId)
    if (!chat) continue
    if (chat.messages.some(message => message.id === record.header.id + ':assistant')) continue
    const at = Date.parse(record.header.at)
    const newest = chat.messages.reduce((latest, message) => Math.max(latest, messageTime(message)), 0)
    if (Number.isFinite(at) && newest && at < newest) continue
    try {
      next = next.map(entry => entry.id === chatId ? recordNativeTranscript(entry, record) : entry)
      recovered.push({ chatId, transcriptId: record.header.id })
    } catch { /* a record that cannot be placed is left in Full transcripts */ }
  }
  return { chats: next, recovered }
}
