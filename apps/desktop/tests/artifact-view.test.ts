import test from 'node:test'
import assert from 'node:assert/strict'
import type { Artifact } from '../src/shared/types'
import { chatArtifacts, readSource, viewsForMessage } from '../src/renderer/src/state/artifactView'

/**
 * Which artifact a message shows, and from which source.
 *
 * The reason these exist at all: getting it wrong is invisible. The preview looks
 * correct — it is simply one version behind, or a draft that was superseded, and
 * nothing on screen says so.
 */

function artifact(over: Partial<Artifact> = {}): Artifact {
  return {
    id: 'a1',
    title: 'Timer',
    type: 'html',
    versions: [{ content: '<h1>saved</h1>', savedAt: '2026-01-01T00:00:00.000Z' }],
    ...over,
  }
}

test('a finished message shows what was saved', () => {
  const saved = artifact()
  const views = viewsForMessage('m1', [saved], { messageId: '', artifacts: [] })
  assert.equal(views.length, 1)
  assert.equal(views[0].source, '<h1>saved</h1>')
  assert.equal(views[0].draft, false)
})

test('an artifact saved as a draft says so', () => {
  const draft = artifact({ partial: true, versions: [{ content: 'half', draft: true }] })
  const views = viewsForMessage('m1', [draft], { messageId: '', artifacts: [] })
  assert.equal(views[0].draft, true, 'a partial artifact must not look finished')
})

test('while streaming, the live sweep wins over the saved copy', () => {
  const saved = artifact()
  const live = artifact({ id: 'a1', versions: [{ content: '<h1>newer</h1>' }] })
  const views = viewsForMessage('m1', [saved], { messageId: 'm1', artifacts: [live] })
  assert.equal(views[0].source, '<h1>newer</h1>', 'the newest text on screen must be the newest text')
  assert.equal(views[0].draft, true)
})

test('a live sweep for a different message is ignored', () => {
  const saved = artifact()
  const live = artifact({ versions: [{ content: '<h1>someone else</h1>' }] })
  const views = viewsForMessage('m1', [saved], { messageId: 'm2', artifacts: [live] })
  assert.equal(views[0].source, '<h1>saved</h1>')
  assert.equal(views[0].draft, false)
})

test('an artifact the sweep has not reached yet keeps its saved version', () => {
  const first = artifact({ id: 'a1', versions: [{ content: 'one' }] })
  const second = artifact({ id: 'a2', versions: [{ content: 'two' }] })
  const live = artifact({ id: 'a1', versions: [{ content: 'one, longer' }] })
  const views = viewsForMessage('m1', [first, second], { messageId: 'm1', artifacts: [live] })
  assert.deepEqual(
    views.map(view => view.source),
    ['one, longer', 'two'],
    'a second artifact must not vanish because the sweep has not got to it'
  )
  assert.deepEqual(
    views.map(view => view.draft),
    [true, false]
  )
})

test('a half-written artifact never throws when its source is read', () => {
  assert.equal(readSource(artifact({ versions: [] })), '')
})

test('the rail lists replies newest first, keeping each reply in the order it was written', () => {
  const items = chatArtifacts([
    { id: 'm1', artifacts: [artifact({ id: 'old' })] },
    { id: 'm2' },
    { id: 'm3', artifacts: [artifact({ id: 'first-in-reply' }), artifact({ id: 'second-in-reply' })] },
  ])
  assert.deepEqual(
    items.map(item => item.artifact.id),
    ['first-in-reply', 'second-in-reply', 'old'],
    'the newest reply leads, but a multi-file reply keeps its own order'
  )
  assert.equal(items[0].messageId, 'm3')
})
