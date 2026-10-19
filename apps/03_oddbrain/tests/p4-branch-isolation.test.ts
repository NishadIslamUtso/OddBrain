// NOT RUN; no native-session acceptance claimed.
import { expect, test } from 'vitest'
import { branchChat } from '../src/shared/lib/chatContext'
import type { Chat } from '../src/shared/types'
const source = (): Chat => ({ id: 'parent', title: 'Conversation', projectId: 'p', messages: [{ id: 'a', role: 'assistant', content: 'partial failure', status: 'error', error: 'offline', artifacts: [{ id: 'art', type: 'html', title: 'draft', versions: [{ content: 'original' }] }] }, { id: 'b', role: 'user', content: 'later' }] })
test('branch clones nested revisions and identifiers, never recasts errors as successful text', () => {
  const original = source(); let i = 0
  const next = branchChat(original, 'a', () => `new-${++i}`)
  expect(next.messages).toHaveLength(1); expect(next.messages[0].status).toBe('error'); expect(next.messages[0].error).toBe('offline')
  next.messages[0].artifacts![0].versions[0].content = 'changed'
  expect(original.messages[0].artifacts![0].versions[0].content).toBe('original')
  expect(next.messages[0].artifacts![0].id).not.toBe('art'); expect(next.messages[0].id).not.toBe('a')
  expect(next.branchedFrom?.messageId).toBe('a'); expect(next.projectId).toBe('p')
  expect('nativeSessionId' in next).toBe(false)
})
test('missing or live branch points are refused, not silently replaced with the last message', () => {
  expect(() => branchChat(source(), 'missing', () => 'x')).toThrow()
  const live = source(); live.messages[0].status = 'streaming'
  expect(() => branchChat(live, 'a', () => 'x')).toThrow('Stop or finish')
})
