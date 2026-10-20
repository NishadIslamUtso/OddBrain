import { expect, test, vi } from 'vitest'
import { insertFileMentions } from '../src/shared/lib/fileMentions'
import { restartIdleConnection } from '../src/main/engine/restart'
test('file mentions preserve drafts and quote paths as data, not executable shell lines', () => {
  const paths = ['C:\\Work & notes\\a.txt', '/project/$(danger).md']
  const text = insertFileMentions('Please inspect @', paths)
  expect(text).toContain('Please inspect '); expect(text).not.toContain('inspect @')
  expect(text).toContain(JSON.stringify(paths, null, 2)); expect(text).toContain('paths only')
  expect(insertFileMentions('email@example.com', [])).toBe('email@example.com')
})
test('invalid file lists refuse rather than clipping paths or silently dropping files', () => {
  expect(() => insertFileMentions('keep', ['bad\npath'])).toThrow('Nothing was inserted')
  expect(() => insertFileMentions('keep', Array(51).fill('path'))).toThrow()
})
test('connection restart refuses in-flight or dispatching work; idle restart preserves resume storage', () => {
  const stop = vi.fn(), fresh = vi.fn()
  expect(restartIdleConnection({ turnBusy: () => true, stop }, false).ok).toBe(false)
  expect(restartIdleConnection({ turnBusy: () => false, stop }, true).ok).toBe(false)
  expect(stop).not.toHaveBeenCalled()
  expect(restartIdleConnection({ turnBusy: () => false, stop, fresh } as any, false).ok).toBe(true)
  expect(stop).toHaveBeenCalledTimes(1); expect(fresh).not.toHaveBeenCalled()
})
