import { test, expect, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_ENGINE, normalizeEngine, selectEngine } from '../src/shared/lib/engine'
import { effortTarget, selectedEffort } from '../src/shared/lib/engineCapabilities'
import { CLAUDE_INSPECTION_REQUEST, checkEffortSelection, inspectClaudeCapabilities, inspectEngineCapabilities, parseClaudeCapabilities } from '../src/main/engine/nativeCapabilities'
import { agyArguments } from '../src/main/engine/agy'
import { inferenceAllowed } from '../src/main/automation/inferencePolicy'
import { discoverClaudeModels } from '../src/main/engine/modelDiscovery'

const settings = { ...DEFAULT_ENGINE, cloudProvider: 'native' as const, model: 'sonnet' }
// Schema captured from real Claude Code 2.1.303 initialize, with illustrative
// model identities. This is NOT a signed-in account or agy acceptance fixture.
const frame = (patch: Record<string, unknown> = {}) => ({ type: 'control_response', response: {
  subtype: 'success', request_id: 'oddbrain-model-capabilities', response: {
    claude_code_version: '2.1.303', account: { apiProvider: 'firstParty', tokenSource: 'none' },
    models: [{ value: 'sonnet', displayName: 'Sonnet', resolvedModel: 'claude-fixture', supportsEffort: true, supportedEffortLevels: ['low', 'high'] }], ...patch,
  },
} })
const parse = (patch = {}, selected = settings) => parseClaudeCapabilities(frame(patch), selected)!

test('native metadata supplies exact model-scoped levels without inventing medium', () => {
  const report = parse()
  expect(report.effort.levels).toEqual(['low', 'high'])
  expect(report.models).toEqual([{ name: 'sonnet', displayName: 'Sonnet', cloud: true, provider: 'native', sizeGB: null }])
  expect(report.effort.note).toContain('not an account-access check')
  expect(parse({}, { ...settings, model: 'claude-fixture' }).effort.status).toBe('reported')
  expect(JSON.stringify(report)).not.toContain('tokenSource')
})
test('unknown schema, a refusal, unrelated request or model text is not capability evidence', () => {
  expect(parseClaudeCapabilities({ type: 'result', result: frame() }, settings)).toBeNull()
  expect(parseClaudeCapabilities({ ...frame(), response: { ...frame().response, request_id: 'other' } }, settings)).toBeNull()
  expect(() => parse({ models: {} })).toThrow()
  expect(() => parseClaudeCapabilities({ ...frame(), response: { ...frame().response, subtype: 'error' } }, settings)).toThrow()
})
test('model names are not heuristics for effort, even when familiar', () => {
  for (const row of [
    { value: 'sonnet' }, { value: 'sonnet', supportsEffort: true },
    { value: 'sonnet', supportsEffort: true, supportedEffortLevels: ['future-level'] },
    { value: 'sonnet', supportsEffort: true, supportedEffortLevels: ['default'] },
  ]) expect(parse({ models: [row] }).effort.status).toBe('unverified')
  expect(parse({ models: [{ value: 'sonnet', supportsEffort: false }] }).effort.status).toBe('unsupported')
  expect(parse({}, { ...settings, model: 'missing' }).effort.levels).toEqual([])
  expect(parse({}, { ...settings, model: '' }).effort.levels).toEqual([])
})
test('native metadata never claims saved-key, Ollama, or alternate-provider parity', () => {
  for (const cloudProvider of ['anthropic', ''] as const) expect(parse({}, { ...settings, cloudProvider } as typeof settings).effort.status).toBe('unverified')
  expect(parse({ account: { apiProvider: 'bedrock' } }).effort.status).toBe('unverified')
  expect(parse({ account: undefined }).effort.status).toBe('unverified')
})
test('unsafe IDs cannot reach a native model picker', () => {
  expect(() => parse({ models: [{ value: '--effort' }, { value: 'a; echo unsafe' }, null] })).toThrow(/catalog/)
})
test('effort is scoped to the engine, provider, model, endpoint and workspace', () => {
  const selected = { ...settings, thinking: 'high' as const, effortTarget: effortTarget(settings) }
  expect(selectedEffort(selected)).toBe('high')
  for (const patch of [{ id: 'agy' as const }, { cloudProvider: '' as const }, { model: 'different' }, { baseUrl: 'http://other' }, { workspace: '/other' }]) expect(selectedEffort({ ...selected, ...patch })).toBe('default')
  expect(selectEngine(selected, 'agy').thinking).toBe('default')
  expect(normalizeEngine({ ...selected, thinking: 'extended' as never }).thinking).toBe('default')
  expect(selectedEffort({ ...selected, thinking: 'garbage' as never })).toBe('default')
})
test('the main-process effort guard checks the native report, not an IPC claim', async () => {
  const inspect = vi.fn(async () => parse())
  for (const value of ['extended', 'auto', '--x', 'medium']) expect((await checkEffortSelection(settings, value, effortTarget(settings), inspect)).ok).toBe(false)
  expect((await checkEffortSelection(settings, 'high', 'old-target', inspect)).ok).toBe(false)
  expect((await checkEffortSelection(settings, 'high', effortTarget(settings), inspect)).ok).toBe(true)
  inspect.mockClear()
  expect((await checkEffortSelection(settings, 'default', effortTarget(settings), inspect)).ok).toBe(true)
  expect(inspect).not.toHaveBeenCalled()
  expect((await checkEffortSelection(settings, 'high', effortTarget(settings), async () => ({ ...parse(), effort: { ...parse().effort, target: 'other' } }))).ok).toBe(false)
})
test('agy preserves its native default and never converts Extended into high', async () => {
  const agy = { ...DEFAULT_ENGINE, id: 'agy' as const }
  expect(agyArguments(agy)).not.toContain('--model')
  expect(agyArguments({ ...agy, thinking: 'extended' as never })).not.toContain('--effort')
  const report = await inspectEngineCapabilities(agy)
  expect(report.effort.status).toBe('unverified'); expect(report.effort.levels).toEqual([])
})
test('native model routing is external even when Ollama has an identically named local model', async () => {
  const fetch = vi.fn()
  expect((await inferenceAllowed(settings, true, false, fetch)).ok).toBe(false)
  expect((await inferenceAllowed(settings, false, true, fetch)).ok).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
})
test('native catalog survives offline Ollama and labels duplicate provider names independently', async () => {
  const report = await discoverClaudeModels({ baseUrl: 'http://fixture', nativeModels: async () => parse().models, fetchImpl: async () => { throw Error() }, providerModels: async () => [{ name: 'sonnet' }] })
  expect(report.ok).toBe(true)
  expect(report.models.map(m => m.provider)).toEqual(['native', 'anthropic'])
})

