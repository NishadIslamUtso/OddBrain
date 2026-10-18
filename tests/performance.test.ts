import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CUSTOM_FIELDS,
  DEFAULT_INFERENCE,
  INFERENCE_KEY,
  clampCustomOption,
  customRange,
  customValue,
  normalizeInference,
  withCustomOption,
  withProfile,
} from '../src/renderer/src/state/performance'
import { resolveInference } from '../src/shared/lib/inference'

/**
 * Settings > Performance.
 *
 * inference.ts already decides what goes to Ollama; this is the stored side.
 * So the two things worth proving are: left alone it changes nothing about the
 * request, and whatever a person types ends up in it — clamped, and never as a
 * broken value.
 */

test('left alone, the stored default is the 4 GB profile the app already used', () => {
  const resolved = resolveInference(DEFAULT_INFERENCE)
  assert.equal(resolved.profile, '4gb')
  assert.equal(resolved.keepAlive, '5m')
  assert.deepEqual(resolved.options, { num_ctx: 4096, num_batch: 256, num_predict: 1024 })
})

test('a damaged stored value becomes the safe profile, not a broken request', () => {
  assert.deepEqual(normalizeInference(null), { profile: '4gb' })
  assert.deepEqual(normalizeInference('6gb'), { profile: '4gb' })
  assert.deepEqual(normalizeInference({ profile: '64gb' }), { profile: '4gb' })
  assert.deepEqual(normalizeInference({ profile: '6gb' }), { profile: '6gb' })
  assert.equal(resolveInference(normalizeInference({ profile: 'nonsense' })).options.num_ctx, 4096)
  assert.equal(resolveInference(normalizeInference({ profile: 'cpu' })).options.num_gpu, 0)
})

test('custom keeps typed numbers and drops everything else', () => {
  assert.deepEqual(
    normalizeInference({
      profile: 'custom',
      customOptions: { num_ctx: 8192, num_batch: '512', num_gpu: '', num_predict: 'abc', junk: 7 },
    }),
    { profile: 'custom', customOptions: { num_ctx: '8192', num_batch: '512' } }
  )
})

test('choosing Custom starts from the numbers in use, and keeps them across a detour', () => {
  // Four empty boxes would be a worse answer than the numbers that were running.
  assert.deepEqual(withProfile({ profile: '4gb' }, 'custom'), {
    profile: 'custom',
    customOptions: { num_ctx: '4096', num_batch: '256', num_predict: '1024' },
  })

  const typed = withCustomOption(withProfile({ profile: '4gb' }, 'custom'), 'num_ctx', '2048')
  const detour = withProfile(typed, '8gb')
  assert.equal(detour.profile, '8gb')
  // The other profile's own numbers are what get sent...
  assert.equal(resolveInference(detour).options.num_ctx, 16384)
  // ...and coming back to Custom finds what was typed.
  assert.equal(customValue(withProfile(detour, 'custom'), 'num_ctx'), '2048')
})

test('a typed value reaches the request, clamped to the range that is shown', () => {
  const typed = withCustomOption({ profile: 'custom' }, 'num_ctx', '8192')
  assert.equal(resolveInference(typed).options.num_ctx, 8192)

  const huge = clampCustomOption(withCustomOption({ profile: 'custom' }, 'num_ctx', '999999'), 'num_ctx')
  assert.equal(customValue(huge, 'num_ctx'), '32768')
  assert.equal(resolveInference(huge).options.num_ctx, 32768)

  const tiny = clampCustomOption(withCustomOption({ profile: 'custom' }, 'num_gpu', '-5'), 'num_gpu')
  assert.equal(customValue(tiny, 'num_gpu'), '0')

  const nonsense = clampCustomOption(withCustomOption({ profile: 'custom' }, 'num_ctx', 'abc'), 'num_ctx')
  assert.equal(customValue(nonsense, 'num_ctx'), '')
})

test('a blank box keeps the model default instead of sending zero', () => {
  const cleared = withCustomOption(
    { profile: 'custom', customOptions: { num_ctx: '4096' } },
    'num_ctx',
    ''
  )
  assert.deepEqual(cleared.customOptions, {})
  assert.deepEqual(resolveInference(cleared).options, {})
  assert.equal(resolveInference(cleared).keepAlive, '5m', 'a profile still answers for the load window')
})

test('the four fields are exactly the options Ollama is given, with real ranges', () => {
  assert.deepEqual(
    CUSTOM_FIELDS.map(field => field.key),
    ['num_ctx', 'num_batch', 'num_predict', 'num_gpu']
  )
  assert.equal(customRange('num_ctx'), '512–32768')
  assert.equal(customRange('num_batch'), '64–2048')
  assert.equal(customRange('num_predict'), '128–8192')
  assert.equal(customRange('num_gpu'), '0–999')
  assert.equal(INFERENCE_KEY, 'ai-assistant.inference')
})
