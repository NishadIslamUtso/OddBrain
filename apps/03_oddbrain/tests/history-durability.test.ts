// @vitest-environment node
import { test, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { save, read } from '../src/main/artifacts/store'
import { snapshotFile } from '../src/main/engine/checkpoints'

test('recovered artifact versions with gaps remain append-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-history-'))
  try {
    const folder = join(root, 'items', 'fixture'); mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'v1.html'), 'first')
    writeFileSync(join(folder, 'v3.html'), 'third')
    expect(save(root, { id: 'fixture', content: 'fourth' }).ok).toBe(true)
    expect(readFileSync(join(folder, 'v3.html'), 'utf8')).toBe('third')
    expect(readFileSync(join(folder, 'v4.html'), 'utf8')).toBe('fourth')
    const previous = read(root, 'fixture', 2)
    expect(previous.ok && previous.content).toBe('third')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('saving after an interrupted index update does not overwrite an unindexed version', () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-history-'))
  try {
    save(root, { id: 'fixture', content: 'first' })
    const folder = join(root, 'items', 'fixture')
    writeFileSync(join(folder, 'v2.html'), 'unindexed work')
    expect(save(root, { id: 'fixture', content: 'new work' }).ok).toBe(true)
    expect(readFileSync(join(folder, 'v2.html'), 'utf8')).toBe('unindexed work')
    expect(readFileSync(join(folder, 'v3.html'), 'utf8')).toBe('new work')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('checkpoints of the same path at the same timestamp keep both originals', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-history-'))
  try {
    const original = join(root, 'original.txt'), folder = join(root, 'checkpoints')
    writeFileSync(original, 'before first edit')
    const first = await snapshotFile(folder, original, 1_700_000_000_000)
    writeFileSync(original, 'before second edit')
    const second = await snapshotFile(folder, original, 1_700_000_000_000)
    expect(first!.copy).not.toBe(second!.copy)
    expect(readFileSync(first!.copy, 'utf8')).toBe('before first edit')
    expect(readFileSync(second!.copy, 'utf8')).toBe('before second edit')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
