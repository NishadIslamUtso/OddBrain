// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest'
import { loadReadTrust } from '../src/renderer/src/state/readTrust'

const KEY = 'oddbrain:read-trust:v1'
beforeEach(() => localStorage.clear())

test('hands legacy rules to main verbatim and removes the renderer copy only after success', async () => {
  const raw = '[ { "scope": "C:\\\\work\\\\notes.txt" } ]'
  localStorage.setItem(KEY, raw)
  const migrateLegacy = vi.fn().mockResolvedValue({ ok: true, answer: 'Migrated.', view: { rules: [] } })
  const result = await loadReadTrust({ migrateLegacy, list: vi.fn(), approve: vi.fn(), revoke: vi.fn() })
  expect(migrateLegacy).toHaveBeenCalledExactlyOnceWith(raw)
  expect(result.notice).toBe('Migrated.')
  expect(localStorage.getItem(KEY)).toBeNull()
})

test('retains the exact renderer copy when main-process migration refuses', async () => {
  const raw = '{damaged'
  localStorage.setItem(KEY, raw)
  const api = { migrateLegacy: vi.fn().mockResolvedValue({ ok: false, answer: 'Exact recovery retained.' }), list: vi.fn(), approve: vi.fn(), revoke: vi.fn() }
  await expect(loadReadTrust(api)).rejects.toThrow('Exact recovery retained.')
  expect(localStorage.getItem(KEY)).toBe(raw)
})
