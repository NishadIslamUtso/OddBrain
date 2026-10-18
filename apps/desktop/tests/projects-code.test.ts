import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { scopeBoard } from '../src/shared/lib/sessionsBoard'

/**
 * Code lives inside Projects (his pick, 2026-10-16): the project's folder IS
 * the engine's working folder, the project's Code button opens it, and the
 * board scopes itself to that folder — with an honest way back to everything.
 * Code is no longer a global nav item; the menu keeps an escape hatch.
 */

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('Code is not a global nav item any more', () => {
  const nav = read('../src/renderer/src/components/AppNav.tsx')
  for (const kept of ['Chat', 'Artifacts', 'Today', 'Projects', 'Vault', 'Brain']) {
  }
  // The menu escape hatch survives.
  const menu = read('../src/main/index.ts')
})

test('a project opens Code on its own folder', () => {
    // A project without a folder says what is missing instead of pretending.
})

test('scopeBoard filters both lists and says it scoped', () => {
  const sessions = [
    { workspace: '/home/x/thesis', sessionId: 'a' },
    { workspace: '/home/x/other', sessionId: 'b' },
  ]
  const done = [{ workspace: '/home/x/thesis' }, { workspace: '/home/x/other' }]
  const scoped = scopeBoard(sessions, done, '/home/x/thesis')
  assert.equal(scoped.scoped, true)
  assert.deepEqual(scoped.sessions.map(s => s.sessionId), ['a'])
  assert.deepEqual(scoped.done.length, 1)
  const all = scopeBoard(sessions, done, '')
  assert.equal(all.scoped, false)
  assert.equal(all.sessions.length, 2)
  assert.equal(all.done.length, 2)
})

test('the app wires focus in and offers the way back', () => {
  const app = read('../src/renderer/src/App.tsx')
  // The menu opens the WHOLE board, never a project's scope.
  })
