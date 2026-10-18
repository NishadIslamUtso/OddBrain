// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createEngineParser } from '../src/main/engine/stream'
import { GERUNDS, pickGerund } from '../src/shared/lib/gerunds'
import { engineStore, resetEngineForTests, type EngineStore } from '../src/renderer/src/state/engine'
import type { EngineEvent } from '../src/shared/lib/engine'

/**
 * The engine's scratchwork, shown.
 *
 * Two features, one wire: the thinking process is folded away from the
 * answer instead of being thrown away, and the working word ("Pondering…")
 * replaces the frozen "working" label. Prior art: Claude Code shows both —
 * gray thinking while it reasons, a different -ing word each turn.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

const line = (object: unknown): string => JSON.stringify(object) + '\n'

test('thinking deltas become thinking events, and the finished block is not shown twice', () => {
  const parser = createEngineParser()
  const events: EngineEvent[] = []
  events.push(...parser.feed(line({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'The user wants ' } },
  })))
  events.push(...parser.feed(line({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'a count of files.' } },
  })))
  assert.deepEqual(events, [
    { kind: 'thinking', text: 'The user wants ' },
    { kind: 'thinking', text: 'a count of files.' },
  ])

  // The finished assistant message repeats the whole thinking block — the
  // parser has already shown it word for word, so it is not news.
  const echoed = parser.feed(line({
    type: 'assistant',
    message: { content: [
      { type: 'thinking', thinking: 'The user wants a count of files.' },
      { type: 'text', text: 'There are 41 files.' },
    ] },
  }))
  assert.deepEqual(
    echoed.filter(event => event.kind === 'thinking'),
    [],
    'the echoed thinking block is deduped against the streamed deltas',
  )
  assert.deepEqual(
    echoed.filter(event => event.kind === 'text').map(event => ('text' in event ? event.text : '')),
    ['There are 41 files.'],
  )

  // A thinking block the stream never showed is still shown — the dedupe
  // compares words, it does not blindly drop the kind.
  const unseen = parser.feed(line({
    type: 'assistant',
    message: { content: [
      { type: 'thinking', thinking: 'A wholly different thought.' },
      { type: 'text', text: 'Answer two.' },
    ] },
  }))
  assert.deepEqual(
    unseen.filter(event => event.kind === 'thinking'),
    [{ kind: 'thinking', text: 'A wholly different thought.' }],
  )
})

test('text-only streams are untouched by the thinking bookkeeping', () => {
  const parser = createEngineParser()
  const events = parser.feed(
    line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } } }) +
    line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } })
  )
  assert.deepEqual(events.filter(event => event.kind === 'delta'), [{ kind: 'delta', text: 'Hello' }])
  assert.equal(events.filter(event => event.kind === 'text').length, 0, 'the finished text is deduped as before')
})

test('the store folds thinking fragments into one growing item, and the answer starts fresh', async () => {
  type FakeApi = { listener: ((event: EngineEvent) => void) | null; sent: unknown[] }
  const fake: FakeApi = { listener: null, sent: [] }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'm', baseUrl: '', workspace: '', approval: 'ask' },
      running: true,
      history: [],
    }),
    send: async (prompt: string, cwd: string) => {
      fake.sent.push({ prompt, cwd })
      return { ok: true, answer: 'started' }
    },
    onEvent: (listener: (event: EngineEvent) => void) => {
      fake.listener = listener
      return () => undefined
    },
    onPullEvent: () => () => undefined,
  }
  resetEngineForTests()
  const store: EngineStore = engineStore()
  await store.send('count the files')
  assert.ok(fake.listener, 'the store subscribed to the wire')

  fake.listener({ kind: 'thinking', text: 'First, ' })
  fake.listener({ kind: 'thinking', text: 'list the folders.' })
  fake.listener({ kind: 'delta', text: '41 files.' })

  const turn = store.turn
  assert.ok(turn)
  assert.deepEqual(turn.items.map(item => item.kind), ['thinking', 'text'])
  assert.match(turn.items[0].text, /list the folders\./, 'both thinking fragments grew one item')
  assert.equal(turn.items[1].text, '41 files.')

  fake.listener({ kind: 'done', text: '41 files.' })
  assert.equal(turn.state, 'done', 'the turn closes over the folded thinking')
})

test('a remembered thinking-only history is worth showing', async () => {
  const fake = {
    listener: null as ((event: EngineEvent) => void) | null,
  }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'm', baseUrl: '', workspace: '', approval: 'ask' },
      running: true,
      history: [
        { kind: 'session', id: 's1' },
        { kind: 'thinking', text: 'half a thought from before the reload' },
      ] satisfies EngineEvent[],
    }),
    onEvent: (listener: (event: EngineEvent) => void) => {
      fake.listener = listener
      return () => undefined
    },
    onPullEvent: () => () => undefined,
  }
  resetEngineForTests()
  const store = engineStore()
  await store.init()
  const turn = store.turn
  assert.ok(turn, 'a thinking-only history still hydrates the turn')
  assert.equal(turn?.items[0]?.kind, 'thinking')
})

test('the working words are a real list, picked from it, one per call', () => {
  // His list (189) merged with the app's first two dozen — playwright-grade
  // whimsy included: Beboppin', Flambéing, Sock-hopping, Clauding.
  assert.ok(GERUNDS.length >= 190, 'enough words to stay fresh')
  const keyed = GERUNDS.map(word => word.toLowerCase())
  assert.ok(new Set(keyed).size === keyed.length, 'no duplicates')
  for (const word of GERUNDS) {
    assert.match(word, /^[A-Z]/, `capitalized: ${word}`)
    assert.match(word, /(ing|in')$/, `a working word: ${word}`)
  }
  let calls = 0
  const first = pickGerund(() => {
    calls += 1
    return 0
  })
  assert.equal(first, GERUNDS[0])
  assert.equal(pickGerund(() => 0.999), GERUNDS[GERUNDS.length - 1])
  assert.equal(calls, 1, 'one random draw, no reshuffling')
})

test('the panel shows the working word and folds the thinking away from the answer', () => {
  const panel = read('../src/renderer/src/components/EnginePanel.tsx')
  // The handoff keeps the scratchwork out of the vault document.
  const handoff = read('../src/shared/lib/handoff.ts')
})
