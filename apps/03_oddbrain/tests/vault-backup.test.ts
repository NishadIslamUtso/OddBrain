import { afterEach, expect, test, vi } from 'vitest'
import * as fs from 'node:fs'
vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>() }))
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupVault, restoreVault } from '../src/main/vault/backup'
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const path of roots.splice(0)) fs.rmSync(path, { recursive: true, force: true }) })
function setup() { const parent = fs.mkdtempSync(join(tmpdir(), 'ob-backup-')); roots.push(parent); const source = join(parent, 'vault'); fs.mkdirSync(source); fs.writeFileSync(join(source, 'hello.md'), 'original'); return { parent, source, backup: join(parent, 'backup'), restored: join(parent, 'restored') } }
test('does not reuse or remove an existing restore destination', () => {
  const h = setup(); expect(backupVault(h.source, h.backup).ok).toBe(true)
  fs.mkdirSync(h.restored); fs.writeFileSync(join(h.restored, 'mine.txt'), 'keep me')
  expect(restoreVault(h.backup, h.restored).ok).toBe(false)
  expect(fs.readFileSync(join(h.restored, 'mine.txt'), 'utf8')).toBe('keep me')
})
test('refuses linked source directories instead of silently skipping their contents', () => {
  const h = setup(), other = join(h.parent, 'elsewhere'); fs.mkdirSync(other)
  fs.symlinkSync(other, join(h.source, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
  expect(backupVault(h.source, h.backup).ok).toBe(false); expect(fs.existsSync(h.backup)).toBe(false)
})
test('a destination disk failure removes only the incomplete copy', () => {
  const h = setup(); vi.spyOn(fs, 'writeSync').mockImplementation(() => { throw Error('Disk full') })
  const reply = backupVault(h.source, h.backup)
  expect(reply.ok).toBe(false); expect(fs.existsSync(h.backup)).toBe(false)
  expect(fs.readFileSync(join(h.source, 'hello.md'), 'utf8')).toBe('original')
})
test('changing source bytes while copying cannot produce a successful backup', () => {
  const h = setup(), read = fs.readSync; let changed = false
  vi.spyOn(fs, 'readSync').mockImplementation(((...args: any[]) => { const n = (read as any)(...args); if (!changed) { changed = true; fs.writeFileSync(join(h.source, 'hello.md'), 'new data after read') } return n }) as any)
  expect(backupVault(h.source, h.backup).ok).toBe(false); expect(fs.existsSync(h.backup)).toBe(false)
})
test('streams a source above the former attachment-size ceilings without clipping it', () => {
  const h = setup(), large = join(h.source, 'large-source.bin'), bytes = 70 * 1024 * 1024
  fs.writeFileSync(large, ''); fs.truncateSync(large, bytes)
  const made = backupVault(h.source, h.backup); expect(made).toMatchObject({ ok: true, bytes: bytes + 8 })
  const restored = restoreVault(h.backup, h.restored); expect(restored).toMatchObject({ ok: true, bytes: bytes + 8 })
  expect(fs.statSync(join(h.restored, 'large-source.bin')).size).toBe(bytes)
})
test('restore rejects extra unmanifested files and duplicate or drive-letter entries', () => {
  const h = setup(); expect(backupVault(h.source, h.backup).ok).toBe(true)
  fs.writeFileSync(join(h.backup, 'data', 'surprise.txt'), 'not recorded')
  expect(restoreVault(h.backup, h.restored).ok).toBe(false)
  fs.rmSync(join(h.backup, 'data', 'surprise.txt'))
  const path = join(h.backup, 'oddbrain-backup.json'), m = JSON.parse(fs.readFileSync(path, 'utf8'))
  m.files.push(m.files[0]); fs.writeFileSync(path, JSON.stringify(m)); expect(restoreVault(h.backup, h.restored).ok).toBe(false)
  m.files = [ { ...m.files[0], path: 'C:/outside.md' } ]; fs.writeFileSync(path, JSON.stringify(m)); expect(restoreVault(h.backup, h.restored).ok).toBe(false)
  expect(fs.existsSync(h.restored)).toBe(false)
})
