import { describe, expect, test } from 'vitest'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import { effortTarget, unverifiedCapabilities } from '../src/shared/lib/engineCapabilities'
import { agyCommandData, inspectAgyCapabilities, parseAgyEffort, parseAgyModels, runAgyInspection, supportsAgyInspection } from '../src/main/engine/agyDiscovery'

// Synthetic contracts, not signed-in CLI captures. Models schema cross-checked
// against github.com/maruel/genai/providers/antigravity/testdata/ListModels.ndjson.
// Effort field names are conditional: no raw native effort capture is available.
const settings = { ...DEFAULT_ENGINE, id: 'agy' as const, model: 'model-one', cloudProvider: 'native' as const }
const envelope = (name: string, data: unknown, overrides = {}) => JSON.stringify({ status: 'SUCCESS', num_turns: 0, conversation_id: '', usage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 }, command: { name, data }, ...overrides })
const models = envelope('models', { models: [{ id: 'model-one', label: 'Native choice' }] })
const effort = envelope('effort', { adjustable: true, available: ['low', 'high'], current: 'high' })
const report = () => unverifiedCapabilities(settings, 'Not checked')

describe('agy read-only discovery', () => {
  test.each(['1.1.10', '0.9.99', 'unknown', 'some model says 1.4.2', '1.4.2-beta'])('does not risk a prompt with an unverified release: %s', raw => expect(supportsAgyInspection(raw)).toBeNull())
  test.each(['1.1.11', 'agy 1.3.2', 'agy version v1.4.2', 'agy CLI 2.0.0'])('accepts a supported version: %s', raw => expect(supportsAgyInspection(raw)).toBeTruthy())
  test('reads native IDs and labels, deduplicates and marks native routing', () => {
    expect(parseAgyModels(models)).toEqual([{ name: 'model-one', displayName: 'Native choice', provider: 'native', cloud: true, sizeGB: null }])
    expect(parseAgyModels(envelope('models', { models: [{ id: 'one' }, { id: 'one' }] }))).toHaveLength(1)
    const stream = JSON.stringify({ event: 'command_result', command: JSON.parse(models).command }) + '\n' + JSON.stringify({ event: 'result', result: JSON.parse(models) })
    expect(parseAgyModels(stream)).toEqual(parseAgyModels(models))
    expect(parseAgyModels(JSON.stringify(JSON.parse(models), null, 2))).toEqual(parseAgyModels(models))
  })
  test.each([{ status: 'ERROR' }, { num_turns: 1 }, { conversation_id: 'real-turn' }, { usage: { input_tokens: 1 } }, { command: { name: 'wrong', data: {} } }])('rejects non-metadata results %j', overrides => expect(() => agyCommandData(envelope('models', {}, overrides), 'models')).toThrow())
  test('does not trust response text, unexpected frames or multiple results', () => {
    expect(() => parseAgyModels(envelope('models', {}, { response: 'models: model-one' }))).toThrow()
    expect(() => parseAgyModels(models + '\n' + models)).toThrow()
    expect(() => parseAgyModels('{"event":"step_update"}\n' + models)).toThrow()
    expect(() => parseAgyModels(envelope('models', { models: [{ id: '--unsafe' }] }))).toThrow()
  })
  test('conditional effort support requires explicit exact native metadata, never model suffixes', () => {
    expect(parseAgyEffort(effort, report()).effort.levels).toEqual(['low', 'high'])
    expect(parseAgyEffort(effort, report(), 'high').effort.status).toBe('reported')
    expect(() => parseAgyEffort(effort, report(), 'low')).toThrow()
    expect(parseAgyEffort(envelope('effort', { adjustable: false }), report()).effort.status).toBe('unsupported')
    for (const data of [{ current: 'high', available: ['low', 'high'] }, { adjustable: true, current: 'high', available: ['unknown'] }, { adjustable: true, current: 'medium', available: ['low', 'high'] }]) expect(() => parseAgyEffort(envelope('effort', data), report())).toThrow()
  })
  test('uses global flags before models, and only the version-gated read-only effort command', async () => {
    const calls: string[][] = []
    const chosen = { ...settings, thinking: 'high' as const, effortTarget: effortTarget(settings) }
    const result = await inspectAgyCapabilities(chosen, { run: async (_command, args) => { calls.push(args); return calls.length === 1 ? '1.4.2' : calls.length === 2 ? '  models  List models\n --output-format --effort' : calls.length === 3 ? models : effort } })
    expect(result.ok).toBe(true)
    expect(result.effort.status).toBe('reported')
    expect(calls).toEqual([['--version'], ['--help'], ['--output-format', 'stream-json', 'models'], ['--output-format', 'json', '--model', 'model-one', '--effort', 'high', '--print', '/effort']])
  })
  test('old versions stop before help or slash commands', async () => {
    const calls: string[][] = []
    const result = await inspectAgyCapabilities(settings, { run: async (_command, args) => { calls.push(args); return '1.1.10' } })
    expect(result.ok).toBe(false); expect(calls).toEqual([['--version']])
  })
  test('unknown effort schema keeps discovered models but exposes no speculative choices', async () => {
    let n = 0
    const result = await inspectAgyCapabilities(settings, { run: async () => ['1.4.2', '  models\n --output-format --effort', models, envelope('effort', { answer: 'high' })][n++] })
    expect(result.ok).toBe(true); expect(result.models).toHaveLength(1)
    expect(result.effort.status).toBe('unverified'); expect(result.effort.levels).toEqual([])
  })
  test('does not probe effort for an absent model or an API-provider route', async () => {
    for (const over of [{ model: 'absent-high' }, { cloudProvider: 'anthropic' as const }, { model: '' }]) {
      let n = 0
      await inspectAgyCapabilities({ ...settings, ...over }, { run: async () => ['1.4.2', '  models\n --output-format --effort', models][n++] })
      expect(n).toBe(3)
    }
  })
  test('subprocess has closed stdin, no shell, and preserves split UTF-8', async () => {
    const output = await runAgyInspection(process.execPath, ['-e', `process.stdin.resume();process.stdin.on('end',()=>{const b=Buffer.from('বাংলা');for(const v of b)process.stdout.write(Buffer.from([v]))})`])
    expect(output).toBe('বাংলা')
  })
  test('bounded, cancellable subprocess never exposes stderr secrets', async () => {
    await expect(runAgyInspection(process.execPath, ['-e', `process.stderr.write('SECRET');process.exitCode=1`])).rejects.not.toThrow('SECRET')
    await expect(runAgyInspection(process.execPath, ['-e', `process.stdout.write('x'.repeat(1000001));setInterval(()=>{},1000)`])).rejects.toThrow('too much')
    await expect(runAgyInspection(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 20 })).rejects.toThrow('timed out')
    const controller = new AbortController()
    const pending = runAgyInspection(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal })
    controller.abort(); await expect(pending).rejects.toThrow('Canceled')
    await expect(runAgyInspection('agy.cmd', [])).rejects.toThrow('native')
  })
})

