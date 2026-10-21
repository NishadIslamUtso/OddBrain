import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { appDataBackupExclusions, createAppDataBackup, restoreAppDataBackup } from '../src/main/appDataBackup'

const roots: string[] = []
const temp = (): string => { const value = mkdtempSync(join(tmpdir(), 'oddbrain-app-backup-')); roots.push(value); return value }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

test('app-data backup includes selected owner domains, excludes authority secrets, and verifies a separate restore', () => {
  const parent = temp(), live = join(parent, 'live'), backup = join(parent, 'backup'), restored = join(parent, 'restored')
  mkdirSync(join(live, 'chats-v1'), { recursive: true }); mkdirSync(join(live, 'working-notes-v1'), { recursive: true })
  writeFileSync(join(live, 'chats-v1', 'chat.json'), 'exact chat')
  writeFileSync(join(live, 'working-notes-v1', 'notes.json'), 'exact notes')
  writeFileSync(join(live, 'keys.json'), 'SECRET-KEY')
  writeFileSync(join(live, 'extension-pair.json'), 'PAIRING-SECRET')
  writeFileSync(join(live, 'engine-sessions.json'), 'SESSION-SECRET')
  writeFileSync(join(live, 'engine-journal.json'), 'NATIVE-SESSION-ID')
  const made = createAppDataBackup(live, backup, { 'oddbrain.look.v2': '{"theme":"paper"}' })
  expect(made.files).toBe(3)
  expect(() => readFileSync(join(backup, 'data', 'keys.json'))).toThrow()
  expect(() => readFileSync(join(backup, 'data', 'engine-journal.json'))).toThrow()
  expect(JSON.parse(readFileSync(join(backup, 'oddbrain-app-data-backup.json'), 'utf8')).excluded.join(' ')).toContain('credentials')
  const copy = restoreAppDataBackup(backup, restored)
  expect(copy.files).toBe(3)
  expect(readFileSync(join(restored, 'chats-v1', 'chat.json'), 'utf8')).toBe('exact chat')
  expect(JSON.parse(readFileSync(join(restored, 'renderer-preferences.json'), 'utf8'))['oddbrain.look.v2']).toContain('paper')
  expect(appDataBackupExclusions().join(' ')).toContain('installed engines/models')
})

test('streams a large private Attachment Center source through verified app-data backup and restore', () => {
  const parent = temp(), live = join(parent, 'live'), backup = join(parent, 'backup'), restored = join(parent, 'restored'), relative = join('attachment-center', 'originals', 'fixture', 'large.bin'), bytes = 70 * 1024 * 1024
  mkdirSync(join(live, 'attachment-center', 'originals', 'fixture'), { recursive: true }); writeFileSync(join(live, relative), ''); truncateSync(join(live, relative), bytes)
  expect(createAppDataBackup(live, backup, {}).bytes).toBe(bytes + 2)
  expect(restoreAppDataBackup(backup, restored).bytes).toBe(bytes + 2)
  expect(statSync(join(restored, relative)).size).toBe(bytes)
})
test('tampered backup refuses restore and leaves no destination', () => {
  const parent = temp(), live = join(parent, 'live'), backup = join(parent, 'backup'), restored = join(parent, 'restored')
  mkdirSync(join(live, 'artifacts'), { recursive: true }); writeFileSync(join(live, 'artifacts', 'item.html'), '<h1>kept</h1>')
  createAppDataBackup(live, backup, {})
  writeFileSync(join(backup, 'data', 'artifacts', 'item.html'), '<h1>evil</h1>')
  expect(() => restoreAppDataBackup(backup, restored)).toThrow(/verification failed/)
  expect(() => readFileSync(join(restored, 'artifacts', 'item.html'))).toThrow()
})
