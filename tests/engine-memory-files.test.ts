import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createMemoryManager } from '../src/main/memoryFiles'

/**
 * The reader is real filesystem work against a real vault root: nothing
 * remembered yet is honest, listing shows content with a clip flag, and a
 * removal is exactly one file — and never outside the memory folder.
 */
describe('memory file reader', () => {
  const root = mkdtempSync(join(tmpdir(), 'memory-vault-'))
  const manager = createMemoryManager(() => root)
  mkdirSync(join(root, '06 Review', 'Memory'), { recursive: true })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('an empty vault reads as nothing remembered, with the folder named', async () => {
    const answer = await manager.list()
    expect(answer.ok).toBe(true)
    expect(answer.files).toEqual([])
    expect(answer.folder.replace(/\\/g, '/')).toContain('06 Review/Memory')
  })

  it('lists a real file with content, path, and updated time', async () => {
    const file = join(root, '06 Review', 'Memory', 'engine-notes.md')
    writeFileSync(file, '## 2026-10-16\n- The vault is the home for memory.\n', 'utf8')
    utimesSync(file, new Date(), new Date('2026-10-16T09:30:00Z'))
    const answer = await manager.list()
    expect(answer.files).toHaveLength(1)
    const shown = answer.files![0]
    expect(shown.name).toBe('engine-notes.md')
    expect(shown.path).toBe('06 Review/Memory/engine-notes.md')
    expect(shown.content).toContain('The vault is the home for memory.')
    expect(shown.clipped).toBe(false)
    expect(shown.updated).toContain('2026-10-16')
  })

  it('removes exactly the named file, then reads as gone', async () => {
    const other = join(root, '06 Review', 'Memory', 'keep.md')
    writeFileSync(other, '- keep me\n', 'utf8')
    const answer = await manager.remove('06 Review/Memory/engine-notes.md')
    expect(answer.ok).toBe(true)
    await expect(manager.read('06 Review/Memory/engine-notes.md')).resolves.toMatchObject({ ok: false })
    expect(await manager.read('06 Review/Memory/keep.md')).toMatchObject({ ok: true })
  })

  it('a symlink inside the memory folder is not memory: skipped in lists, refused on read', async () => {
    const { symlinkSync, writeFileSync } = await import('node:fs')
    const secret = join(root, 'secret.md')
    writeFileSync(secret, 'outside the memory folder', 'utf8')
    try {
      symlinkSync(secret, join(root, '06 Review', 'Memory', 'leak.md'))
    } catch {
      return // this filesystem denies symlinks; the guard is still pinned below
    }
    const listed = await manager.list()
    expect(listed.files?.some(file => file.name === 'leak.md')).toBe(false)
    await expect(manager.read('06 Review/Memory/leak.md')).resolves.toMatchObject({ ok: false })
  })

  it('refuses names outside the memory folder before touching anything', async () => {
    const answer = await manager.remove('../settings.json')
    expect(answer.ok).toBe(false)
  })
})
