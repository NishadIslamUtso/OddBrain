// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { engineStore, resetEngineForTests } from '../src/renderer/src/state/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
let api: any
beforeEach(() => {
  resetEngineForTests(); engineStore().clearLine()
  api = { read: vi.fn().mockResolvedValue({ engine: { ...DEFAULT_ENGINE, model: 'hydrated-model' }, running: false, history: [] }),
    send: vi.fn().mockResolvedValue({ ok: true, answer: 'started', transcriptId: 'turn-one' }), onEvent: () => () => {}, onPullEvent: () => () => {}, stop: async () => ({ ok: true }) }
  Object.assign(window, { api: {}, engineApi: api })
})
afterEach(() => { resetEngineForTests(); engineStore().clearLine(); delete (window as any).api; delete (window as any).engineApi })
test('send waits for an already-running cold initialization', async () => {
  let read!: (value: unknown) => void; api.read.mockImplementation(() => new Promise(resolve => { read = resolve }))
  const init = engineStore().init(), send = engineStore().send('Task')
  expect(api.send).not.toHaveBeenCalled()
  read({ engine: { ...DEFAULT_ENGINE, model: 'real-choice' }, running: false, history: [] })
  await init; await send
  expect(engineStore().settings.model).toBe('real-choice'); expect(api.send).toHaveBeenCalledTimes(1)
})
test('two quick send calls cannot replace one pending turn or dispatch twice', async () => {
  let read!: (value: unknown) => void; api.read.mockImplementation(() => new Promise(resolve => { read = resolve }))
  const first = engineStore().send('First'), second = await engineStore().send('Second')
  expect(second.ok).toBe(false)
  read({ engine: DEFAULT_ENGINE, running: false, history: [] }); await first
  expect(api.send).toHaveBeenCalledTimes(1); expect(engineStore().turn?.prompt).toBe('First')
})
test('stop during initialization cancels the unsent task', async () => {
  let read!: (value: unknown) => void; api.read.mockImplementation(() => new Promise(resolve => { read = resolve }))
  const send = engineStore().send('Not sent'); await engineStore().stop()
  read({ engine: DEFAULT_ENGINE, running: false, history: [] })
  expect((await send).ok).toBe(false); expect(api.send).not.toHaveBeenCalled()
})
test('failed IPC reports uncertainty and does not leave a permanently running card', async () => {
  api.send.mockRejectedValue(Error('connection lost'))
  expect((await engineStore().send('Retain this draft')).ok).toBe(false)
  expect(engineStore().turn?.state).toBe('error'); expect(engineStore().turn?.prompt).toBe('Retain this draft')
})
test('an unscoped quick-window record cannot contaminate a chat-owned turn', async () => {
  await engineStore().send('Chat task', [], { chatId: 'chat-a' })
  engineStore().ingest({ kind: 'done', text: 'My answer', transcriptId: 'turn-one', chatId: 'chat-a' })
  engineStore().ingest({ kind: 'text', text: 'Other window’s private answer', transcriptId: 'quick-turn' })
  expect(engineStore().turn?.items.some(item => 'text' in item && item.text.includes('Other window'))).toBe(false)
  expect(engineStore().ambient.busy).toBe(true)
  engineStore().ingest({ kind: 'done', text: 'Other answer', transcriptId: 'quick-turn' })
  expect(engineStore().ambient.busy).toBe(false)
})

test.each([false, true])('events arriving during hydration are not lost or replayed twice (snapshot contains event: %s)', async included => {
  let receive!: (event: any) => void, finish!: (value: unknown) => void
  api.onEvent = (listener: any) => { receive = listener; return () => {} }
  api.read.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const opening = engineStore().init()
  const permission = { kind: 'permission', requestId: 'waiting', tool: 'Write', summary: 'actual question', sequence: 2, chatId: 'chat-a', transcriptId: 'active-turn' }
  receive(permission)
  finish({ engine: DEFAULT_ENGINE, running: true, busy: true, active: { prompt: 'Actual request', chatId: 'chat-a', transcriptId: 'active-turn' }, lastSequence: included ? 2 : 1,
    history: [{ kind: 'status', text: 'Started', sequence: 1, chatId: 'chat-a', transcriptId: 'active-turn' }, ...(included ? [permission] : [])] })
  await opening
  expect(engineStore().turn?.prompt).toBe('Actual request')
  expect(engineStore().turn?.permissions).toHaveLength(1)
  receive(permission); expect(engineStore().turn?.permissions).toHaveLength(1)
})
