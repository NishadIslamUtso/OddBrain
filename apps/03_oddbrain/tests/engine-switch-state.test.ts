// @vitest-environment jsdom
import { test, expect, beforeEach, afterEach } from 'vitest'
import { engineStore, resetEngineForTests } from '../src/renderer/src/state/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
let api: any
beforeEach(async () => {
  resetEngineForTests()
  api = {
    read: async () => ({ engine: { ...DEFAULT_ENGINE, model: 'old-fixture', cloudProvider: 'anthropic' }, running: false, history: [] }),
    onEvent: () => () => {}, onPullEvent: () => () => {}, pick: async () => ({ ok: true }),
    models: async () => ({ ok: false, models: [], error: 'No verified agy catalog.' }),
  }
  ;(window as any).api = {}; (window as any).engineApi = api
  await engineStore().init()
})
afterEach(() => { resetEngineForTests(); delete (window as any).api; delete (window as any).engineApi })
test('switching resets model/provider and does not accept a late prior-engine listing', async () => {
  let finish!: (value: unknown) => void
  api.models = () => new Promise(resolve => { finish = resolve })
  const old = engineStore().loadModels()
  api.models = async () => ({ ok: false, models: [], error: 'No verified agy catalog.' })
  await engineStore().pick('agy')
  finish({ ok: true, models: [{ name: 'old-fixture', provider: 'anthropic', cloud: true, sizeGB: null }] }); await old
  expect(engineStore().settings.id).toBe('agy'); expect(engineStore().settings.model).toBe(''); expect(engineStore().settings.cloudProvider).toBe('')
  expect(engineStore().models.entries).toEqual([]); expect(engineStore().models.loading).toBe(false)
})
test('a busy-main refusal leaves engine and model untouched and reports the reason', async () => {
  api.pick = async () => ({ ok: false, answer: 'Stop the active task first.' })
  await engineStore().pick('agy')
  expect(engineStore().settings.id).toBe('claude-code'); expect(engineStore().settings.model).toBe('old-fixture'); expect(engineStore().models.error).toContain('Stop')
})
test('model fetch rejection clears loading and successful partial results remain available', async () => {
  api.models = async () => { throw Error('offline') }; await engineStore().loadModels()
  expect(engineStore().models.loading).toBe(false)
  api.models = async () => ({ ok: true, models: [{ name: 'provider-fixture', provider: 'anthropic', cloud: true, sizeGB: null }], error: 'Ollama unavailable.' })
  await engineStore().loadModels()
  expect(engineStore().models.entries[0].name).toBe('provider-fixture'); expect(engineStore().models.error).toContain('Ollama')
})