test('metadata subprocess sends only initialize, closes afterwards and uses no shell or prompt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oddbrain-capability-')), script = join(dir, 'fake.cjs'), capture = join(dir, 'stdin.txt')
  writeFileSync(script, `const fs = require('node:fs'); process.stdin.on('data', d => { fs.appendFileSync(${JSON.stringify(capture)}, d); const r = JSON.parse(d); if(r.type !== 'control_request' || r.request.subtype !== 'initialize') process.exit(8); process.stdout.write(${JSON.stringify(JSON.stringify(frame()) + '\n')}); });`)
  let child: ReturnType<typeof spawn> | undefined
  const start = vi.fn((command, args, options) => { expect(options.shell).toBe(false); expect(args).not.toContain('--print'); expect(args).toContain('{"disableAllHooks":true}'); child = spawn(process.execPath, [script], options); return child }) as unknown as typeof spawn
  try {
    const result = await inspectClaudeCapabilities(settings, { spawnProcess: start })
    expect(result.effort.levels).toEqual(['low', 'high'])
    expect(readFileSync(capture, 'utf8')).toBe(CLAUDE_INSPECTION_REQUEST)
    await new Promise(resolve => { if (child!.exitCode !== null || child!.signalCode !== null) resolve(undefined); else child!.once('close', resolve) })
    expect(child!.exitCode !== null || child!.signalCode !== null).toBe(true)
  } finally { child?.kill(); rmSync(dir, { recursive: true, force: true }) }
})
test('inspection fails closed on timeout, canceled requests, shims and missing binaries', async () => {
  const start = vi.fn((_command, _args, options) => spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], options)) as unknown as typeof spawn
  expect((await inspectClaudeCapabilities(settings, { spawnProcess: start, timeoutMs: 30 })).ok).toBe(false)
  const never = vi.fn() as unknown as typeof spawn
  expect((await inspectClaudeCapabilities(settings, { spawnProcess: never, signal: AbortSignal.abort() })).ok).toBe(false)
  expect((await inspectClaudeCapabilities(settings, { spawnProcess: never, command: 'claude.cmd' })).ok).toBe(false)
  expect(never).not.toHaveBeenCalled()
  expect((await inspectClaudeCapabilities(settings, { command: '/not/a/real/binary' })).ok).toBe(false)
})

test('inspection jobs coalesce per window, cancel when the route changes, and discard finished account metadata', async () => {
  const { createCapabilityInspector } = await import('../src/main/engine/nativeCapabilities')
  const pending: Array<{ signal: AbortSignal; finish(value: ReturnType<typeof parse>): void }> = []
  const run = vi.fn((_settings, options) => new Promise<ReturnType<typeof parse>>(resolve => {
    pending.push({ signal: options.signal, finish: resolve }); options.signal.addEventListener('abort', () => resolve(parse()))
  }))
  const inspector = createCapabilityInspector(run)
  const first = inspector.inspect(1, settings, '/work')
  expect(inspector.inspect(1, settings, '/work')).toBe(first)
  expect(run).toHaveBeenCalledTimes(1)
  const second = inspector.inspect(1, { ...settings, model: 'other' }, '/work')
  expect(pending[0].signal.aborted).toBe(true)
  await first
  expect(inspector.inspect(1, { ...settings, model: 'other' }, '/work')).toBe(second)
  pending[1].finish(parse()); await second
  const fresh = inspector.inspect(1, settings, '/work')
  expect(run).toHaveBeenCalledTimes(3)
  inspector.cancelAll(); expect(pending[2].signal.aborted).toBe(true); await fresh
})

test('dispatch rechecks persisted effort before sending and guards a changed executable', () => {
  const main = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  const send = main.slice(main.indexOf("'engine:send'"), main.indexOf('// Bringing a brain home'))
  expect(send.indexOf('await checkEffortSelection(usedEngine')).toBeGreaterThan(0)
  expect(send.indexOf('await checkEffortSelection(usedEngine')).toBeLessThan(send.indexOf('dispatchRecordedTurn(turnArchive'))
  expect(send).toContain('usedCommand !== resolveEngineCommand(usedEngine.id)')
  expect(send).toContain('No message was sent.')
})
