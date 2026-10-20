// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChatStore } from '../src/main/chats/store'
import { chatRecoveryDocument } from '../src/main/chats/recovery'
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

test('streams large active-chat edits as immutable deltas and reconstructs them after restart', () => {
  const folder = root(), store = createChatStore(folder), initial = chat('active', `start-${'a'.repeat(20_000)}-end`)
  store.migrate({ chats: [initial], currentChat: 'active', rawChats: JSON.stringify([initial]), rawCurrentChat: JSON.stringify('active') })
  const first = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8')).items[0]
  const original = initial.messages[0].content
  const changed = chat('active', `${original.slice(0, 10_000)}বাংলা🙂${original.slice(10_020)}`)
  store.write({ order: ['active'], upserts: [changed], currentChat: 'active', expectedRevision: 1 })
  const second = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8')).items[0]
  expect(second.depth).toBe(1)
  expect(second.file).toMatch(/\.delta\.json$/)
  expect(second.fileBytes).toBeLessThan(second.bytes)
  const delta = JSON.parse(readFileSync(join(folder, 'items', second.file), 'utf8'))
  expect(delta.previous.file).toBe(first.file)
  expect(createChatStore(folder).read().chats).toEqual([changed])
})

test('a damaged newest delta falls back to the previous complete immutable chain', () => {
  const folder = root(), store = createChatStore(folder), initial = chat('active', 'a'.repeat(20_000))
  store.migrate({ chats: [initial], currentChat: 'active', rawChats: JSON.stringify([initial]), rawCurrentChat: JSON.stringify('active') })
  const changed = chat('active', `${initial.messages[0].content}!`)
  store.write({ order: ['active'], upserts: [changed], currentChat: 'active', expectedRevision: 1 })
  const head = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8')).items[0].file
  writeFileSync(join(folder, 'items', head), '{damaged delta', 'utf8')
  const recovered = createChatStore(folder).read()
  expect(recovered.revision).toBe(1)
  expect(recovered.chats).toEqual([initial])
  expect(recovered.notice).toMatch(/previous complete index/)
})

test('delta depth compacts to a new snapshot and cleans records no complete index needs', () => {
  const folder = root(), store = createChatStore(folder)
  let content = 'a'.repeat(10_000), value = chat('active', content)
  store.migrate({ chats: [value], currentChat: 'active', rawChats: JSON.stringify([value]), rawCurrentChat: JSON.stringify('active') })
  for (let index = 0; index < 66; index++) {
    content += String(index % 10); value = chat('active', content)
    store.write({ order: ['active'], upserts: [value], currentChat: 'active', expectedRevision: index + 1 })
  }
  const item = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8')).items[0]
  expect(item.depth).toBe(1)
  expect(readdirSync(join(folder, 'items')).filter(name => /\.(?:delta\.)?json$/.test(name))).toHaveLength(2)
  expect(createChatStore(folder).read().chats).toEqual([value])
})

test('reads version-one full snapshots and upgrades only on the next real edit', () => {
  const folder = root(), value = chat('legacy', 'kept exactly'), text = JSON.stringify(value)
  const hash = createHash('sha256').update(text).digest('hex'), idHash = createHash('sha256').update(value.id).digest('hex')
  const file = `${idHash}-${hash}.json`
  mkdirSync(join(folder, 'items'), { recursive: true })
  writeFileSync(join(folder, 'items', file), text)
  writeFileSync(join(folder, 'index.json'), `${JSON.stringify({ format: 'oddbrain-chats', version: 1, revision: 7, currentChat: value.id, items: [{ id: value.id, file, sha256: hash, bytes: Buffer.byteLength(text) }] }, null, 2)}\n`)
  const store = createChatStore(folder)
  expect(store.read()).toMatchObject({ revision: 7, chats: [value], currentChat: value.id })
  const changed = chat('legacy', 'still exact after upgrade')
  store.write({ order: [value.id], upserts: [changed], currentChat: value.id, expectedRevision: 7 })
  expect(JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8')).version).toBe(2)
  expect(JSON.parse(readFileSync(join(folder, 'index.previous.json'), 'utf8')).version).toBe(1)
  expect(createChatStore(folder).read().chats).toEqual([changed])
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

test('recovery export keeps visible chats and exact legacy bytes without changing the store', () => {
  const visible = [chat('visible', 'unsaved words')], rawChats = '{damaged legacy bytes'
  const document = JSON.parse(chatRecoveryDocument({ chats: visible, currentChat: 'visible', rawChats, rawCurrentChat: '"visible"' }))
  expect(document).toMatchObject({ format: 'oddbrain-chat-recovery-export', version: 1, chats: visible, currentChat: 'visible', legacy: { rawChats, rawCurrentChat: '"visible"' } })
  expect(document.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
})

test('recovery export remains available when the visible library just exceeds the live chat-count limit', () => {
  const visible = Array.from({ length: 20_001 }, (_, index): Chat => ({ id: `recovery-${index}`, title: `Recovery ${index}`, date: 'Today', messages: [] }))
  const document = JSON.parse(chatRecoveryDocument({ chats: visible, currentChat: 'recovery-20000', rawChats: null, rawCurrentChat: null }))
  expect(document.chats).toHaveLength(20_001)
  expect(document.currentChat).toBe('recovery-20000')
})
