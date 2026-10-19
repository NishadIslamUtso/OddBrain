// Part 4 regression source — NOT RUN; implementation UNVERIFIED.
import { expect, test } from 'vitest'
import { chatMarkdown } from '../src/shared/lib/transcripts'
import { branchChat } from '../src/shared/lib/chatContext'
import type { Chat } from '../src/shared/types'
test('complete message/attachment/artifact text survives a revision snapshot and export', () => {
  const text = 'original '.repeat(10000)
  const chat: Chat = { id: 'parent', title: 'Original', messages: [{ id: 'm', role: 'user', content: text, attachments: [{ id: 'a', name: 'notes', text }], artifacts: [{ id: 'artifact', title: 'Page', type: 'html', versions: [{ content: text }, { content: '<p>new</p>' }] }] }] }
  let id = 0; const revision = branchChat(chat, 'm', () => `copy-${++id}`)
  chat.messages[0].content = 'edited'
  expect(revision.messages[0].content).toBe(text)
  const exported = chatMarkdown(revision)
  expect(exported).toContain(text); expect(exported).toContain('<p>new</p>'); expect(exported).toContain('version 2')
})
