// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'
import { matchingReadTrust, mayRememberRead, readTrustRules, rememberReadTrust, revokeReadTrust } from '../src/renderer/src/state/readTrust'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'

const settings = { ...DEFAULT_ENGINE, id: 'claude-code' as const, workspace: 'C:\\Owner\\Project' }
const read = { requestId: 'one', tool: 'Read', summary: 'C:\\Owner\\Project\\notes.md', file: 'C:\\Owner\\Project\\notes.md' }

beforeEach(() => localStorage.clear())

test('persists only an exact revocable read-only scope', () => {
  expect(rememberReadTrust(settings, read)).not.toBeNull()
  expect(matchingReadTrust(settings, read)?.summary).toBe(read.summary)
  expect(matchingReadTrust(settings, { ...read, summary: 'C:\\Owner\\Project\\other.md', file: 'C:\\Owner\\Project\\other.md' })).toBeUndefined()
  expect(matchingReadTrust({ ...settings, workspace: 'C:\\Other' }, read)).toBeUndefined()
  const [rule] = readTrustRules()
  revokeReadTrust(rule.id)
  expect(readTrustRules()).toEqual([])
})

test('commands and risky reads can never become remembered rules', () => {
  expect(mayRememberRead({ requestId: 'two', tool: 'Bash', summary: 'dir' })).toBe(false)
  expect(rememberReadTrust(settings, { requestId: 'two', tool: 'Bash', summary: 'dir' })).toBeNull()
  expect(rememberReadTrust(settings, { ...read, risk: 'loads executable configuration' })).toBeNull()
  expect(readTrustRules()).toEqual([])
})
