// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTurnArchive } from '../src/main/turnArchive'
import { recordNativeTranscript, recoverableTranscripts, recoveryNotice, RECOVERY_LIMIT } from '../src/shared/lib/nativeChat'
import type { Chat } from '../src/shared/types'

const roots: string[] = []
const folder = () => { const dir = mkdtempSync(join(tmpdir(), 'oddbrain-recovery-')); roots.push(dir); return dir }
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const input = { prompt: 'Explain the queue', engine: 'claude-code' as const, model: '', workspace: '/project', pictures: 0 }
const chat = (id: string): Chat => ({ id, title: id, date: 'Today', projectId: null, messages: [], updatedAt: 0 })

test('a turn the conversation never received is offered for recovery, once', () => {
  const entries = [
    { chatId: 'chat-a', id: '1700000000001-a' },
    { chatId: 'chat-a', id: '1700000000002-b' },
    { chatId: 'chat-missing', id: '1700000000003-c' },
    { id: '1700000000004-d' },
  ] as Parameters<typeof recoverableTranscripts>[0]
  const chats = [chat('chat-a')]
  expect(recoverableTranscripts(entries, chats).map(entry => entry.id)).toEqual(['1700000000001-a', '1700000000002-b'])
  // The same page twice, and a conversation that already holds the answer, prove it is idempotent.
  expect(recoverableTranscripts(entries, chats, 1).map(entry => entry.id)).toEqual(['1700000000001-a'])
  const withAnswer = [{ ...chats[0], messages: [{ id: '1700000000001-a:assistant' }] } as Chat]
  expect(recoverableTranscripts(entries, withAnswer).map(entry => entry.id)).toEqual(['1700000000002-b'])
  expect(recoveryNotice(2)).toContain('nothing was re-run, re-sent or completed')
  expect(recoveryNotice(1)).toContain('its conversation')
  expect(RECOVERY_LIMIT).toBe(8)
})

test('an interrupted turn is written back with its recorded text and stays marked interrupted', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ ...input, chatId: 'chat-a', userPrompt: 'Explain the queue' })
  archive.append(id, { kind: 'delta', text: 'The queue holds one prepared turn at a time' })
  // The app closes mid-turn: the file ends in a partial write and no answer was copied.
  appendFileSync(join(root, id + '.ndjson'), '{"event":{"kind":"delta","text":"TAIL')
  const record = archive.read(id)
  expect(record.state).toBe('interrupted'); expect(record.incomplete).toBe(true)
  const before: Chat = chat('chat-a')
  expect(recoverableTranscripts(archive.list().entries, [before]).map(entry => entry.id)).toEqual([id])
  const once = recordNativeTranscript(before, record), twice = recordNativeTranscript(once, record)
  expect(twice.messages).toHaveLength(2); expect(twice.messages[0].content).toBe('Explain the queue')
  expect(twice.messages[1].content).toContain('The queue holds one prepared turn at a time')
  expect(twice.messages[1].status).toBe('stopped')
  expect(twice.messages[1].nativeRecord?.transcriptId).toBe(id)
  // Now that the conversation holds it, the same page offers nothing again.
  expect(recoverableTranscripts(archive.list().entries, [twice])).toEqual([])
})

test('a clean finished turn is restored as complete, and another conversation’s record is never applied to this one', () => {
  const root = folder(), archive = createTurnArchive(root)
  const id = archive.begin({ ...input, chatId: 'chat-b', userPrompt: 'Say done' })
  archive.append(id, { kind: 'done', text: 'done' })
  const record = archive.read(id)
  expect(record.state).toBe('done')
  const restored = recordNativeTranscript(chat('chat-b'), record)
  expect(restored.messages[1].status).toBe('complete'); expect(restored.messages[1].content).toBe('done')
  expect(() => recordNativeTranscript(chat('chat-a'), record)).toThrow(/different conversation/)
})
