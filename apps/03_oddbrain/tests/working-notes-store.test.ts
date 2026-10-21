import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { emptyWorkingNotes } from '../src/shared/lib/chatContext'
import { WorkingNotesStore, notApproved } from '../src/main/chats/workingNotes'

const roots: string[] = []
const root = (): string => { const value = mkdtempSync(join(tmpdir(), 'oddbrain-working-notes-')); roots.push(value); return value }
afterEach(() => { for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true }) })

const notes = (objective: string, plan: string[] = []) => ({ ...emptyWorkingNotes(), objective, plan, updatedAt: '2026-10-21T00:00:00.000Z', author: 'user' as const })

test('main-owned Working Notes retain immutable revisions and exact unapproved proposal items', () => {
  const store = new WorkingNotesStore(root())
  const first = store.save({ chatId: 'chat-1', expected: null, notes: notes('Ship safely') })
  const proposal = { ...notes('Ship today', ['Delete tests', 'Run tests']), author: 'ai' as const }
  const approved = notes('Ship safely', ['Run tests'])
  const second = store.save({ chatId: 'chat-1', expected: first.current!.id, notes: approved, proposal })
  expect(second.revisions).toHaveLength(2)
  expect(second.current?.notes).toEqual(approved)
  expect(second.current?.proposal).toEqual(proposal)
  expect(second.current?.notApproved).toEqual(['Objective: Ship today', 'Plan: Delete tests'])
  expect(notApproved(proposal, approved)).not.toContain('Plan: Run tests')
})

test('a stale save is refused without replacing either complete revision', () => {
  const location = root(), store = new WorkingNotesStore(location)
  const first = store.save({ chatId: 'chat-2', expected: null, notes: notes('One') })
  store.save({ chatId: 'chat-2', expected: first.current!.id, notes: notes('Two') })
  expect(() => store.save({ chatId: 'chat-2', expected: first.current!.id, notes: notes('Stale') })).toThrow(/changed elsewhere/)
  expect(store.read('chat-2').revisions.map(item => item.notes.objective)).toEqual(['One', 'Two'])
})

test('a missing pointer is recovered from the one complete revision chain', () => {
  const location = root(), store = new WorkingNotesStore(location)
  store.save({ chatId: 'chat-recovery', expected: null, notes: notes('Recover me') })
  const exported = store.exportValue('chat-recovery')
  const hash = createHash('sha256').update('chat-recovery').digest('hex')
  unlinkSync(join(location, hash, 'current'))
  const recovered = store.read('chat-recovery')
  expect(recovered.recovered).toBe(true)
  expect(recovered.current?.notes.objective).toBe('Recover me')
  expect(readFileSync(join(location, hash, 'current'), 'utf8')).toBe(exported.revisions[0].id)
})

test('recovery import preserves every original revision field exactly', () => {
  const original = new WorkingNotesStore(root())
  const first = original.save({ chatId: 'chat-copy', expected: null, notes: notes('Original') })
  original.reject({ chatId: 'chat-copy', expected: first.current!.id, notes: notes('Original'), proposal: { ...notes('Proposed'), author: 'ai' as const } })
  const exported = original.exportValue('chat-copy')
  const restored = new WorkingNotesStore(root()).importValue('chat-copy', JSON.parse(JSON.stringify(exported)))
  expect(restored.revisions).toEqual(exported.revisions)
})

test('legacy migration keeps every supplied notes revision and runs only into an empty history', () => {
  const store = new WorkingNotesStore(root())
  const migrated = store.migrate('chat-legacy', [notes('Old'), notes('New')])
  expect(migrated.revisions.map(item => item.notes.objective)).toEqual(['Old', 'New'])
  expect(migrated.revisions.every(item => item.source === 'legacy-migration')).toBe(true)
  expect(store.migrate('chat-legacy', [notes('Must not overwrite')]).current?.notes.objective).toBe('New')
})
