// NOT RUN. Estimates are not measured native token usage.
import { expect, test } from 'vitest'
import { estimateChatContext, chatNotesStore, emptyChatNotes } from '../src/shared/lib/chatContext'
test('estimate enumerates exclusions, has no invented price/window, and does not include hidden thinking', () => {
  const result = estimateChatContext({ id: 'c', title: 'T', messages: [{ id: 'a', role: 'user', content: 'abc', thinking: 'hidden', attachments: [{ id: 'i', name: 'image', kind: 'image', data: 'secret' }] }, { id: 'b', role: 'assistant', content: 'excluded', status: 'error' }] }, 'draft')
  expect(result.characters).toBe(8); expect(result.images).toBe(1); expect(result.excludedMessages).toBe(1)
  expect(result.contextWindow).toBeNull(); expect(result.cost).toBeNull(); expect(result.exclusions).toContain('Native session history')
})
function storage(): Storage {
  const data = new Map<string, string>()
  return { get length() { return data.size }, key: n => [...data.keys()][n] ?? null, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) }, clear: () => data.clear() }
}
test('notes keep every original recap version and reject stale saves without altering other chats', () => {
  const disk = storage(), first = chatNotesStore(disk, 'real', 'first'), second = chatNotesStore(disk, 'real', 'second'), sample = chatNotesStore(disk, 'sample', 'first')
  const notes = emptyChatNotes(); notes.recaps.push({ id: 'r', author: 'ai', text: 'unverified recap', basedOn: ['m'], at: 'now' })
  first.save(notes, null, 'v1'); first.save({ ...notes, pins: ['m'], working: { ...notes.working, objective: 'Keep context across models', decisions: ['Use cited evidence'], updatedAt: '2026-10-20T00:00:00.000Z' } }, 'v1', 'v2')
  expect(first.versions()).toHaveLength(2); expect(first.versions()[0].value.pins).toEqual([])
  expect(first.read()?.value.working).toMatchObject({ objective: 'Keep context across models', decisions: ['Use cited evidence'], author: 'user' })
  expect(() => first.save(notes, 'v1', 'v3')).toThrow('another window'); expect(second.read()).toBeNull(); expect(sample.read()).toBeNull()
})
test('local semantic retrieval is a separate opt-in that cannot outlive vault-search approval', () => {
  const store = chatNotesStore(storage(), 'x', 'semantic'), notes = emptyChatNotes()
  expect(() => store.save({ ...notes, localSemantic: true }, null, 'bad')).toThrow(/requires.*vault search/i)
  const enabled = { ...notes, vaultSearch: true, localSemantic: true }
  store.save(enabled, null, 'v1')
  expect(store.read()?.value).toMatchObject({ vaultSearch: true, localSemantic: true })
})
test('concurrent immutable revision forks are detected and retained', () => {
  const disk = storage(), notes = emptyChatNotes(), store = chatNotesStore(disk, 'x', 'chat')
  store.save(notes, null, 'v1')
  disk.setItem('x.chat.v2', JSON.stringify({ id: 'v2', parent: null, value: notes }))
  expect(() => store.read()).toThrow('Concurrent'); expect(disk.length).toBe(2)
})

test('chat IDs containing separators cannot leak notes into another chat namespace', () => {
  const disk = storage(), a = chatNotesStore(disk, 'real', 'a'), b = chatNotesStore(disk, 'real', 'a.b')
  b.save(emptyChatNotes(), null, 'v1'); expect(a.read()).toBeNull(); expect(b.read()?.id).toBe('v1')
})
