/**
 * Find a conversation by what was actually said in it.
 *
 * Every chat app searches message bodies; this one previously matched chat
 * titles only, which means a conversation you remember the contents of was
 * unreachable unless you also remembered what you called it.
 *
 * Deliberately dependency-free and case-insensitive. It scans in memory, which
 * is the right trade for a local app holding a few hundred chats — no index to
 * keep in sync, and no way for the index to disagree with what is on screen.
 */
import { recallTerms, recallMatches } from './recall'
import type { Chat, Message, Role } from '../types'

const MAX_SNIPPET = 140
const MAX_MATCHES_PER_CHAT = 3

export type SearchMatch = { messageId: string; role: Role; snippet: string }
export type SearchResult = { chat: Chat; matches: SearchMatch[]; titleHit: boolean }
/** A run of plain text, or a run that matched and should be marked. */
export type HighlightPart = string | { mark: string }

/** Split a query into terms on whitespace; all terms must match (AND). */
function terms(query: string): string[] {
  return recallTerms(String(query || '')).slice(0, 8)
}

/** A short window of text around the first hit, so the result is recognisable. */
function snippetAround(content: string, term: string): string {
  const haystack = content.toLowerCase()
  const at = haystack.indexOf(term)
  if (at === -1) return content.slice(0, MAX_SNIPPET)
  // Start a little before the match, but never cut a word in half if avoidable.
  const start = Math.max(0, at - 45)
  const slice = content.slice(start, start + MAX_SNIPPET)
  return (start > 0 ? '…' : '') + slice + (start + MAX_SNIPPET < content.length ? '…' : '')
}

/**
 * Only the answer text is searched. Thinking is part of what was said, but it
 * is noise in a result list.
 */
function messageText(message: Message): string {
  return String(message?.content || '')
}

/**
 * Returns the chats that match, each with up to a few snippets. A chat whose
 * title matches is included even if no message does, so behaviour never gets
 * worse than the old title-only search.
 */
export function searchChats(chats: Chat[] | unknown, query: string): SearchResult[] {
  const list = terms(query)
  if (!list.length) return []
  const results: SearchResult[] = []
  for (const chat of Array.isArray(chats) ? (chats as Chat[]) : []) {
    if (chat?.lifecycle === 'trash' || chat?.lifecycle === 'archived') continue
    const title = String(chat?.title || '')
    const titleHit = recallMatches(title, list)
    const matches: SearchMatch[] = []
    for (const message of Array.isArray(chat?.messages) ? chat.messages : []) {
      const text = messageText(message)
      if (!text) continue
      const haystack = text.toLowerCase()
      if (!recallMatches(haystack, list)) continue
      matches.push({
        messageId: message.id,
        role: message.role,
        snippet: snippetAround(text.replace(/\s+/g, ' ').trim(), list[0]),
      })
      if (matches.length >= MAX_MATCHES_PER_CHAT) break
    }
    if (titleHit || matches.length) {
      results.push({ chat, matches, titleHit })
    }
  }
  // Title matches first — they are the stronger signal — then most recent.
  return results.sort((a, b) => {
    if (a.titleHit !== b.titleHit) return a.titleHit ? -1 : 1
    return (b.chat.updatedAt || 0) - (a.chat.updatedAt || 0)
  })
}

/**
 * Wrap occurrences of the query in <mark> for display. Returns an array of
 * strings and marks so callers can render it without dangerouslySetInnerHTML.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const list = terms(query)
  if (!list.length) return [String(text || '')]
  const parts: HighlightPart[] = []
  let rest = String(text || '')
  // Build one alternation of the literals, escaped, longest-first.
  const pattern = new RegExp(
    `(${list
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')})`,
    'gi'
  )
  let guard = 0
  while (rest && guard++ < 200) {
    const found = pattern.exec(rest)
    if (!found) break
    if (found.index > 0) parts.push(rest.slice(0, found.index))
    parts.push({ mark: found[0] })
    rest = rest.slice(found.index + found[0].length)
  }
  if (rest) parts.push(rest)
  return parts
}
