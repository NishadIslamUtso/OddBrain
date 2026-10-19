import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVaultService } from '../src/main/vault/service'
import { createMemoryWorkspace } from '../src/main/memory/workspace'
import { emptyMemory, memoryStateProblem } from '../src/shared/lib/memoryWorkspace'

/**
 * The memory state is one JSON file inside the vault, where any other program
 * with file access can edit it. Every entry is read by the review screen and by
 * the organizer, so a half-written record used to surface as a TypeError — a
 * stack trace — at the moment somebody clicked approve. The boundary now
 * refuses the whole file with a sentence instead, and never replaces it.
 */

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const withState = (patch: Record<string, unknown>) => {
  const root = mkdtempSync(join(tmpdir(), 'ob-memory-repair-')); roots.push(root)
  const vault = createVaultService({ vaultPath: root })
  vault.files().writeAtomic('06 Review/Organizer/state.json', JSON.stringify({ ...emptyMemory(), ...patch }))
  return createMemoryWorkspace(vault.files(), () => '2026-10-18T10:00:00Z')
}

const BROKEN: Array<[string, Record<string, unknown>, string]> = [
  ['a proposal with no source', { proposals: [{ id: 'a', kind: 'journal', state: 'pending', revision: 1, history: [], subject: 'self', title: 't', text: 'x', quote: 'q', date: '', uncertainty: '', model: 'm', authored: 'ai' }] }, 'missing its source'],
  ['a job with no source', { jobs: [{ id: 'j', state: 'queued', attempts: 0, error: '' }] }, 'missing its source'],
  ['a person with no name', { people: [{ id: 'p' }] }, 'a person is unreadable'],
  ['an account with no label', { accounts: [{ id: 'a' }] }, 'a linked account is unreadable'],
  ['a merge with no sides', { merges: [{ id: 'm' }] }, 'a merge record is unreadable'],
  ['a proposal with an unknown destination', { proposals: [{ id: 'a', kind: 'soul', state: 'pending', revision: 1, history: [] }] }, 'unknown destination'],
  ['a source with a backwards range', { jobs: [{ id: 'j', state: 'queued', attempts: 0, error: '', source: { id: 'j', path: 'p', title: 't', provider: 'p', conversation: 'c', message: 'm', role: 'user', speaker: '', account: '', kind: 'ai', observed: 'x', hash: 'h', start: 10, end: 2 } }] }, 'impossible source range'],
]

describe('a damaged memory state', () => {
  it.each(BROKEN)('refuses %s with a sentence', (_label, patch, expected) => {
    const store = withState(patch)
    let thrown: unknown = null
    try { store.read() } catch (error) { thrown = error }
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain('needs repair')
    expect((thrown as Error).message).toContain(expected)
    // The message has to say which file, or "repair the state" is a riddle.
    expect((thrown as Error).message).toContain('06 Review/Organizer/state.json')
    expect((thrown as Error).name).not.toBe('TypeError')
  })

  it('refuses the file before a review can touch it, instead of crashing mid-click', () => {
    const store = withState({ proposals: [{ id: 'a', kind: 'journal', state: 'pending', revision: 1, history: [] }] })
    let thrown: unknown = null
    try { store.act({ type: 'review', id: 'a', decision: 'approve', expectedRevision: 0 }) } catch (error) { thrown = error }
    expect((thrown as Error).message).toContain('needs repair')
    expect((thrown as Error).name).not.toBe('TypeError')
  })

  it('says plainly when the file is not JSON at all', () => {
    const root = mkdtempSync(join(tmpdir(), 'ob-memory-json-')); roots.push(root)
    const vault = createVaultService({ vaultPath: root })
    vault.files().writeAtomic('06 Review/Organizer/state.json', '{ half a file')
    expect(() => createMemoryWorkspace(vault.files()).read()).toThrow(/not readable as JSON/)
  })

  it('accepts what this app actually writes, including a chapter with a basis', () => {
    const store = withState({ revision: 2, proposals: [], jobs: [], people: [{ id: 'p', name: 'Ada', notes: '' }], accounts: [], merges: [] })
    expect(store.read().revision).toBe(2)
    expect(memoryStateProblem(store.read())).toBe('')
  })
})

describe('memoryStateProblem', () => {
  it('names the first fault and says nothing about a good state', () => {
    expect(memoryStateProblem(emptyMemory())).toBe('')
    expect(memoryStateProblem(null)).toBe('it is not a version 1 memory state')
    expect(memoryStateProblem({ ...emptyMemory(), version: 2 })).toBe('it is not a version 1 memory state')
    expect(memoryStateProblem({ ...emptyMemory(), jobs: 'none' })).toBe('its jobs is not a list')
    expect(memoryStateProblem({ ...emptyMemory(), preferences: { enabled: 'yes' } })).toBe('its preferences are incomplete')
  })
})

it('reads older version-1 files without discovery warnings without rewriting them', () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-memory-legacy-')); roots.push(root)
  const vault = createVaultService({ vaultPath: root }), state = emptyMemory()
  delete (state as Partial<typeof state>).discoveryWarnings
  const raw = JSON.stringify(state), path = '06 Review/Organizer/state.json'
  vault.files().writeAtomic(path, raw)
  expect(createMemoryWorkspace(vault.files()).read().discoveryWarnings).toEqual([])
  expect(vault.files().read(path)).toBe(raw)
})

it('does not treat an emptied existing state file as a new empty workspace', () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-memory-empty-')); roots.push(root)
  const vault = createVaultService({ vaultPath: root }), path = '06 Review/Organizer/state.json'
  vault.files().writeAtomic(path, '')
  const store = createMemoryWorkspace(vault.files())
  expect(() => store.read()).toThrow('not readable as JSON')
  expect(() => store.act({ type: 'retry', expectedRevision: 0 })).toThrow(path)
  expect(vault.files().read(path)).toBe('')
})
