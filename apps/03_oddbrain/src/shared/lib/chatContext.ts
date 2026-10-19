import type { Chat } from '../types'

/** Part 2 supplies defaults. These values describe intent, NEVER filesystem authority. */
export type ContextDefaults = { goal: string; style: string; workspace: string; additionalFolders: string[] }
export type ChatOverrides = Partial<ContextDefaults>
export function resolveChatContext(project: ContextDefaults, chat: ChatOverrides) {
  const keys = ['goal', 'style', 'workspace', 'additionalFolders'] as const
  const values = {} as ContextDefaults
  const sources = {} as Record<keyof ContextDefaults, 'project default' | 'this chat'>
  for (const key of keys) {
    const own = Object.prototype.hasOwnProperty.call(chat, key) && chat[key] !== undefined
    const value = own ? chat[key] : project[key]
    if (key === 'additionalFolders') {
      if (!Array.isArray(value) || value.some(path => typeof path !== 'string' || /[\x00-\x1f]/.test(path))) throw Error('Invalid folder references.')
      values.additionalFolders = [...new Set(value)]
    } else {
      if (typeof value !== 'string') throw Error('Invalid chat preference.')
      values[key] = value
    }
    sources[key] = own ? 'this chat' : 'project default'
  }
  return { values, sources, permissionEffect: 'none' as const }
}

/** A copy of stored text, not a native-session fork or resume. Never sanitize failures into successes. */
export function branchChat(source: Chat, through: string, id: () => string, includeMessage = true): Chat {
  const at = source.messages.findIndex(message => message.id === through)
  if (at < 0) throw Error('The branch point is no longer in this chat.')
  const selected = source.messages.slice(0, at + (includeMessage ? 1 : 0))
  if (selected.some(message => message.status === 'streaming')) throw Error('Stop or finish this reply before branching.')
  const chatId = id()
  const messages = structuredClone(selected).map(message => {
    message.id = id()
    for (const artifact of message.artifacts || []) { artifact.id = id(); artifact.chatId = chatId; artifact.messageId = message.id }
    return message
  })
  return { id: chatId, title: `${source.title} (side question)`, date: 'Today', projectId: source.projectId ?? null,
    branchOf: source.id, branchedFrom: { chatId: source.id, messageId: through, at: new Date().toISOString() }, messages }
}

/** Inspectable estimate only. No tokenizer, native session query, remote call or pricing assumptions. */
export function estimateChatContext(chat: Chat, draft: string, explicitContext = '') {
  let messageCharacters = 0, attachmentTextCharacters = 0, images = 0, excludedMessages = 0
  for (const message of chat.messages) {
    if (message.origin === 'import' || message.status === 'error' || message.status === 'streaming') { excludedMessages++; continue }
    messageCharacters += message.content.length + (message.context?.length || 0)
    for (const attachment of message.attachments || []) {
      if (attachment.kind === 'image') images++
      else attachmentTextCharacters += attachment.text?.length || 0
    }
  }
  const characters = messageCharacters + attachmentTextCharacters + draft.length + explicitContext.length
  return { characters, messageCharacters, attachmentTextCharacters, draftCharacters: draft.length, explicitContextCharacters: explicitContext.length,
    roughTokens: { low: Math.ceil(characters / 6), high: characters }, images, excludedMessages,
    source: 'UTF-16 character count; illustrative 1–6 characters per token, not a tokenizer or a guaranteed bound.',
    exclusions: 'Native session history, hidden system/tool instructions, thinking, binary files/images, unsent attachment bytes, server-side retrieval and artifact revisions are excluded. Failed/imported/streaming messages are excluded. The actual transport may send different material.',
    contextWindow: null, cost: null }
}

export type ChatNotes = { pins: string[]; recaps: Array<{ id: string; text: string; author: 'user' | 'ai'; basedOn: string[]; at: string }>; overrides: ChatOverrides }
export type NotesVersion = { id: string; parent: string | null; value: ChatNotes }
export const emptyChatNotes = (): ChatNotes => ({ pins: [], recaps: [], overrides: {} })
/** Immutable versions: quota/conflict errors never replace old records. No silent eviction. */
export function chatNotesStore(storage: Storage, prefix: string, chatId: string) {
  const base = `${prefix}.${encodeURIComponent(chatId).replace(/\./g, '%2E')}.`
  const versions = (): NotesVersion[] => {
    const result: NotesVersion[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i); if (!key?.startsWith(base)) continue
      const row = JSON.parse(storage.getItem(key) || 'null') as NotesVersion
      if (!row || typeof row.id !== 'string' || key !== base + row.id || !(row.parent === null || typeof row.parent === 'string') || !Array.isArray(row.value?.pins) || !Array.isArray(row.value?.recaps) || !row.value.overrides) throw Error('Chat notes are damaged. Original versions were kept.')
      if (row.value.pins.some(id => typeof id !== 'string') || row.value.recaps.some(r => typeof r.id !== 'string' || typeof r.text !== 'string' || !['user', 'ai'].includes(r.author) || !Array.isArray(r.basedOn) || r.basedOn.some(id => typeof id !== 'string') || typeof r.at !== 'string')) throw Error('Chat notes are damaged. Original versions were kept.')
      resolveChatContext({ goal: '', style: '', workspace: '', additionalFolders: [] }, row.value.overrides)
      result.push(row)
    }
    return result
  }
  const read = (): NotesVersion | null => {
    const all = versions(); if (!all.length) return null
    const parents = new Set(all.map(row => row.parent)), tips = all.filter(row => !parents.has(row.id))
    if (tips.length !== 1 || all.some(row => row.parent && !all.some(other => other.id === row.parent))) throw Error('Concurrent or incomplete note revisions need review. No version was overwritten.')
    const seen = new Set<string>(); let cursor: NotesVersion | undefined = tips[0]
    while (cursor) { if (seen.has(cursor.id)) throw Error('Cyclic note revisions. Originals kept.'); seen.add(cursor.id); cursor = all.find(row => row.id === cursor!.parent) }
    if (seen.size !== all.length) throw Error('Conflicting note revisions. Originals kept.')
    return tips[0]
  }
  return { read, versions, save(value: ChatNotes, expected: string | null, id: string): NotesVersion {
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw Error('Invalid note revision.')
    if ((read()?.id ?? null) !== expected) throw Error('Chat notes changed in another window. Reload before saving.')
    if (versions().length >= 500) throw Error('500 note revisions retained. Export them before starting a new notes history; nothing was deleted.')
    const next = { id, parent: expected, value }, bytes = JSON.stringify(next)
    if (bytes.length > 500_000) throw Error('Notes exceed 500,000 characters. Nothing was shortened.')
    if (storage.getItem(base + id) !== null) throw Error('Revision already exists.')
    storage.setItem(base + id, bytes)
    if (read()?.id !== id) throw Error('Concurrent note revisions preserved; review required.')
    return next
  } }
}
