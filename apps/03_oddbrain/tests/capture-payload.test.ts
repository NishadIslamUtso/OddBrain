import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import type { Chat, Message } from '../src/shared/types'
import { conversationCapture } from '../src/shared/lib/capture'
import { startLocalApi } from '../src/main/api/server'
import { createVaultService } from '../src/main/vault/service'

/**
 * What the app tells the vault about a conversation, and whether the vault keeps it.
 *
 * Two halves, and the second is the point of the first: the payload is built by
 * the interface and accepted by the vault, so this file runs one into the other
 * over the real local API and checks the file that comes out. That is the chain
 * `capture()` in useChat depends on — before this, `capture()` was a function
 * nobody passed, and conversations were only ever in local storage.
 */

const NOW = new Date('2026-10-10T19:00:00Z')

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  role: 'user',
  content: 'hello',
  status: 'complete',
  at: '2026-10-10T18:00:00Z',
  ...over,
})

const chat = (over: Partial<Chat> = {}): Chat => ({
  id: 'chat-1',
  title: 'A conversation worth keeping',
  messages: [
    message(),
    message({ id: 'm2', role: 'assistant', content: 'hello back', at: '2026-10-10T18:01:00Z' }),
  ],
  ...over,
})

test('a finished conversation is captured as full, with its timestamps kept', () => {
  const payload = conversationCapture(chat(), { now: NOW })
  assert.equal(payload.type, 'conversation')
  assert.equal(payload.provider, 'OddBrain')
  assert.equal(payload.conversation_id, 'chat-1')
  assert.equal(payload.title, 'A conversation worth keeping')
  assert.equal(payload.captured_at, NOW.toISOString())
  assert.equal(payload.completeness, 'full')
  assert.deepEqual(
    payload.messages.map(m => [m.role, m.text, m.timestamp]),
    [
      ['user', 'hello', '2026-10-10T18:00:00Z'],
      ['assistant', 'hello back', '2026-10-10T18:01:00Z'],
    ]
  )
})

test('a stopped or failed conversation is captured as partial, not tidied up', () => {
  for (const status of ['stopped', 'error'] as const) {
    const payload = conversationCapture(
      chat({ messages: [message(), message({ id: 'm2', role: 'assistant', content: 'half…', status })] }),
      { now: NOW }
    )
    assert.equal(payload.completeness, 'partial', status)
    assert.equal(payload.messages[1].status, status, 'the status is recorded, not corrected')
    assert.equal(payload.messages[1].text, 'half…', 'the partial answer is kept as it was')
  }
})

test('thinking and vault context travel with the turn they belong to', () => {
  const payload = conversationCapture(
    chat({
      messages: [
        message(),
        message({
          id: 'm2',
          role: 'assistant',
          content: 'answer',
          thinking: 'weighing two options',
          context: 'vault excerpt used as source data',
        }),
      ],
    }),
    { now: NOW }
  )
  assert.equal(payload.messages[1].thinking, 'weighing two options')
  assert.equal(payload.messages[1].context, 'vault excerpt used as source data')
})

test('sent attachments are carried as files, and only four are filed per message', () => {
  const attachments = Array.from({ length: 6 }, (_, i) => ({
    id: `f${i}`,
    name: `file-${i}.png`,
    kind: 'image' as const,
    mime: 'image/png',
    data: Buffer.from(`image-${i}`).toString('base64'),
  }))
  const payload = conversationCapture(chat({ messages: [message({ attachments })] }), { now: NOW })
  assert.equal(payload.messages[0].attachments?.length, 4, 'the vault accepts four files per message')
  assert.equal(payload.completeness, 'partial', 'what was left behind is recorded, not hidden')

  const text = conversationCapture(
    chat({ messages: [message({ attachments: [{ id: 'f1', name: 'notes.md', kind: 'text', text: 'body' }] })] }),
    { now: NOW }
  )
  assert.deepEqual(text.messages[0].attachments, [{ id: 'f1', name: 'notes.md', kind: 'text', text: 'body' }])
  assert.equal(text.completeness, 'full')
})

test('an attachment with no bytes and no text is not sent as an empty file', () => {
  const payload = conversationCapture(
    chat({ messages: [message({ attachments: [{ id: 'f1', name: 'broken.png', kind: 'image' }] })] }),
    { now: NOW }
  )
  assert.equal(payload.messages[0].attachments, undefined)
  assert.equal(payload.completeness, 'full', 'nothing was left behind, so nothing is claimed')
})

test('the payload the interface builds is the file the vault writes', async t => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-capture-'))
  const api = await startLocalApi({
    port: 0,
    ollamaUrl: 'http://127.0.0.1:9',
    vault: createVaultService({ vaultPath: root, clock: () => NOW }),
  })
  t.after(async () => {
    await api.close()
    rmSync(root, { recursive: true, force: true })
  })

  const payload = conversationCapture(
    chat({
      messages: [
        message({ content: 'keep this question' }),
        message({
          id: 'm2',
          role: 'assistant',
          content: 'keep this answer',
          thinking: 'hidden reasoning',
          attachments: [{ id: 'f1', name: 'notes.md', kind: 'text', text: 'attached words' }],
        }),
      ],
    }),
    { now: NOW }
  )

  const response = await fetch(`${api.url}/api/vault/capture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = (await response.json()) as { ok: boolean; source: string }
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)

  const file = join(root, body.source)
  assert.equal(existsSync(file), true)
  const text = readFileSync(file, 'utf8')
  assert.match(text, /keep this question/)
  assert.match(text, /keep this answer/)
  assert.match(text, /hidden reasoning/)
  assert.match(text, /A conversation worth keeping/)
  assert.match(text, /completeness: full/)
  assert.match(text, /notes\.md.*02 Sources\/Attachments/)

  // The attachment file itself is beside the conversation, not just referenced.
  assert.match(text, /02 Sources\/Attachments\/f1-[0-9a-f]+\.txt/)
  const attachment = text.match(/02 Sources\/Attachments\/f1-[0-9a-f]+\.txt/)?.[0] || ''
  assert.equal(readFileSync(join(root, attachment), 'utf8'), 'attached words')

  // The vault logged the write where the user can see it.
  assert.match(readFileSync(join(root, '09 Activity & Undo/2026/10.md'), 'utf8'), /captured: conversation/)
})
