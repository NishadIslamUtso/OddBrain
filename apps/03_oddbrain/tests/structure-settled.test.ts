import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonicalStructureRoot, conflictWasSettled, normalizeSettledConflicts, settleStructureConflict, validStructureRelative } from '../src/main/vault/settled'

const roots: string[] = []
const root = (): string => { const value = mkdtempSync(join(tmpdir(), 'ob-settled-')); roots.push(value); return value }

describe('vault-scoped structure settlements', () => {
  it('keeps the same relative conflict independent in two vaults', () => {
    const first = root(), second = root()
    const records = settleStructureConflict([], first, 'CLAUDE.md')

    expect(conflictWasSettled(records, first, 'CLAUDE.md')).toBe(true)
    expect(conflictWasSettled(records, second, 'CLAUDE.md')).toBe(false)
  })

  it('scopes legacy bare paths to the selected vault during migration', () => {
    const first = root(), second = root()
    const records = normalizeSettledConflicts(['CLAUDE.md', 'CLAUDE.md'], canonicalStructureRoot(first))

    expect(records).toEqual([{ root: canonicalStructureRoot(first), relative: 'CLAUDE.md' }])
    expect(conflictWasSettled(records, second, 'CLAUDE.md')).toBe(false)
  })

  it('drops malformed ledger entries and refuses paths that can leave the vault', () => {
    const selected = root()
    const records = normalizeSettledConflicts([
      null,
      { root: '', relative: 'CLAUDE.md' },
      { root: selected, relative: '../outside.md' },
      { root: selected, relative: '/absolute.md' },
      { root: selected, relative: '00 System/START HERE.md' },
    ], canonicalStructureRoot(selected))

    expect(records).toEqual([{ root: canonicalStructureRoot(selected), relative: '00 System/START HERE.md' }])
    expect(validStructureRelative('folder//file.md')).toBe(false)
    expect(() => settleStructureConflict([], selected, '../outside.md')).toThrow('vault-relative')
  })

  it('does not duplicate a repeated choice', () => {
    const selected = root()
    const once = settleStructureConflict([], selected, 'index.md')
    expect(settleStructureConflict(once, selected, 'index.md')).toBe(once)
  })
})

afterAll(() => { for (const value of roots) rmSync(value, { recursive: true, force: true }) })
