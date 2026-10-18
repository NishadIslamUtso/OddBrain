// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveKeepAlive } from '../src/shared/lib/ollama'

/**
 * The "always loaded" switch: the memory profile is the default answer, the
 * person's override ('-1', Ollama's own stay-forever) wins only when set.
 */
test('keep-alive: the profile answers until the override speaks', () => {
  assert.equal(effectiveKeepAlive('5m'), '5m')
  assert.equal(effectiveKeepAlive('15m', undefined), '15m')
  assert.equal(effectiveKeepAlive('5m', -1), -1, 'always loaded is Ollama\u2019s own number, passed through')
  assert.equal(effectiveKeepAlive('15m', ''), '15m', 'an empty override is no override')
})
