import { test, expect } from 'vitest'
import { discoverClaudeModels } from '../src/main/engine/modelDiscovery'
import { DEFAULT_ENGINE, selectEngine } from '../src/shared/lib/engine'
const response = (models: unknown[]) => (async () => new Response(JSON.stringify({ models }))) as typeof fetch

test('Anthropic model discovery succeeds independently of an offline Ollama', async () => {
  const result = await discoverClaudeModels({ baseUrl: 'http://fixture', fetchImpl: async () => { throw Error('offline') }, providerModels: async () => [{ name: 'provider-fixture' }] })
  expect(result.ok).toBe(true); expect(result.models).toEqual([{ name: 'provider-fixture', cloud: true, provider: 'anthropic', sizeGB: null }]); expect(result.error).toContain('Ollama')
})
test('Ollama remains usable when the authorized provider fails', async () => {
  const result = await discoverClaudeModels({ baseUrl: 'http://fixture', fetchImpl: response([{ name: 'local-fixture', size: 1e9 }]), providerModels: async () => { throw Error('secret diagnostic') } })
  expect(result.ok).toBe(true); expect(result.models[0].name).toBe('local-fixture'); expect(result.error).toContain('Anthropic'); expect(result.error).not.toContain('secret')
})
test('HTTP failure still queries the provider; equal names preserve separate routes', async () => {
  const unavailable = await discoverClaudeModels({ baseUrl: 'http://fixture', fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch, providerModels: async () => [{ name: 'fixture' }] })
  expect(unavailable.ok).toBe(true)
  const result = await discoverClaudeModels({ baseUrl: 'http://fixture', fetchImpl: response([{ name: 'fixture' }]), providerModels: async () => [{ name: 'fixture' }, { name: 'fixture' }] })
  expect(result.models).toHaveLength(2); expect(result.models.map(m => m.provider)).toEqual([undefined, 'anthropic'])
})
test('missing provider authorization never fabricates a provider source or successful offline listing', async () => {
  expect((await discoverClaudeModels({ baseUrl: 'http://fixture', fetchImpl: async () => { throw Error() } })).ok).toBe(false)
  expect((await discoverClaudeModels({ baseUrl: 'http://fixture', fetchImpl: response([]) })).models).toEqual([])
})
test('changing engines clears incompatible model/provider choices, preserving workspace and permissions', () => {
  const current = { ...DEFAULT_ENGINE, model: 'provider-fixture', cloudProvider: 'anthropic' as const, workspace: '/fixture', approval: 'plan' as const }
  expect(selectEngine(current, 'agy')).toEqual({ ...current, id: 'agy', model: '', cloudProvider: '' })
  expect(selectEngine(current, 'claude-code')).toBe(current)
  expect(selectEngine(selectEngine(current, 'agy'), 'claude-code').model).toBe('')
})

test('oversized local discovery cannot suppress the independent authorized provider', async () => {
  const result = await discoverClaudeModels({ baseUrl: 'http://fixture', fetchImpl: (async () => new Response(JSON.stringify({ models: [{ name: 'x'.repeat(2_000_001) }] }))) as typeof fetch, providerModels: async () => [{ name: 'provider-fixture' }] })
  expect(result.models.map(m => m.name)).toEqual(['provider-fixture'])
  expect(result.error).toContain('Ollama models unavailable')
})

test('remote-host metadata and cloud suffixes are consistently classified; invalid sizes are not shown', async () => {
  const result = await discoverClaudeModels({ baseUrl: 'http://fixture', fetchImpl: response([
    { name: 'opaque', remote_host: 'cloud.example', size: 1e9 },
    { name: 'model-cloud', size: 1e9 }, { name: 'negative', size: -1 }, { name: 'normal', size: 1e9 }
  ]) })
  expect(result.models.map(m => [m.name, m.cloud, m.sizeGB])).toEqual([
    ['opaque', true, null], ['model-cloud', true, null], ['negative', false, null], ['normal', false, 1]
  ])
})
