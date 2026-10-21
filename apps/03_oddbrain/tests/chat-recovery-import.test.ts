// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CHAT_COUNT_LIMIT, createChatStore } from '../src/main/chats/store'
import { RECOVERY_CHAT_LIMIT, chatRecoveryDocument, parseChatRecoveryDocument } from '../src/main/chats/recovery'
import type { Chat } from '../src/shared/types'

const roots: string[] = []
const root = (): string => { const value = mkdtempSync(join(tmpdir(), 'oddbrain-chat-import-')); roots.push(value); return value }
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }) })
const chat = (id: string, content: string): Chat => ({ id, title: `Chat ${id}`, date: 'Today', messages: [{ id: `message-${id}`, role: 'user', content }] })
const recovery = (chats: Chat[], currentChat = chats[0]?.id || '') => parseChatRecoveryDocument(Buffer.from(chatRecoveryDocument({ chats, currentChat, rawChats: null, rawCurrentChat: null })))

test('only the bounded app recovery format is accepted', () => {
  expect(() => parseChatRecoveryDocument(Buffer.from('{"chats":[]}'))).toThrow(/not a supported OddBrain/)
  const duplicate = chat('same', 'one')
  const raw = JSON.parse(chatRecoveryDocument({ chats: [duplicate], currentChat: 'same', rawChats: null, rawCurrentChat: null }))
  raw.chats.push({ ...duplicate })
  expect(() => parseChatRecoveryDocument(Buffer.from(JSON.stringify(raw)))).toThrow(/duplicate chat identifiers/)
})

test('healthy import merges, skips repeats and keeps conflicting IDs as sourced copies', () => {
  const folder = root(), store = createChatStore(folder), original = chat('one', 'current words')
  store.migrate({ chats: [original], currentChat: 'one', rawChats: JSON.stringify([original]), rawCurrentChat: JSON.stringify('one') })
  const document = recovery([chat('one', 'recovered words'), chat('two', 'new words')], 'two')
  const plan = store.previewRecovery(document)
  expect(plan).toMatchObject({ repair: false, merge: { imported: 2, identical: 0, conflicts: 1 } })
  const saved = store.importRecovery(plan)
  expect(saved.currentChat).toBe('one')
  expect(saved.chats).toHaveLength(3)
  expect(saved.chats.find(item => item.id === 'one')?.messages[0].content).toBe('current words')
  const collision = saved.chats.find(item => item.recoveredFrom?.originalChatId === 'one')!
  expect(collision.id).not.toBe('one')
  expect(collision.title).toBe('Chat one')
  expect(collision.messages[0].content).toBe('recovered words')
  expect(saved.chats.find(item => item.id === 'two')?.recoveredFrom?.originalChatId).toBe('two')

  const repeated = store.previewRecovery(document)
  expect(repeated.merge).toMatchObject({ imported: 0, identical: 2, conflicts: 0 })
})

test('unreadable indexes are preserved before an explicitly reviewed recovery becomes active', () => {
  const folder = root(), store = createChatStore(folder), original = chat('old', 'old item remains')
  store.migrate({ chats: [original], currentChat: 'old', rawChats: JSON.stringify([original]), rawCurrentChat: JSON.stringify('old') })
  const oldItems = readdirSync(join(folder, 'items'))
  writeFileSync(join(folder, 'index.json'), '{damaged-current')
  writeFileSync(join(folder, 'index.previous.json'), '{damaged-previous')

  const plan = store.previewRecovery(recovery([chat('restored', 'safe copy')]))
  expect(plan.repair).toBe(true)
  const saved = store.importRecovery(plan)
  expect(saved.chats.map(item => item.id)).toEqual(['restored'])
  expect(readFileSync(join(folder, 'index.json'), 'utf8')).toContain('oddbrain-chats')
  const preserved = readdirSync(join(folder, 'recovery')).filter(name => name.startsWith('index-before-import-'))
  expect(preserved).toHaveLength(2)
  for (const item of oldItems) expect(readdirSync(join(folder, 'items'))).toContain(item)
})

test('live and recovery limits agree, and an explicitly reviewed empty export can repair unreadable indexes', () => {
  expect(CHAT_COUNT_LIMIT).toBe(RECOVERY_CHAT_LIMIT)
  const folder = root(), store = createChatStore(folder), original = chat('old', 'retained item')
  store.migrate({ chats: [original], currentChat: 'old', rawChats: JSON.stringify([original]), rawCurrentChat: JSON.stringify('old') })
  writeFileSync(join(folder, 'index.json'), '{damaged-current')
  writeFileSync(join(folder, 'index.previous.json'), '{damaged-previous')
  const plan = store.previewRecovery(recovery([]))
  expect(plan.repair).toBe(true)
  const saved = store.importRecovery(plan)
  expect(saved).toMatchObject({ initialized: true, chats: [], currentChat: '' })
  expect(readdirSync(join(folder, 'recovery')).filter(name => name.startsWith('index-before-import-'))).toHaveLength(2)
  expect(readdirSync(join(folder, 'items')).length).toBeGreaterThan(0)
})

test('a changed live store invalidates a reviewed import plan', () => {
  const folder = root(), store = createChatStore(folder), original = chat('one', 'current')
  store.migrate({ chats: [original], currentChat: 'one', rawChats: JSON.stringify([original]), rawCurrentChat: JSON.stringify('one') })
  const plan = store.previewRecovery(recovery([chat('two', 'recovered')]))
  store.write({ order: ['one'], upserts: [chat('one', 'changed after preview')], currentChat: 'one', expectedRevision: 1 })
  expect(() => store.importRecovery(plan)).toThrow(/changed while the recovery import was being reviewed/)
  expect(store.read().chats).toEqual([chat('one', 'changed after preview')])
})
