import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVaultReader, saveVaultFolder } from '../src/main/vault'
import { resolveNoteLinks } from '../src/renderer/src/lib/links'
import type { VaultFile } from '../src/shared/desktop'

const directories: string[] = []
async function temp() {
  const directory = await mkdtemp(join(tmpdir(), 'oddbrain-vault-'))
  directories.push(directory)
  return directory
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('read-only folder boundary', () => {
  it('requires an explicitly selected folder and lists only readable Markdown', async () => {
    const folder = await temp()
    const reader = createVaultReader(() => '')
    expect(await reader.list()).toMatchObject({
      ok: false,
      error: expect.stringContaining('Choose a folder'),
    })
    await mkdir(join(folder, 'Notes'))
    await writeFile(join(folder, 'Notes', 'A.md'), 'hello [[B]]')
    await writeFile(join(folder, 'Notes', 'too-big.md'), 'x'.repeat(129 * 1024))
    await writeFile(join(folder, 'secret.txt'), 'secret')
    await writeFile(join(folder, '.hidden.md'), 'not listed')
    const selected = createVaultReader(() => folder)
    const list = await selected.list()
    expect(list).toMatchObject({
      ok: true,
      truncated: false,
      files: [{ path: 'Notes/A.md', content: 'hello [[B]]' }],
    })
    expect(await selected.read('Notes/A.md')).toEqual({ ok: true, content: 'hello [[B]]' })
    expect(await selected.read('secret.txt')).toMatchObject({ ok: false })
    expect(await selected.read('Notes/too-big.md')).toMatchObject({ ok: false })
  })

  it('refuses traversal, absolute paths and any path outside the chosen folder', async () => {
    const folder = await temp()
    const other = await temp()
    await writeFile(join(folder, 'Inside.md'), 'mine')
    await writeFile(join(other, 'Outside.md'), 'outside')
    const reader = createVaultReader(() => folder)
    for (const path of [
      '../Outside.md',
      `${other}/Outside.md`,
      'Inside.md/../Outside.md',
      '..\\Outside.md',
      '',
      'Inside.md\0',
    ]) {
      expect(await reader.read(path)).toMatchObject({ ok: false })
    }
    expect(await reader.read('Inside.md')).toEqual({ ok: true, content: 'mine' })
  })

  it('does not follow symlinked files or directories into another tree', async () => {
    if (process.platform === 'win32') return // Windows CI may not grant the symlink privilege; traversal is covered above.
    const folder = await temp()
    const outside = await temp()
    await writeFile(join(outside, 'Private.md'), 'do not leak')
    await symlink(join(outside, 'Private.md'), join(folder, 'Link.md'))
    await symlink(outside, join(folder, 'LinkedFolder'))
    const reader = createVaultReader(() => folder)
    expect(await reader.read('Link.md')).toMatchObject({ ok: false })
    expect(await reader.read('LinkedFolder/Private.md')).toMatchObject({ ok: false })
    expect(await reader.list()).toMatchObject({ ok: true, files: [] })
  })

  it('stores only a valid selected folder without writing to the vault', async () => {
    const folder = await temp()
    const preferences = join(await temp(), 'new-app-data', 'folder.txt')
    await writeFile(join(folder, 'Keep.md'), 'untouched')
    await saveVaultFolder(preferences, folder)
    expect(await readFile(preferences, 'utf8')).toBe(folder)
    expect(await readFile(join(folder, 'Keep.md'), 'utf8')).toBe('untouched')
    await expect(saveVaultFolder(preferences, join(folder, 'not-a-folder'))).rejects.toThrow()
    expect(await readFile(preferences, 'utf8')).toBe(folder)
  })
})

describe('derived graph links', () => {
  it('draws only unambiguous resolved links, collapsing reciprocals', () => {
    const files: VaultFile[] = [
      {
        path: 'a/Index.md',
        bytes: 1,
        modified: '2026-10-18T00:00:00Z',
        content: '[[Target]] [[Missing]] [[Shared]]',
      },
      { path: 'a/Target.md', bytes: 1, modified: '2026-10-18T00:00:00Z', content: '[[Index]]' },
      { path: 'b/Shared.md', bytes: 1, modified: '2026-10-18T00:00:00Z', content: '' },
      { path: 'c/Shared.md', bytes: 1, modified: '2026-10-18T00:00:00Z', content: '' },
    ]
    expect(resolveNoteLinks(files)).toEqual({
      edges: [{ from: 'a/Index.md', to: 'a/Target.md' }],
      checked: 4,
      dead: 1,
      ambiguous: 1,
    })
  })
})