test('agy save validation probes the newly requested effort, not the old saved value', async () => {
  const { checkEffortSelection } = await import('../src/main/engine/nativeCapabilities')
  let inspected: typeof settings | undefined
  const checked = await checkEffortSelection(settings, 'high', effortTarget(settings), async selected => {
    inspected = selected as typeof settings
    return parseAgyEffort(effort, report(), 'high')
  })
  expect(checked.ok).toBe(true)
  expect(inspected).toMatchObject({ thinking: 'high', effortTarget: effortTarget(settings) })
})

test('agy jobs coalesce by effort as well as route, cancel old work, and never invoke Claude', async () => {
  const { createCapabilityInspector } = await import('../src/main/engine/nativeCapabilities')
  const { vi } = await import('vitest')
  const pending: Array<{ signal: AbortSignal; finish: (value: ReturnType<typeof report>) => void }> = []
  const agy = vi.fn((_settings, options) => new Promise<ReturnType<typeof report>>(resolve => {
    pending.push({ signal: options.signal, finish: resolve })
    options.signal.addEventListener('abort', () => resolve(report()))
  }))
  const claude = vi.fn(async () => report())
  const inspector = createCapabilityInspector(claude, agy)
  const first = inspector.inspect(1, settings, '/work')
  expect(inspector.inspect(1, settings, '/work')).toBe(first)
  const high = { ...settings, thinking: 'high' as const, effortTarget: effortTarget(settings) }
  const next = inspector.inspect(1, high, '/work')
  expect(pending[0].signal.aborted).toBe(true); await first
  expect(inspector.inspect(1, high, '/work')).toBe(next)
  const otherWindow = inspector.inspect(2, high, '/work')
  inspector.cancel(1); await next
  expect(pending[2].signal.aborted).toBe(false)
  pending[2].finish(report()); await otherWindow
  expect(claude).not.toHaveBeenCalled(); expect(agy).toHaveBeenCalledTimes(3)
})
