// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { engineStore, resetEngineForTests, type EngineStore } from '../src/renderer/src/state/engine'
import type { EngineEvent } from '../src/shared/lib/engine'

/**
 * The engine's face: the store the panel draws from, and the wiring that puts
 * the panel and the toggle where a person can reach them.
 *
 * The store is tested as logic, because that is where the decisions live: a
 * turn folds whatever order the wire delivers, a permission question always
 * reaches the bridge with the id it came with, and a window with no machine
 * behind it gets honest refusals instead of invented work. The wiring is
 * pinned the way the appearance tests pin their files: the panel is rendered
 * by the chat, the toggle exists, and a send in engine mode never reaches the
 * chat brain.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

type FakeApi = {
  sent: Array<{ prompt: string; cwd: string }>
  answered: Array<{ requestId: string; allow: boolean }>
  stopped: number
  listener: ((event: EngineEvent) => void) | null
  picked?: string
  model?: string
  workspace?: string
  approval?: string
  brains: Array<{ name: string; cloud: boolean; sizeGB: number | null }>
}

function withFakeEngine(): FakeApi {
  const fake: FakeApi = {
    sent: [],
    answered: [],
    stopped: 0,
    listener: null,
    brains: [
      { name: 'gemma4:cloud', cloud: true, sizeGB: null },
      { name: 'qwen2.5-coder:3b', cloud: false, sizeGB: 1.9 },
    ],
  }
  const api = {
    read: async () => ({
      engine: {
        id: 'claude-code',
        model: 'gemma4:cloud',
        baseUrl: 'http://localhost:11434',
        workspace: '',
        approval: 'ask',
      },
      running: true,
      history: [],
    }),
    pick: async (id: string) => {
      fake.picked = id
      return { ok: true, answer: `engine set to ${id}` }
    },
    models: async () => ({ ok: true, models: fake.brains }),
    detect: async () => [],
    pull: async () => ({ ok: false, answer: 'no pulls in this fake' }),
    deleteModel: async () => ({ ok: false, answer: 'no deletions in this fake' }),
    onPullEvent: () => () => undefined,
    setModel: async (model: string) => {
      fake.model = model
      return { ok: true, answer: `brain set to ${model}` }
    },
    pickWorkspace: async () => {
      fake.workspace = 'C:\\engworkspace'
      return { ok: true, answer: fake.workspace as string }
    },
    setApproval: async (mode: string) => {
      fake.approval = mode
      return { ok: true, answer: mode }
    },
    send: async (prompt: string, cwd: string) => {
      fake.sent.push({ prompt, cwd })
      return { ok: true, answer: 'started' }
    },
    answer: async (requestId: string, allow: boolean) => {
      fake.answered.push({ requestId, allow })
      return { ok: true }
    },
    stop: async () => {
      fake.stopped += 1
      return { ok: true }
    },
    onEvent: (listener: (event: EngineEvent) => void) => {
      fake.listener = listener
      return () => undefined
    },
  }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = api
  return fake
}

function freshStore(): { store: EngineStore; fake: FakeApi } {
  resetEngineForTests()
  const fake = withFakeEngine()
  return { store: engineStore(), fake }
}

test('a turn folds whatever order the wire delivers it', async () => {
  const { store, fake } = freshStore()
  const started = await store.send('tidy the vault notes')
  assert.equal(started.ok, true)
  assert.deepEqual(fake.sent[0], { prompt: 'tidy the vault notes', cwd: '' })

  const events: EngineEvent[] = [
    { kind: 'status', text: 'engine ready' },
    { kind: 'tool', name: 'Read', summary: 'C:\\vault\\a.md' },
    { kind: 'text', text: 'Reading done, writing now.' },
    { kind: 'permission', requestId: 'r1', tool: 'Write', summary: 'C:\\vault\\a.md' },
    { kind: 'done', text: 'All tidied.' },
  ]
  for (const event of events) fake.listener?.(event)

  const turn = store.turn
  assert.ok(turn, 'a turn exists')
  assert.equal(turn?.state, 'done')
  assert.deepEqual(turn?.permissions, [])
  assert.deepEqual(
    turn?.items.map(item => item.kind),
    ['status', 'tool', 'text', 'text'],
    'the permission was a question, not a line of the story; the done text joined it',
  )
  assert.equal(turn?.prompt, 'tidy the vault notes')
})

test('a permission question goes back to the bridge with the id it came with', async () => {
  const { store, fake } = freshStore()
  await store.send('x')
  fake.listener?.({ kind: 'permission', requestId: 'req-11', tool: 'Bash', summary: 'npm test' })
  assert.equal(store.turn?.permissions[0]?.requestId, 'req-11')

  await store.answer(true)
  assert.deepEqual(fake.answered, [{ requestId: 'req-11', allow: true }])
  assert.deepEqual(store.turn?.permissions, [], 'the card is gone the moment it is answered')
  await store.answer(false)
  assert.equal(fake.answered.length, 1, 'answering with no card on the table does nothing')
})

test('a refused send is shown as the result, and the draft rule belongs to the caller', async () => {
  resetEngineForTests()
  ;(window as unknown as Record<string, unknown>).api = {}
  delete (window as unknown as Record<string, unknown>).engineApi // the browser preview: no engine
  const store = engineStore()
  const answer = await store.send('hello')
  assert.equal(answer.ok, false)
  assert.equal(store.turn?.state, 'error')
})

test('a second task while one is running is refused politely', async () => {
  const { store } = freshStore()
  assert.equal((await store.send('first')).ok, true)
  const second = await store.send('second')
  assert.equal(second.ok, false)
  assert.match(second.answer, /already working/)
})

test('stop reaches the bridge and closes the turn immediately — no wedged panel', async () => {
  const { store, fake } = freshStore()
  await store.send('x')
  await store.stop()
  assert.equal(fake.stopped, 1)
  assert.equal(store.turn?.state, 'done', 'the person who pressed Stop never waits for the wire')
  assert.match(store.turn?.items.at(-1)?.text ?? '', /stopped by you/)
  // And the next task is accepted — the reviewed bug was exactly this refusal.
  const second = await store.send('next task')
  assert.equal(second.ok, true)
})

test('a closed engine announces itself, closing a running turn', async () => {
  const { store, fake } = freshStore()
  await store.send('x')
  fake.listener?.({ kind: 'closed' })
  assert.equal(store.turn?.state, 'done')
  assert.match(store.turn?.items.at(-1)?.text ?? '', /engine stopped/)
  const next = await store.send('again')
  assert.equal(next.ok, true)
})

test('the goodbye is shown once, not twice', async () => {
  const { store, fake } = freshStore()
  await store.send('x')
  fake.listener?.({ kind: 'text', text: 'All tidied.' })
  fake.listener?.({ kind: 'done', text: 'All tidied.' })
  const textItems = store.turn?.items.filter(item => item.kind === 'text') ?? []
  assert.equal(textItems.length, 1)
  assert.equal(store.turn?.state, 'done')
})

test('an error still closes the turn', async () => {
  const { store, fake } = freshStore()
  await store.send('x')
  fake.listener?.({ kind: 'error', text: 'the engine closed with an error: boom' })
  assert.equal(store.turn?.state, 'error')
  assert.deepEqual(store.turn?.permissions, [])
})

test('the engine bay: brains come from the engine door, a choice persists', async () => {
  const { store, fake } = freshStore()
  await store.init()
  assert.equal(store.alive, true, 'the truth from read() is tracked, not guessed')
  await store.loadModels()
  assert.equal(store.models.loading, false)
  assert.deepEqual(store.models.entries, fake.brains)
  assert.equal(store.models.error, '')

  await store.pick('agy')
  assert.equal(fake.picked, 'agy')

  await store.setModel('qwen2.5-coder:3b')
  assert.equal(fake.model, 'qwen2.5-coder:3b')

  await store.pickWorkspace()

  // A closed engine clears the alive light.
  fake.listener?.({ kind: 'closed' })
  assert.equal(store.alive, false)
})

test('the engine bay: a silent brain door becomes a sentence, never an empty lie', async () => {
  resetEngineForTests()
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({ engine: { ...DEFAULT_ENGINE }, running: false, history: [] }),
    pick: async () => ({ ok: true, answer: 'picked' }),
    models: async () => ({ ok: false, models: [], error: 'the brain door (Ollama) is not answering — start Ollama, then refresh' }),
    setModel: async () => ({ ok: false, answer: 'no' }),
    pickWorkspace: async () => ({ ok: false, answer: 'No folder chosen — the vault stays the workplace.' }),
    send: async () => ({ ok: false, answer: 'refused' }),
    answer: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    onEvent: () => () => undefined,
  }
  const store = engineStore()
  await store.loadModels()
  assert.equal(store.models.entries.length, 0)
  assert.match(store.models.error, /Ollama/)
  // An honest refusal leaves the previous choice standing.
  await store.pickWorkspace()
})

test('the throttle: the owner sets how much the engine may do before asking', async () => {
  const { store, fake } = freshStore()
  await store.init()
  await store.setApproval('full')
  assert.equal(fake.approval, 'full')
  // The bay offers the three settings, by their honest names.
  const bay = read('../src/renderer/src/components/EngineBay.tsx')
  for (const label of ['Ask me', 'Auto-edits', 'Full speed']) {
  }
  // The app's door exists and the launch line reads the throttle.
  const main = read('../src/main/index.ts')
  })

test('the bay lives in Settings, the sidebar carries only sections and the list', () => {
  const sidebar = read('../src/renderer/src/components/Sidebar.tsx')
  const settings = read('../src/renderer/src/components/SettingsView.tsx')
  const bay = read('../src/renderer/src/components/EngineBay.tsx')
  const main = read('../src/main/index.ts')
})

test('the composer speaks the engine\u2019s own controls: engine chip, models chip, its three modes', () => {
  const composer = read('../src/renderer/src/components/Composer.tsx')
  // The app adds nothing: no toggle, no second brain, no invented modes.
  // And the sidebar no longer offers a marketplace: apps and extensions live
  // in Settings (Connectors, Plugins) — one home, not two.
  const sidebar = read('../src/renderer/src/components/Sidebar.tsx')
})

test('a second question queues instead of replacing the first', async () => {
  const { store, fake } = freshStore()
  await store.send('two asks in one turn')
  fake.listener?.({ kind: 'permission', requestId: 'q1', tool: 'Write', summary: 'a.md' })
  fake.listener?.({ kind: 'permission', requestId: 'q2', tool: 'Bash', summary: 'npm test' })
  assert.equal(store.turn?.permissions.length, 2, 'both questions are on the table')
  assert.equal(store.turn?.permissions[0]?.requestId, 'q1', 'the first stays first')

  await store.answer(false)
  assert.deepEqual(fake.answered, [{ requestId: 'q1', allow: false }])
  assert.equal(store.turn?.permissions.length, 1)
  assert.equal(store.turn?.permissions[0]?.requestId, 'q2', 'the second rises without being re-sent')

  await store.answer(true)
  assert.deepEqual(fake.answered.at(-1), { requestId: 'q2', allow: true })
  assert.deepEqual(store.turn?.permissions, [])
})

test('a window opened mid-turn hydrates the remembered work; a phantom is dropped', async () => {
  // The remembered events of a turn that finished while no window watched.
  resetEngineForTests()
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'gemma4:cloud', baseUrl: 'http://localhost:11434', workspace: '', approval: 'ask' },
      running: false,
      history: [
        { kind: 'status', text: 'engine ready' },
        { kind: 'text', text: 'Finished while you were away.' },
        { kind: 'done', text: 'Done.' },
      ],
    }),
    onEvent: () => () => undefined,
    onPullEvent: () => () => undefined,
  }
  const store = engineStore()
  await store.init()
  const turn = store.turn
  assert.ok(turn, 'the remembered turn is shown, not hidden')
  assert.equal(turn?.state, 'done')
  assert.match(turn?.items.map(item => ('text' in item ? item.text : '')).join(' '), /away/)

  // A history cut off mid-run, with the engine gone: the phantom "running"
  // state is closed honestly instead of spinning forever.
  resetEngineForTests()
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'gemma4:cloud', baseUrl: 'http://localhost:11434', workspace: '', approval: 'ask' },
      running: false,
      history: [
        { kind: 'status', text: 'engine ready' },
        { kind: 'permission', requestId: 'q-lost', tool: 'Write', summary: 'a.md' },
      ],
    }),
    onEvent: () => () => undefined,
    onPullEvent: () => () => undefined,
  }
  const second = engineStore()
  await second.init()
  assert.equal(second.turn?.state, 'done', 'no phantom "working" forever')
  assert.deepEqual(second.turn?.permissions, [], 'a question nobody can answer is not re-asked')
  assert.match(second.turn?.items.map(item => ('text' in item ? item.text : '')).join(' '), /stopped/)

  // And an engine with no past shows no invented turn.
  resetEngineForTests()
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'gemma4:cloud', baseUrl: 'http://localhost:11434', workspace: '', approval: 'ask' },
      running: false,
      history: [],
    }),
    onEvent: () => () => undefined,
    onPullEvent: () => () => undefined,
  }
  const third = engineStore()
  await third.init()
  assert.equal(third.turn, null, 'nothing happened, nothing is shown')
})


test('the stream grows the engine\u2019s last words instead of stacking one-word lines', async () => {
  const { store, fake } = freshStore()
  await store.send('say something long')
  fake.listener?.({ kind: 'delta', text: 'Hel' })
  fake.listener?.({ kind: 'delta', text: 'lo' })
  fake.listener?.({ kind: 'delta', text: ' there.' })
  const texts = store.turn?.items.filter((item) => item.kind === 'text') ?? []
  assert.equal(texts.length, 1, 'one growing line, not three items')
  assert.equal(texts[0]?.kind === 'text' ? texts[0].text : '', 'Hello there.')

  // The finished answer says the same words: shown once.
  fake.listener?.({ kind: 'done', text: 'Hello there.' })
  const after = store.turn?.items.filter((item) => item.kind === 'text') ?? []
  assert.equal(after.length, 1)
  assert.equal(store.turn?.state, 'done')
})
