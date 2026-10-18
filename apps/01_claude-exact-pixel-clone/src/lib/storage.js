export const DEFAULT_MODEL = 'qwen2.5:3b'
export const DEFAULT_SETTINGS = {
  theme: 'dark', chatFont: 'Anthropic Serif', transcriptSize: 'Medium',
  transcriptWidth: 'Narrow', motion: 'System', voiceLanguage: 'English',
  voiceStyle: 'Buttery', voiceSpeed: 'Normal',
}
const choices = {
  theme: ['dark', 'light', 'system'], chatFont: ['Anthropic Serif', 'System', 'Monospace'],
  transcriptSize: ['Small', 'Medium', 'Large'], transcriptWidth: ['Narrow', 'Medium', 'Wide'],
  motion: ['System', 'Reduced'], voiceLanguage: ['English', 'Bengali'],
  voiceStyle: ['Buttery', 'Calm'], voiceSpeed: ['Slow', 'Normal', 'Fast'],
}
export function normalizeSettings(value) {
  return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) =>
    [key, choices[key].includes(value?.[key]) ? value[key] : fallback]))
}
export function normalizeChats(value) {
  if (!Array.isArray(value)) throw new Error('Chat history must be an array.')
  return value.map(chat => {
    if (!chat || typeof chat.id !== 'string' || typeof chat.title !== 'string') throw new Error('Invalid chat history.')
    const messages = Array.isArray(chat.messages) ? chat.messages : []
    if (messages.some(message => !message || typeof message.id !== 'string' || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.artifacts && (!Array.isArray(message.artifacts) || message.artifacts.some(artifact => !artifact || typeof artifact.id !== 'string' || !['html', 'svg'].includes(artifact.type) || !Array.isArray(artifact.versions) || !artifact.versions.length || artifact.versions.some(version => typeof version?.content !== 'string'))))) throw new Error('Invalid message history.')
    return { ...chat, date: chat.date || 'Older', messages }
  })
}
export const DEFAULT_CHATS = [
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
].map(([id, title, date = 'Older']) => ({ id, title, date, messages: [] }))

export function readStored(key, fallback, normalize = value => value, storage = localStorage) {
  try {
    const raw = storage.getItem(key)
    // Nothing stored yet. The fallback still goes through the normalizer: some
    // normalizers derive fields the UI reads unconditionally (resolveInference
    // turns { profile } into { profile, options, keepAlive }), so returning the
    // bare fallback would leave those fields undefined on a first run.
    if (raw === null) {
      try { return { value: normalize(fallback), warning: '' } }
      catch { return { value: fallback, warning: '' } }
    }
    return { value: normalize(JSON.parse(raw)), warning: '' }
  } catch {
    return { value: fallback, warning: `Could not read ${key}. The original data has not been cleared.` }
  }
}
// Preserve a malformed legacy value before any explicit edit replaces it.
export function writeStored(key, value, storage = localStorage) {
  const raw = storage.getItem(key)
  if (raw !== null) {
    try { JSON.parse(raw) } catch {
      storage.setItem(`${key}_recovery`, raw)
    }
  }
  storage.setItem(key, JSON.stringify(value))
}
export const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
