import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyRegularFileVerifiedSync } from '../src/main/safeFile'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
test('an exclusive verified copy never deletes a destination it did not create', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-safe-copy-')); roots.push(root)
  const source = join(root, 'source.bin'), destination = join(root, 'owner-file.bin')
  writeFileSync(source, 'new source'); writeFileSync(destination, 'owner original')
  expect(() => copyRegularFileVerifiedSync(source, destination)).toThrow()
  expect(readFileSync(destination, 'utf8')).toBe('owner original')
})
