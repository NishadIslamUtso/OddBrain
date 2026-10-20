import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createReadTrustStore, type ReadTrustCandidate } from '../src/main/engine/readTrust'

const roots: string[] = []
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-read-trust-')); roots.push(root)
  const workspace = join(root, 'workspace'), folder = join(workspace, 'docs')
  mkdirSync(folder, { recursive: true })
  const first = join(folder, 'first.txt'), second = join(folder, 'second.txt'), third = join(folder, 'third.txt')
  writeFileSync(first, 'one'); writeFileSync(second, 'two'); writeFileSync(third, 'three')
  return { root, workspace, folder, first, second, third }
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }) })
const candidate = (workspace: string, file: string, extra: Partial<ReadTrustCandidate> = {}): ReadTrustCandidate => ({ engine: 'claude-code', workspace, tool: 'Read', file, turnId: 'turn-one', ...extra })

describe('main-process read-only approvals', () => {
  test('binds exact-file, turn-folder, project-folder and folder rules without widening the tool', () => {
    const f = fixture()
    const exact = createReadTrustStore(join(f.root, 'exact'))
    exact.add(candidate(f.workspace, f.first), 'file')
    expect(exact.match(candidate(f.workspace, f.first))?.mode).toBe('file')
    expect(exact.match(candidate(f.workspace, f.second))).toBeUndefined()

    const turn = createReadTrustStore(join(f.root, 'turn'))
    turn.add(candidate(f.workspace, f.first), 'turn')
    expect(turn.match(candidate(f.workspace, f.second))?.mode).toBe('turn')
    expect(turn.match(candidate(f.workspace, f.second, { turnId: 'another-turn' }))).toBeUndefined()
    expect(turn.match(candidate(f.workspace, f.second, { tool: 'Write' }))).toBeUndefined()
    turn.clearTurn('turn-one'); expect(turn.view().rules).toEqual([])

    const project = createReadTrustStore(join(f.root, 'project'))
    project.add(candidate(f.workspace, f.first, { projectId: 'project-a' }), 'project')
    expect(project.match(candidate(f.workspace, f.second, { projectId: 'project-a' }))?.mode).toBe('project')
    expect(project.match(candidate(f.workspace, f.second, { projectId: 'project-b' }))).toBeUndefined()

    const folder = createReadTrustStore(join(f.root, 'folder'))
    folder.add(candidate(f.workspace, f.first), 'folder')
    expect(folder.match(candidate(f.workspace, f.second))?.mode).toBe('folder')
    expect(folder.match(candidate(f.workspace, f.second, { risk: 'loads executable configuration' }))).toBeUndefined()
  })

  test('refuses linked escapes and paths outside the active workspace', () => {
    const f = fixture(), outside = join(f.root, 'private.txt'), link = join(f.folder, 'linked.txt')
    writeFileSync(outside, 'private')
    try { symlinkSync(outside, link) } catch { return }
    const store = createReadTrustStore(join(f.root, 'rules'))
    expect(store.eligible(candidate(f.workspace, link))).toBeNull()
    expect(store.eligible(candidate(f.workspace, outside))).toBeNull()
    expect(() => store.add(candidate(f.workspace, link), 'folder')).toThrow(/ordinary Read file inside/)
  })

  test('refuses a full rule store instead of silently evicting an older approval', () => {
    const f = fixture(), store = createReadTrustStore(join(f.root, 'rules'), { maxRules: 2 })
    const first = store.add(candidate(f.workspace, f.first), 'file').rule, second = store.add(candidate(f.workspace, f.second), 'file').rule
    expect(() => store.add(candidate(f.workspace, f.third), 'file')).toThrow(/limit is full.*none were silently removed/i)
    expect(store.view().rules.map(rule => rule.id)).toEqual([first.id, second.id])
  })

  test('falls back to the previous complete rule set and preserves damaged evidence before repair', () => {
    const f = fixture(), root = join(f.root, 'rules'), store = createReadTrustStore(root)
    const first = store.add(candidate(f.workspace, f.first), 'file').rule
    store.add(candidate(f.workspace, f.second), 'file')
    writeFileSync(join(root, 'rules.json'), '{damaged')
    expect(store.view()).toMatchObject({ rules: [{ id: first.id, active: false }], notice: expect.stringMatching(/inactive recovery/) })
    expect(store.match(candidate(f.workspace, f.first))).toBeUndefined()
    const repaired = store.add(candidate(f.workspace, f.third), 'file').rule
    expect(store.view().rules).toEqual([repaired])
    expect(store.match(candidate(f.workspace, f.first))).toBeUndefined()
    expect(existsSync(join(root, 'recovery'))).toBe(true)
    expect(readFileSync(join(root, 'rules.previous.json'), 'utf8')).toContain(first.id)
  })

  test('migrates legacy renderer rules once, retains exact raw evidence, and reports skipped rules', () => {
    const f = fixture(), root = join(f.root, 'rules'), store = createReadTrustStore(root)
    const raw = JSON.stringify([
      { id: 'old', engine: 'claude-code', workspace: f.workspace, tool: 'Read', scope: f.first, summary: f.first, createdAt: '2026-10-20T00:00:00.000Z' },
      { id: 'vault-default', engine: 'claude-code', workspace: '', tool: 'Read', scope: f.second, summary: f.second, createdAt: '2026-10-20T00:00:00.000Z' },
      { id: 'bad', engine: 'claude-code', workspace: f.workspace, tool: 'Bash', scope: f.second, summary: 'no', createdAt: '2026-10-20T00:00:00.000Z' },
    ])
    const migrated = store.migrateLegacy(raw, f.workspace)
    expect(migrated).toMatchObject({ migrated: 2, skipped: 1 })
    expect(migrated.view.rules).toEqual(expect.arrayContaining([expect.objectContaining({ mode: 'file', scope: f.first }), expect.objectContaining({ mode: 'file', scope: f.second, workspace: f.workspace })]))
    expect(readFileSync(join(root, 'migration', 'renderer-v1.json'), 'utf8')).toBe(raw)
    expect(store.migrateLegacy(raw).migrated).toBe(0)
  })
})
