import { resolveChatContext, type ChatOverrides } from './chatContext'
export type NativeConversation = {
  chatId: string
  expectedRoute?: string
  projectId?: string | null
  overrides?: ChatOverrides
  /** Refuse, rather than silently start fresh, if this saved native link disappeared. */
  continuationExpected?: boolean
  /** Supplied only for a new native context. Stored chat text, never another native ID. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}
export type ContextReceipt = {
  projectId: string | null; revision: string; workspace: string
  sources: Array<{ id: string; title: string; chars: number; digest?: string; coverage: string }>
  historyMessages: number; characters: number
}
export type NativeSessionLink = { engine: 'claude-code' | 'agy'; workspace: string; sessionId: string; chatId?: string }
export function checkNativeConversation(value: unknown): NativeConversation | undefined {
  if (value === undefined || value === null) return undefined
  const raw = value as NativeConversation
  if (!raw || typeof raw !== 'object' || typeof raw.chatId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,256}$/.test(raw.chatId)) throw Error('Invalid conversation identity. Nothing was sent.')
  if (raw.expectedRoute !== undefined && (typeof raw.expectedRoute !== 'string' || raw.expectedRoute.length > 16_000)) throw Error('Invalid engine route.')
  if (raw.projectId !== undefined && raw.projectId !== null && (typeof raw.projectId !== 'string' || !/^[a-zA-Z0-9_-]{6,64}$/.test(raw.projectId))) throw Error('Invalid project identity.')
  if (raw.continuationExpected !== undefined && typeof raw.continuationExpected !== 'boolean') throw Error('Invalid resume choice.')
  if (raw.history !== undefined && (!Array.isArray(raw.history) || raw.history.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string'))) throw Error('Invalid stored conversation context.')
  resolveChatContext({ goal: '', style: '', workspace: '', additionalFolders: [] }, raw.overrides || {})
  if (JSON.stringify(raw).length > 100_000) throw Error('Conversation context exceeds 100,000 characters. Nothing was clipped or sent; use a shorter explicit recap in a new chat.')
  return structuredClone(raw)
}

export type NativeContextTarget = { workspace: string; route: string; resume: boolean }

export function validContextReceipt(value: unknown): value is ContextReceipt {
  const v = value as ContextReceipt
  return !!v && typeof v === 'object' && (v.projectId === null || typeof v.projectId === 'string') && typeof v.revision === 'string' && /^[a-f0-9]{64}$/i.test(v.revision) && typeof v.workspace === 'string' &&
    Number.isSafeInteger(v.characters) && v.characters >= 0 && Number.isSafeInteger(v.historyMessages) && v.historyMessages >= 0 && Array.isArray(v.sources) && v.sources.length <= 100 && v.sources.every(source =>
      source && typeof source.id === 'string' && typeof source.title === 'string' && typeof source.coverage === 'string' && Number.isSafeInteger(source.chars) && source.chars >= 0 && (source.digest === undefined || (typeof source.digest === 'string' && /^[a-f0-9]{64}$/i.test(source.digest))))
}
