import test from 'node:test'
import assert from 'node:assert/strict'
import { linkFiles, markDone, normalizeBoard, unlinkFile, dropDoneCard } from '../src/shared/lib/sessionsBoard'

/**
 * Code (06) — the session board (A.5). The rules under test are the honesty
 * rules: the board is the owner's own organisation of real engine threads;
 * damaged files rebuild to an empty board instead of inventing one; Done
 * really removes the thread from Continuing; links are path-shaped and
 * deduplicated; history cannot grow forever.
 */

test('normalizeBoard rebuilds a valid file and drops nothing clean', () => {
  const board = normalizeBoard({
    continuing: {
      '/home/user/proj': { files: ['/home/user/proj/a.ts', '/home/user/proj/b.ts'] },
    },
    done: [{ workspace: '/home/user/old', sessionId: 'abc-123', endedAt: '2026-10-16T00:00:00Z' }],
  })
  assert.deepEqual(board.continuing['/home/user/proj'], { files: ['/home/user/proj/a.ts', '/home/user/proj/b.ts'] })
  assert.equal(board.done.length, 1)
  assert.equal(board.done[0].sessionId, 'abc-123')
})

test('garbage in, empty board out — never an invented one', () => {
  for (const junk of [null, undefined, 42, 'board', [], { continuing: 5 }, { done: 'no' }]) {
    const board = normalizeBoard(junk)
    assert.deepEqual(board, { continuing: {}, done: [] })
  }
})

test('bad entries are dropped, not repaired into lies', () => {
  const board = normalizeBoard({
    continuing: {
      'https://evil.example': { files: ['/x'] }, // a URL is not a workspace
      '': { files: ['/x'] }, // empty workspace
      '/ok': { files: 'nope' }, // files must be a list
      '/ok2': { files: ['/good', 'https://bad', '/good', ''] }, // junk paths drop, dupes collapse
    },
    done: [{ workspace: '/w' }, { workspace: '/ok', sessionId: 'ok-id' }],
  })
  assert.equal(board.continuing['https://evil.example'], undefined)
  assert.equal(board.continuing[''], undefined)
  assert.equal(board.continuing['/ok'], undefined)
  assert.deepEqual(board.continuing['/ok2'], { files: ['/good'] })
  assert.equal(board.done.length, 1)
  assert.equal(board.done[0].sessionId, 'ok-id')
})

test('linkFiles adds new paths, keeps order, dedupes, caps', () => {
  let board = normalizeBoard({ continuing: { '/w': { files: ['/a'] } }, done: [] })
  const linked = linkFiles(board, '/w', ['/b', '/a', '/c'])
  assert.equal(linked.added, 2)
  board = normalizeBoard(linked.board)
  assert.deepEqual(board.continuing['/w'], { files: ['/a', '/b', '/c'] })
  // The cap is real: 24 links per thread.
  const many = Array.from({ length: 40 }, (_, i) => `/f${i}`)
  assert.throws(() => linkFiles(normalizeBoard({ continuing: {}, done: [] }), '/w', many), /Nothing was added/)
  // An unknown workspace gains a new entry; an empty pick adds nothing.
  const fresh = linkFiles(normalizeBoard({ continuing: {}, done: [] }), '/new', ['/x'])
  assert.deepEqual(normalizeBoard(fresh.board).continuing['/new'], { files: ['/x'] })
  assert.equal(linkFiles(board, '/w', []).added, 0)
})

test('unlinkFile removes exactly one link', () => {
  let board = normalizeBoard({ continuing: { '/w': { files: ['/a', '/b'] } }, done: [] })
  board = normalizeBoard(unlinkFile(board, '/w', '/a'))
  assert.deepEqual(board.continuing['/w'], { files: ['/b'] })
})

test('markDone moves the thread out of Continuing into history, newest first, capped', () => {
  let board = normalizeBoard({
    continuing: { '/w': { files: ['/a'] }, '/other': { files: [] } },
    done: [{ workspace: '/older', sessionId: 'old', endedAt: 'yesterday' }],
  })
  board = normalizeBoard(markDone(board, '/w', 'sid-1', '2026-10-16T05:00:00Z'))
  assert.equal(board.continuing['/w'], undefined, 'the finished thread leaves Continuing')
  assert.equal(board.continuing['/other'] !== undefined, true, 'other threads stay')
  assert.equal(board.done[0].sessionId, 'sid-1')
  assert.equal(board.done[0].endedAt, '2026-10-16T05:00:00Z')
  assert.equal(board.done.length, 2)
  // Another session in the same folder retains its earlier native identity.
  board = normalizeBoard(markDone(board, '/w', 'sid-2', 'now'))
  assert.equal(board.done.length, 3)
  assert.equal(board.done[0].sessionId, 'sid-2')
})

test('history stays bounded and a card can be dropped', () => {
  let board = normalizeBoard({ continuing: {}, done: [] })
  for (let i = 0; i < 60; i += 1) board = markDone(board, `/w${i}`, `sid-${i}`, '')
  assert.equal(normalizeBoard(board).done.length, 60, 'older history is never silently evicted')
  board = dropDoneCard(board, '/w59')
  assert.equal(normalizeBoard(board).done.some(card => card.workspace === '/w59'), false)
})
