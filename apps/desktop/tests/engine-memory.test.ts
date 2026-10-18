import { describe, expect, it } from 'vitest'
import { buildMemoryOrder, safeMemoryRelative } from '../src/shared/lib/memory'

/**
 * The memory contract: one file, dated sections, never a rewrite; the pass
 * order is honest; and nothing outside the memory folder can be touched by
 * a name that came from outside. The guard takes the full vault-relative
 * path only — bare names are not memory.
 */
describe('auto memory', () => {
  it('the pass order names the file, the dated sections, and the no-rewrite promise', () => {
    const order = buildMemoryOrder()
    expect(order).toContain('06 Review/Memory/engine-notes.md')
    expect(order).toMatch(/## \d{4}-\d{2}-\d{2}/)
    expect(order).toContain('never delete or rewrite')
    expect(order).toContain('If there is truly nothing worth keeping, say so and write nothing.')
  })

  it('accepts exactly the memory folder and its files', () => {
    expect(safeMemoryRelative('06 Review/Memory/engine-notes.md')).toEqual({
      ok: true,
      rel: '06 Review/Memory/engine-notes.md',
    })
    expect(safeMemoryRelative('06 Review/Memory/notes.md')).toEqual({ ok: true, rel: '06 Review/Memory/notes.md' })
  })

  it('rejects bare names, escapes, hidden files, and non-markdown', () => {
    for (const bad of [
      'engine-notes.md', // the full path is required — nothing else counts
      '../settings.json',
      '06 Review/Memory/../../../.git/config',
      '06 Review/Memory/.hidden.md',
      '06 Review/Memory/notes.txt',
      '06 Review/Memory/',
      'C:\\Users\\x.md',
      '',
    ]) {
      const checked = safeMemoryRelative(bad)
      expect(checked.ok, bad).toBe(false)
    }
    expect(safeMemoryRelative('../settings.json')).toMatchObject({ ok: false })
  })
})
