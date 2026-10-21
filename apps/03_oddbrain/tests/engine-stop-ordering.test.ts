// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { EngineEvent } from '../src/shared/lib/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import { engineStore, resetEngineForTests } from '../src/renderer/src/state/engine'

let hear: (event: EngineEvent) => void
let finishStop: (answer: { ok: boolean; answer?: string }) => void
let api: Record<string, any>

beforeEach(async () => {
  resetEngineForTests()
  api = {
    read: async () => ({ engine: { ...DEFAULT_ENGINE }, running: true, active: { transcriptId: 'turn-1', chatId: 'chat-1', prompt: 'finish safely' }, history: [] }),
    onEvent: (listener: typeof hear) => { hear = listener; return () => {} },
    onPullEvent: () => () => {},
    stop: vi.fn(() => new Promise(resolve => { finishStop = resolve })),
    send: vi.fn(),
  }
  ;(window as any).api = {}; (window as any).engineApi = api
  await engineStore().init()
})
afterEach(() => { resetEngineForTests(); delete (window as any).api; delete (window as any).engineApi })

test('Stop stays pending and blocks sends until the recorded closed event arrives', async () => {
  const stopping = engineStore().stop()
  expect(engineStore().stopping).toBe(true)
  expect(engineStore().turn?.state).toBe('running')
  const send = await engineStore().send('do not dispatch')
  expect(send.ok).toBe(false); expect(send.answer).toContain('Stop is still being confirmed'); expect(api.send).not.toHaveBeenCalled()

  hear({ kind: 'closed', transcriptId: 'turn-1' })
  expect(engineStore().stopping).toBe(false)
  expect(engineStore().turn?.state).toBe('done')
  finishStop({ ok: true })
  await stopping
})

test('an uncertain Stop response is visible and does not fabricate completion', async () => {
  const stopping = engineStore().stop()
  finishStop({ ok: false, answer: 'Stop timed out; process exit is uncertain.' })
  await stopping
  expect(engineStore().stopping).toBe(true)
  expect(engineStore().turn?.state).toBe('running')
  expect(engineStore().turn?.items.some(item => item.kind === 'status' && item.text.includes('uncertain'))).toBe(true)
})
