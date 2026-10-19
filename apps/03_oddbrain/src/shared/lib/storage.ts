import { validContextReceipt } from './nativeConversation'
import { validNativeArtifacts } from './nativeArtifacts'
import type { Chat, Message, Settings } from '../types'

export const DEFAULT_MODEL = 'qwen2.5:3b'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  chatFont: 'Anthropic Serif',
  transcriptSize: 'Medium',
  transcriptWidth: 'Narrow',
  motion: 'System',
  voiceLanguage: 'English',
  voiceStyle: 'Buttery',
  voiceSpeed: 'Normal',
}

const choices: Record<keyof Settings, string[]> = {
  theme: ['dark', 'light', 'system'],
  chatFont: ['Anthropic Serif', 'System', 'Monospace'],
  transcriptSize: ['Small', 'Medium', 'Large'],
  transcriptWidth: ['Narrow', 'Medium', 'Wide'],
  motion: ['System', 'Reduced'],
  voiceLanguage: ['English', 'Bengali'],
  voiceStyle: ['Buttery', 'Calm'],
  voiceSpeed: ['Slow', 'Normal', 'Fast'],
}

/** Anything stored that is not a known choice falls back, so a bad value cannot
 *  leave the UI in a state with no valid option selected. */
export function normalizeSettings(value: unknown): Settings {
  const input = (value ?? {}) as Partial<Settings>
  return Object.fromEntries(
    (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map(key => [
      key,
      choices[key].includes(input[key] as string) ? input[key] : DEFAULT_SETTINGS[key],
    ])
  ) as Settings
}

export function normalizeChats(value: unknown): Chat[] {
  if (!Array.isArray(value)) throw new Error('Chat history must be an array.')
  return (value as Chat[]).map(chat => {
    if (!chat || typeof chat.id !== 'string' || typeof chat.title !== 'string') {
      throw new Error('Invalid chat history.')
    }
    if (chat.messages !== undefined && !Array.isArray(chat.messages)) throw new Error('Invalid message history. Original storage must not be replaced.')
    const messages: Message[] = Array.isArray(chat.messages) ? chat.messages : []
    const bad = messages.some(
      message =>
        !message ||
        typeof message.id !== 'string' ||
        !['user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string' ||
        (message.nativeRecord !== undefined && (!message.nativeRecord || typeof message.nativeRecord.transcriptId !== 'string' || typeof message.nativeRecord.chatId !== 'string' || !['claude-code', 'agy'].includes(message.nativeRecord.engine) || !(message.nativeRecord.sessionId === null || typeof message.nativeRecord.sessionId === 'string') || (message.nativeRecord.context !== undefined && !validContextReceipt(message.nativeRecord.context)) || (message.nativeRecord.artifacts !== undefined && !validNativeArtifacts(message.nativeRecord.artifacts)) || (message.nativeRecord.pictures !== undefined && (!Number.isSafeInteger(message.nativeRecord.pictures) || message.nativeRecord.pictures < 0)))) ||
        (message.artifacts &&
          (!Array.isArray(message.artifacts) ||
            message.artifacts.some(
              artifact =>
                !artifact ||
                typeof artifact.id !== 'string' ||
                !['html', 'svg'].includes(artifact.type) ||
                !Array.isArray(artifact.versions) ||
                !artifact.versions.length ||
                artifact.versions.some(version => typeof version?.content !== 'string')
            )))
    )
    if (bad) throw new Error('Invalid message history.')
    return { ...chat, date: chat.date || 'Older', messages }
  })
}

export const DEFAULT_CHATS: Chat[] = (
  [
    ['1', 'Refining a 5-day workout cycle', 'Oct 8'],
    ['2', 'Identifying your charisma type'],
    ['3', 'Repurposing an old Realme 6i phone'],
    ['4', 'Fix AI-generated Facebook profile picture'],
    ['11', 'Psychiatric prescription for multiple diagnoses'],
    ['5', 'PSY 101 midterm exam preparation and practice'],
    ['12', 'PSY 101 midterm exam preparation and chapter review'],
    ['6', 'STA201 MID'],
    ['7', 'Creating a new skill'],
    ['8', 'PHY-112 electrostatics study notes compilation'],
    ['9', 'Hash table search and function implementation'],
    ['10', 'CSE220 MID'],
    ['13', 'PSY 101 midterm exam preparation and chapter notes'],
    ['14', 'Student-style problem solving approach'],
    ['15', 'Comprehensive notes from slides with formulas'],
    ['16', 'Quick income for AIUB students'],
  ] as [string, string, string?][]
).map(([id, title, date = 'Older']) => ({ id, title, date, messages: [] }))

/** The slice of the Storage API this module needs, so tests can pass a fake. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function readStored<T>(
  key: string,
  fallback: T,
  normalize: (value: unknown) => T = value => value as T,
  storage: StorageLike = localStorage
): { value: T; warning: string } {
  try {
    const raw = storage.getItem(key)
    // Nothing stored yet. The fallback still goes through the normalizer: some
    // normalizers derive fields the UI reads unconditionally (resolveInference
    // turns { profile } into { profile, options, keepAlive }), so returning the
    // bare fallback would leave those fields undefined on a first run.
    if (raw === null) {
      try {
        return { value: normalize(fallback), warning: '' }
      } catch {
        return { value: fallback, warning: '' }
      }
    }
    return { value: normalize(JSON.parse(raw)), warning: '' }
  } catch {
    return { value: fallback, warning: `Could not read ${key}. The original data has not been cleared.` }
  }
}

// Preserve a malformed legacy value before any explicit edit replaces it.
export function writeStored(key: string, value: unknown, storage: StorageLike = localStorage): void {
  const raw = storage.getItem(key)
  if (raw !== null) {
    try {
      JSON.parse(raw)
    } catch {
      storage.setItem(`${key}_recovery`, raw)
    }
  }
  storage.setItem(key, JSON.stringify(value))
}

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
