// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChatStore } from '../src/main/chats/store'
import type { Chat } from '../src/shared/types'

const roots: string[] = []
const root = (): string => { const value = mkdtempSync(join(tmpdir(), 'oddbrain-chats-')); roots.push(value); return value }
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }) })
const chat = (id: string, content = 'hello'): Chat => ({ id, title: `Chat ${id}`, date: 'Today', messages: [{ id: `message-${id}`, role: 'user', content }] })

test('migrates valid renderer storage once and keeps its exact raw recovery strings', () => {
  const folder = root(), store = createChatStore(folder)
  expect(store.read()).toEqual({ initialized: false, revision: 0, chats: [], currentChat: '' })
  const chats = [chat('one')], rawChats = JSON.stringify(chats), rawCurrentChat = JSON.stringify('one')
  const moved = store.migrate({ chats, currentChat: 'one', rawChats, rawCurrentChat })
  expect(moved.migrated).toBe(true)
  expect(moved.snapshot).toMatchObject({ initialized: true, revision: 1, chats, currentChat: 'one' })
  const recovery = JSON.parse(readFileSync(join(folder, 'migration', 'legacy-local-storage.json'), 'utf8'))
  expect(recovery.rawChats).toBe(rawChats)
  expect(recovery.rawCurrentChat).toBe(rawCurrentChat)
  expect(JSON.parse(readFileSync(join(folder, 'index.previous.json'), 'utf8')).revision).toBe(1)

  const second = store.migrate({ chats: [chat('other')], currentChat: 'other', rawChats: JSON.stringify([chat('other')]), rawCurrentChat: JSON.stringify('other') })
  expect(second.migrated).toBe(false)
  expect(second.snapshot.chats).toEqual(chats)
})

test('writes immutable per-chat generations and keeps the untouched chat file', () => {
  const folder = root(), store = createChatStore(folder), initial = [chat('one'), chat('two')]
  store.migrate({ chats: initial, currentChat: 'one', rawChats: JSON.stringify(initial), rawCurrentChat: JSON.stringify('one') })
  const first = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8'))
  const next = [chat('one', 'changed'), initial[1]]
  const saved = store.write({ order: next.map(chat => chat.id), upserts: [next[0]], currentChat: 'two', expectedRevision: 1 })
  const second = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8'))
  expect(saved).toMatchObject({ revision: 2, chats: next, currentChat: 'two' })
  expect(second.items[1].file).toBe(first.items[1].file)
  expect(second.items[0].file).not.toBe(first.items[0].file)
  expect(JSON.parse(readFileSync(join(folder, 'index.previous.json'), 'utf8')).revision).toBe(1)

  const unchanged = store.write({ order: ['one', 'two'], upserts: [], currentChat: 'two', expectedRevision: 2 })
  expect(unchanged.revision).toBe(2)
  const removed = store.write({ order: ['one'], upserts: [], currentChat: 'two', expectedRevision: 2 })
  expect(removed).toMatchObject({ revision: 3, currentChat: '' })
  expect(removed.chats.map(chat => chat.id)).toEqual(['one'])
})

test('revision conflicts refuse stale replacement and return the current snapshot', () => {
  const folder = root(), store = createChatStore(folder), initial = [chat('one')]
  store.migrate({ chats: initial, currentChat: 'one', rawChats: JSON.stringify(initial), rawCurrentChat: JSON.stringify('one') })
  store.write({ order: ['one'], upserts: [chat('one', 'new')], currentChat: 'one', expectedRevision: 1 })
  try {
    store.write({ order: ['one'], upserts: [chat('one', 'stale')], currentChat: 'one', expectedRevision: 1 })
    throw Error('Expected a revision conflict')
  } catch (error) {
    expect((error as Error).message).toMatch(/another window/)
    expect((error as Error & { snapshot?: { chats: Chat[] } }).snapshot?.chats[0].messages[0].content).toBe('new')
  }
  expect(store.read().chats[0].messages[0].content).toBe('new')
})

test('a damaged newest index opens the previous complete snapshot and preserves damage on the next explicit edit', () => {
  const folder = root(), store = createChatStore(folder), initial = [chat('one')]
  store.migrate({ chats: initial, currentChat: 'one', rawChats: JSON.stringify(initial), rawCurrentChat: JSON.stringify('one') })
  store.write({ order: ['one'], upserts: [chat('one', 'second')], currentChat: 'one', expectedRevision: 1 })
  writeFileSync(join(folder, 'index.json'), '{damaged', 'utf8')
  const recovered = store.read()
  expect(recovered.revision).toBe(1)
  expect(recovered.chats[0].messages[0].content).toBe('hello')
  expect(recovered.notice).toMatch(/previous complete index/)

  const saved = store.write({ order: ['one'], upserts: [chat('one', 'owner edit after recovery')], currentChat: 'one', expectedRevision: 1 })
  expect(saved.revision).toBe(2)
  const recoveryFiles = readdirSync(join(folder, 'recovery'))
  expect(recoveryFiles).toHaveLength(1)
  expect(readFileSync(join(folder, 'recovery', recoveryFiles[0]), 'utf8')).toBe('{damaged')
})

test('damaged legacy JSON is refused without initializing or replacing it', () => {
  const folder = root(), store = createChatStore(folder)
  expect(() => store.migrate({ chats: [], currentChat: '', rawChats: '{damaged', rawCurrentChat: null })).toThrow()
  expect(store.read()).toEqual({ initialized: false, revision: 0, chats: [], currentChat: '' })
})
