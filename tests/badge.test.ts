import test from 'node:test'
import assert from 'node:assert/strict'
import { isCloudModelName } from '../src/shared/lib/providers'

/** One classification for every list: a model cannot look local in one list and cloud in another. */
test('the cloud badge asks one function about one name', () => {
  assert.equal(isCloudModelName('gemma4:cloud'), true, 'Ollama\u2019s cloud suffix')
  assert.equal(isCloudModelName('qwen3-coder-cloud'), true, 'the dashed shape counts too')
  assert.equal(isCloudModelName('openai/gpt-4o'), true, 'a provider\u2019s own entry')
  assert.equal(isCloudModelName('llama3:latest'), false)
  assert.equal(isCloudModelName('qwen2.5-coder:3b'), false)
  assert.equal(isCloudModelName('deepseek-r1:8b'), false)
  assert.equal(isCloudModelName(''), false)
  assert.equal(isCloudModelName(undefined), false, 'a non-name is not a cloud brain')
})
