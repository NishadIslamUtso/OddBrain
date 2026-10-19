import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const io = vi.hoisted(() => ({ flags: new Map<number, string | number>(), fail: false, flushed: [] as Array<string | number> }))
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => { const fd = actual.openSync(...args); io.flags.set(fd, args[1]); return fd },
    closeSync: (fd: number) => { try { actual.closeSync(fd) } finally { io.flags.delete(fd) } },
    fsyncSync: (fd: number) => {
      const flags = io.flags.get(fd)
      if (io.fail || flags === 'r' || (typeof flags === 'number' && !(flags & (actual.constants.O_WRONLY | actual.constants.O_RDWR)))) throw Object.assign(Error('Flush requires a writable handle'), { code: 'EPERM' })
      io.flushed.push(flags!); actual.fsyncSync(fd)
    },
  }
})
import { createSessionMemory } from '../src/main/engine/sessionMemory'
const roots: string[] = []
afterEach(() => { io.fail = false; io.flags.clear(); io.flushed.length = 0; roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
const fixture = () => { const root = mkdtempSync(join(tmpdir(), 'oddbrain-session-flush-')); roots.push(root); const file = join(root, 'sessions.json'); return { root, file, memory: createSessionMemory(file) } }
test('session IDs are synced using the exclusive writable descriptor, including Windows semantics', () => {
  const { memory } = fixture()
  memory.save('claude-code::/work', 'complete-native-id')
  expect(memory.load('claude-code::/work')).toBe('complete-native-id')
  expect(io.flushed).toEqual(['wx']); expect(io.flags.size).toBe(0)
})
test('a real sync failure is not ignored or allowed to replace the original index', () => {
  const { memory, file, root } = fixture()
  memory.save('claude-code::/work', 'original-id'); const original = readFileSync(file)
  io.fail = true
  expect(() => memory.save('claude-code::/work', 'replacement-id')).toThrow(/writable handle/)
  expect(readFileSync(file)).toEqual(original)
  expect(readdirSync(root)).toEqual(['sessions.json']); expect(io.flags.size).toBe(0)
})
