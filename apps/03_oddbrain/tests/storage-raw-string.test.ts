import test from 'node:test'
import assert from 'node:assert/strict'
import { readStored, writeStored } from '../src/shared/lib/storage'

/**
 * The returning-user bug: the open conversation's id was written as a raw
 * string but read back with JSON.parse, so a perfectly good value produced
 * "Could not read ai-assistant.current-chat" on every launch after the first.
 * A plain string is the value; it is not damage.
 */

const fake = (seed: Record<string, string> = {}) => {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    dump: () => Object.fromEntries(map),
  }
}

test('a raw string already on disk reads back as that string, with no warning', () => {
  const storage = fake({ 'ai-assistant.current-chat': 'chat-demo' })
  const read = readStored('ai-assistant.current-chat', '', value => (typeof value === 'string' ? value : ''), storage)
  assert.equal(read.warning, '')
  assert.equal(read.value, 'chat-demo')
})

test('a properly quoted string still parses the normal way', () => {
  const storage = fake({ 'ai-assistant.current-chat': '"chat-demo"' })
  const read = readStored('ai-assistant.current-chat', '', value => (typeof value === 'string' ? value : ''), storage)
  assert.equal(read.warning, '')
  assert.equal(read.value, 'chat-demo')
})

test('the round trip keeps the conversation open across a restart', () => {
  const storage = fake()
  writeStored('ai-assistant.current-chat', 'chat-demo', storage)
  // A second window reads what the first one wrote.
  const read = readStored('ai-assistant.current-chat', '', value => (typeof value === 'string' ? value : ''), storage)
  assert.equal(read.value, 'chat-demo')
})

test('genuinely unparseable data still warns and never clears itself', () => {
  const storage = fake({ 'ai-assistant.chats': '{"broken":' })
  // The normalizer rejects what the reader hands over, and the stored bytes stay.
  const read = readStored('ai-assistant.chats', [], value => {
    if (typeof value !== 'object' || value === null) throw new Error('Invalid chat history.')
    return []
  }, storage)
  assert.match(read.warning, /Could not read ai-assistant\.chats/)
  assert.equal(storage.getItem('ai-assistant.chats'), '{"broken":')
})

test('writeStored keeps a recovery copy when the old value was unparseable', () => {
  const storage = fake({ 'ai-assistant.settings': 'not json at all' })
  writeStored('ai-assistant.settings', { theme: 'dark' }, storage)
  assert.equal(storage.getItem('ai-assistant.settings_recovery'), 'not json at all')
  assert.equal(storage.getItem('ai-assistant.settings'), '{"theme":"dark"}')
})
