// NOT RUN. Parent-owned attachment acknowledgement still needs coordinator coverage.
import { expect, test } from 'vitest'
import { draftLease, replaceDraft, looksLikeNativeSlashCommand } from '../src/shared/lib/chatDraft'
test('file-picker leases expire on send/scope change and newer requests', () => {
  const lease = draftLease(), first = lease.begin(); lease.invalidate(); expect(lease.current(first)).toBe(false)
  const second = lease.begin(), third = lease.begin(); expect(lease.current(second)).toBe(false); expect(lease.current(third)).toBe(true)
})
test('same-text different-chat and changed-text same-chat editor callbacks cannot replace a newer draft', () => {
  expect(() => replaceDraft({ scope: 'new-chat', text: 'same' }, { scope: 'old-chat', text: 'same' }, 'edited')).toThrow()
  expect(() => replaceDraft({ scope: 'chat', text: 'new' }, { scope: 'chat', text: 'old' }, 'edited')).toThrow()
  expect(replaceDraft({ scope: 'chat', text: 'old' }, { scope: 'chat', text: 'old' }, 'edited')).toBe('edited')
})

test('native slash syntax cannot silently fall through as an ordinary prompt', () => {
  expect(looksLikeNativeSlashCommand('/compact now')).toBe(true)
  expect(looksLikeNativeSlashCommand('  /unknown-action')).toBe(true)
  expect(looksLikeNativeSlashCommand('Please explain /compact')).toBe(false)
  expect(looksLikeNativeSlashCommand('/home/person/file.txt')).toBe(false)
})
