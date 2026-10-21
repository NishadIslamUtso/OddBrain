import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFolderAccess } from '../src/main/folders/access'

describe('purpose-limited folder access', () => {
  it('defaults to read-only metadata listing and records revocation', () => {
    const root = mkdtempSync(join(tmpdir(), 'oddbrain-folder-')), folder = join(root, 'project'); mkdirSync(folder); writeFileSync(join(folder, 'note.txt'), 'private')
    const clock = () => new Date('2026-10-21T10:00:00.000Z'), access = createFolderAccess(join(root, 'access.json'), clock)
    const state = access.grant(folder, { purpose: 'Review project references', duration: 'until-revoked', review: true })
    const grant = state.grants[0]
    expect(grant).toMatchObject({ read: true, write: false, watch: false, cloud: false, commands: false, review: true })
    const listed = access.list(grant.id)
    expect(listed.files).toEqual([{ path: 'note.txt', bytes: 7, modifiedAt: expect.any(String) }])
    expect(listed.answer).toContain('Contents were not read')
    expect(access.revoke(grant.id).grants[0].revokedAt).toBeTruthy()
    expect(() => access.list(grant.id)).toThrow(/revoked or expired/)
  })

  it('expires a timed grant with a receipt and keeps every optional authority separate', () => {
    const root = mkdtempSync(join(tmpdir(), 'oddbrain-folder-')), folder = join(root, 'project'); mkdirSync(folder)
    let now = new Date('2026-10-21T10:00:00.000Z')
    const access = createFolderAccess(join(root, 'access.json'), () => now)
    const grant = access.grant(folder, { purpose: 'Time-limited review', duration: 'day', write: true, watch: false, review: true, cloud: true, commands: false }).grants[0]
    expect(grant).toMatchObject({ read: true, write: true, watch: false, review: true, cloud: true, commands: false, revokedAt: null })
    now = new Date('2026-10-22T10:00:01.000Z')
    const expired = access.read().grants[0]
    expect(expired.revokedAt).toBe(now.toISOString()); expect(expired.receipts.at(-1)?.action).toBe('expired')
    expect(() => access.list(grant.id)).toThrow(/revoked or expired/)
  })

  it('does not carry session-only authority into another app process', () => {
    const root = mkdtempSync(join(tmpdir(), 'oddbrain-folder-')), folder = join(root, 'project'); mkdirSync(folder)
    const file = join(root, 'access.json'), first = createFolderAccess(file, () => new Date('2026-10-21T10:00:00.000Z'))
    first.grant(folder, { purpose: 'One session', duration: 'session' })
    const restarted = createFolderAccess(file, () => new Date('2026-10-21T11:00:00.000Z'))
    expect(restarted.read().grants[0].revokedAt).toBe('2026-10-21T11:00:00.000Z')
  })
})
