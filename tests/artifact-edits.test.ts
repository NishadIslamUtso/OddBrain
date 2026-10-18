import test from 'node:test'
import assert from 'node:assert/strict'
import type { Artifact } from '../src/shared/types'
import {
  currentVersion,
  describePick,
  restoredInPlace,
  versionLabel,
  withNewVersion,
} from '../src/renderer/src/state/artifactEdits'

/**
 * Editing a document must never lose one.
 *
 * These tests are about the rule at the top of artifactEdits.ts: history is
 * append-only. The failure they prevent is quiet — a version disappears, the
 * preview still looks fine, and the person finds out later.
 */

function artifact(versions: Array<{ content: string; draft?: boolean }>): Artifact {
  return {
    id: 'a1',
    title: 'Timer',
    type: 'html',
    versions: versions.map(version => ({ ...version, savedAt: '2026-01-01T00:00:00.000Z' })),
  }
}

test('a rewrite appends a version and keeps every earlier one', () => {
  const before = artifact([{ content: 'v1' }])
  const after = withNewVersion(before, 'v2', 'from your comment')
  assert.deepEqual(
    after.versions.map(version => version.content),
    ['v1', 'v2']
  )
  assert.equal(before.versions.length, 1, 'the original artifact must not be mutated')
  assert.equal(after.versions[1].note, 'from your comment')
  assert.ok(after.updatedAt, 'an edit is a change to the document, so it is timestamped')
})

test('a rewrite of a draft finishes it rather than leaving it marked as writing', () => {
  const draft = { ...artifact([{ content: 'half', draft: true }]), partial: true }
  const after = withNewVersion(draft, 'finished')
  assert.equal(after.partial, false, 'a document that has been edited is not still streaming')
  assert.equal(after.versions.length, 2)
})

test('an edit that changes nothing does not invent a version', () => {
  const before = artifact([{ content: 'same' }])
  const after = withNewVersion(before, 'same')
  assert.equal(after.versions.length, 1, 'a model echoing the document is not an edit')
  assert.equal(after, before)
})

test('an empty document is refused instead of saved', () => {
  assert.throws(() => withNewVersion(artifact([{ content: 'v1' }]), '   '), /nothing to save/i)
})

test('restoring an old version appends it, so the version you left is still there', () => {
  const when = artifact([{ content: 'v1' }, { content: 'v2' }, { content: 'v3' }])
  const after = restoredInPlace(when, 0)
  assert.deepEqual(
    after.versions.map(version => version.content),
    ['v1', 'v2', 'v3', 'v1'],
    'going back is itself an edit; nothing is truncated'
  )
  assert.equal(after.versions[3].note, 'restored v1')
  assert.equal(currentVersion(after), 3)
})

test('restoring a version that is not there fails with a sentence, not a crash', () => {
  assert.throws(() => restoredInPlace(artifact([{ content: 'v1' }]), 9), /no longer in this artifact/)
})

test('the version chip counts, and says when you are looking at an older one', () => {
  assert.equal(versionLabel(artifact([{ content: 'only' }])), 'v1')
  const three = artifact([{ content: 'a' }, { content: 'b' }, { content: 'c' }])
  assert.equal(versionLabel(three), 'v3 of 3')
  assert.equal(versionLabel(three, 1), 'v2 of 3')
})

test('a picked element is described well enough to check before commenting', () => {
  assert.equal(
    describePick({ picked: { tag: 'button', id: 'go', text: 'Start' }, width: 88, height: 40 }),
    'button#go · "Start" · 88×40'
  )
  assert.equal(
    describePick({ picked: { tag: 'div', text: '   ' }, width: 200, height: 120 }),
    'div · 200×120',
    'an element with no text still reads clearly'
  )
})
