import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTurnArchive } from '../src/main/turnArchive'
import { recoverRecordedTurns } from '../src/renderer/src/state/recovery'
import type { Transcript } from '../src/shared/lib/transcripts'
import type { Chat } from '../src/shared/types'
const roots: string[] = []
const folder = () => { const dir = mkdtempSync(join(tmpdir(), 'oddbrain-recovery-')); roots.push(dir); return dir }
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const chat = (id: string, extra: Partial<Chat> = {}): Chat => ({ id, title: 'Chat ' + id, date: 'Today', messages: [], ...extra })
const recorded = (chatId: string | undefined, text = 'SAVED ANSWER', at = ''): Transcript => {
  const archive = createTurnArchive(folder()), id = archive.begin({ chatId, prompt: 'Question', engine: 'agy', model: '', workspace: '/w', pictures: 0 })
  if (text) { archive.append(id, { kind: 'delta', text }); archive.append(id, { kind: 'done', text, alreadyDisplayed: true }) }
  const record = archive.read(id)
  if (at) record.header.at = at
  return record
}

test('a finished recorded turn missing from its saved chat is restored with the record’s own text', () => {
  const record = recorded('chat-a')
  const { chats, recovered } = recoverRecordedTurns([chat('chat-a')], [record])
  expect(recovered).toEqual([{ chatId: 'chat-a', transcriptId: record.header.id }])
  expect(chats[0].messages.map(message => message.role)).toEqual(['user', 'assistant'])
  expect(chats[0].messages[1].content).toBe('SAVED ANSWER')
  expect(chats[0].messages[0].nativeRecord?.transcriptId).toBe(record.header.id)
})

test('recovery is idempotent: the same record twice never duplicates a turn', () => {
  const record = recorded('chat-a')
  const once = recoverRecordedTurns([chat('chat-a')], [record]).chats
  const twice = recoverRecordedTurns(once, [record])
  expect(twice.recovered).toEqual([])
  expect(twice.chats[0].messages).toHaveLength(2)
})

test('turns for another chat, running turns, anonymous turns and missing chats are ignored', () => {
  const running = recorded('chat-a'); running.state = 'running'
  const anonymous = recorded(undefined)
  const forB = recorded('chat-b')
  const { chats, recovered } = recoverRecordedTurns([chat('chat-a')], [running, anonymous, forB])
  expect(recovered).toEqual([]); expect(chats[0].messages).toEqual([])
})

test('an older turn is not appended after newer messages, because that would reorder the chat', () => {
  const old = recorded('chat-a', 'OLD ANSWER', '2026-10-19T00:00:00.000Z')
  const existing = chat('chat-a', { messages: [{ id: 'later', role: 'assistant', content: 'NEWER ANSWER', timestamp: '2026-10-20T06:00:00.000Z' }] })
  const { chats, recovered } = recoverRecordedTurns([existing], [old])
  expect(recovered).toEqual([]); expect(chats[0].messages).toHaveLength(1)
})

test('a newer turn is placed even when the chat already has older messages', () => {
  const newer = recorded('chat-a', 'RECOVERED ANSWER', '2026-10-20T07:00:00.000Z')
  const existing = chat('chat-a', { messages: [{ id: 'older', role: 'assistant', content: 'OLDER ANSWER', timestamp: '2026-10-20T06:00:00.000Z' }] })
  const { chats, recovered } = recoverRecordedTurns([existing], [newer])
  expect(recovered).toHaveLength(1)
  expect(chats[0].messages.map(message => message.content)).toEqual(['OLDER ANSWER', 'Question', 'RECOVERED ANSWER'])
})

test('an interrupted record is restored as visibly stopped, never as a completed answer', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ chatId: 'chat-a', prompt: 'Question', engine: 'agy', model: '', workspace: '/w', pictures: 0 })
  archive.append(id, { kind: 'delta', text: 'PARTIAL' })
  // Reopening is what a restart sees: no live handle, no confirmed ending.
  const { chats } = recoverRecordedTurns([chat('chat-a')], [createTurnArchive(root).read(id)])
  expect(chats[0].messages[1]).toMatchObject({ content: 'PARTIAL', status: 'stopped' })
})

test('the per-start limit bounds how many turns are restored at once', () => {
  const records = Array.from({ length: 5 }, () => recorded('chat-a'))
  const { recovered } = recoverRecordedTurns([chat('chat-a')], records, 2)
  expect(recovered).toHaveLength(2)
})
