// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { smokeFailure } from '../src/main/smoke'

/**
 * The smoke run is the only check that proves the window opens, paints and
 * scrolls on the real Electron binary. Its verdict used to be one boolean
 * expression with the rules in a comment; these tests hold the rules.
 */

const passed = {
  ready: true,
  visible: true,
  errors: 0,
  warnings: 0,
  blank: false,
  scrollLine: 'SCROLL OK',
}

test('a painted, clean, scrolling window passes with no reason', () => {
  assert.equal(smokeFailure(passed), '')
})

test('every way the window can fail names itself in words', () => {
  assert.equal(
    smokeFailure({ ...passed, ready: false, scrollLine: 'SCROLL not run: the interface was not on screen within 8s' }),
    'the interface did not reach a painted, mounted state within 8s'
  )
  assert.equal(
    smokeFailure({ ...passed, visible: false }),
    'the window never became visible'
  )
  assert.equal(smokeFailure({ ...passed, blank: true }), 'the window photographed blank after four attempts')
  assert.equal(
    smokeFailure({ ...passed, scrollLine: 'SCROLL BROKEN {"ok":false,"why":"no scroller in the tree"}' }),
    'the message list did not scroll (SCROLL BROKEN {"ok":false,"why":"no scroller in the tree"})'
  )
  assert.equal(
    smokeFailure({ ...passed, scrollLine: 'SCROLL FAILED boom' }),
    'the scroll probe could not run (SCROLL FAILED boom)'
  )
})

test('one renderer error, or one warning, already fails — the owner rule', () => {
  assert.equal(smokeFailure({ ...passed, errors: 1 }), '1 renderer error')
  assert.equal(smokeFailure({ ...passed, errors: 3 }), '3 renderer errors')
  assert.equal(smokeFailure({ ...passed, warnings: 1 }), '1 renderer warning')
  assert.equal(smokeFailure({ ...passed, warnings: 2 }), '2 renderer warnings')
})

test('a scroll proof that did not run is not a pass either', () => {
  assert.equal(
    smokeFailure({ ...passed, scrollLine: 'SCROLL skipped' }),
    'the scroll proof did not run (SCROLL skipped)'
  )
})

test('the first thing that went wrong is the reason, not the last', () => {
  assert.equal(
    smokeFailure({ ready: false, visible: false, blank: true, errors: 4, warnings: 2, scrollLine: 'SCROLL skipped' }),
    'the interface did not reach a painted, mounted state within 8s'
  )
  assert.equal(
    smokeFailure({ ...passed, blank: true, errors: 4, warnings: 2 }),
    'the window photographed blank after four attempts'
  )
  assert.equal(
    smokeFailure({ ...passed, visible: false, blank: true, errors: 4 }),
    'the window never became visible'
  )
})
