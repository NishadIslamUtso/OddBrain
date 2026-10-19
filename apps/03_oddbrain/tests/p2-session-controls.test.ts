import { describe, expect, it } from 'vitest'
import { linkFiles, markDone, normalizeBoard, scopeBoard, unlinkFile, type SessionsBoard } from '../src/shared/lib/sessionsBoard'

/**
 * p2 — retained session controls after the Code screen retirement
 * (NOT RUN by the implementing agent). The relocated board must keep the
 * engine's native resume ids exactly as issued — scoping, linking and
 * marking done may never rewrite, truncate or invent a session id. Done
 * keeps the id on the history card; the engine-side forget is the
 * caller's separate, explicit step.
 */

const sessions = [
  { workspace: '/work/alpha', sessionId: 'sess-alpha-1234567890' },
  { workspace: '/work/beta', sessionId: 'sess-beta-0987654321' },
]

describe('p2 retained session controls', () => {
  it('scoping to a project folder keeps the native session id whole', () => {
    const view = scopeBoard(sessions, [], '/work/alpha')
    expect(view.scoped).toBe(true)
    expect(view.sessions).toEqual([{ workspace: '/work/alpha', sessionId: 'sess-alpha-1234567890' }])
  })

  it('marking done preserves the id on the history card', () => {
    const board: SessionsBoard = { continuing: { '/work/alpha': { files: ['/work/alpha/a.ts'] } }, done: [] }
    const next = markDone(board, '/work/alpha', 'sess-alpha-1234567890', '2026-10-19T00:00:00.000Z')
    expect(next.done).toEqual([{ workspace: '/work/alpha', sessionId: 'sess-alpha-1234567890', endedAt: '2026-10-19T00:00:00.000Z' }])
    expect(next.continuing['/work/alpha']).toBeUndefined()
  })

  it('linking and unlinking files never touches session identity', () => {
    const empty: SessionsBoard = { continuing: {}, done: [] }
    const linked = linkFiles(empty, '/work/beta', ['/work/beta/notes.md', '/work/beta/notes.md', '/work/beta/spec.md'])
    expect(linked.added).toBe(2)
    const unlinked = unlinkFile(linked.board, '/work/beta', '/work/beta/notes.md')
    expect(unlinked.continuing['/work/beta'].files).toEqual(['/work/beta/spec.md'])
    expect(scopeBoard(sessions, unlinked.done, '/work/beta').sessions[0].sessionId).toBe('sess-beta-0987654321')
  })

  it('a damaged stored board normalizes without inventing sessions', () => {
    const board = normalizeBoard({ continuing: 'junk', done: [{ workspace: '/work/alpha', sessionId: 'sess-alpha-1234567890', endedAt: '2026-10-19T00:00:00.000Z' }, { nope: true }] })
    expect(board.continuing).toEqual({})
    expect(board.done).toHaveLength(1)
    expect(board.done[0].sessionId).toBe('sess-alpha-1234567890')
  })
})
