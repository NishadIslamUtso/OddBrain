import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ANTHROPIC_VERSION,
  CLOUD_PROVIDERS,
  baseUrlFor,
  buildChatRequest,
  buildModelsRequest,
  cloudModelName,
  createSseParser,
  parseCloudModel,
  providerById,
  readModelNames,
  translateSseEvent,
} from '../src/shared/lib/providers'

/**
 * The provider layer, tested without a network.
 *
 * Two things are worth pinning here: that a cloud model can never be confused
 * with a local one (routing depends on it), and that both wire formats come back
 * as the same records — because the interface has exactly one streaming path, and
 * it only stays that way if this translation is right.
 */

test('a cloud model is named by its provider, and only a known provider matches', () => {
  assert.equal(cloudModelName('anthropic', 'claude-sonnet-4-5'), 'anthropic/claude-sonnet-4-5')
  const parsed = parseCloudModel('anthropic/claude-sonnet-4-5')
  assert.equal(parsed?.provider.id, 'anthropic')
  assert.equal(parsed?.model, 'claude-sonnet-4-5')

  // A local Ollama name is never a cloud model, slash or no slash.
  assert.equal(parseCloudModel('qwen2.5:3b'), null)
  assert.equal(parseCloudModel('hf.co/user/model'), null)
  assert.equal(parseCloudModel(''), null)
  assert.equal(parseCloudModel('anthropic/'), null)
  // And nothing can reach a provider this app does not know.
  assert.equal(parseCloudModel('evil/https://example.test'), null)
})

test('every provider has a real endpoint, and settings can point them elsewhere', () => {
  for (const provider of CLOUD_PROVIDERS) {
    if (provider.custom) {
      assert.equal(provider.baseUrl, '', 'the custom provider has no default on purpose')
      continue
    }
    assert.match(provider.baseUrl, /^https:\/\//, `${provider.id} has a real https endpoint`)
    assert.match(provider.keysUrl, /^https:\/\//, `${provider.id} says where a key comes from`)
  }
  const anthropic = providerById('anthropic')!
  assert.equal(baseUrlFor(anthropic), 'https://api.anthropic.com/v1')
  assert.equal(
    baseUrlFor(anthropic, { env: { AI_ASSISTANT_ANTHROPIC_BASE_URL: 'http://127.0.0.1:8080/v1/' } }),
    'http://127.0.0.1:8080/v1',
    'an override works and loses its trailing slash'
  )
  // The custom provider takes its address from Settings, and nowhere else.
  const custom = providerById('custom')!
  assert.equal(baseUrlFor(custom, { custom: { baseUrl: 'http://localhost:1234/v1' } }), 'http://localhost:1234/v1')
  assert.equal(baseUrlFor(custom, { env: { AI_ASSISTANT_CUSTOM_BASE_URL: 'http://nope' } }), '')
})

test('Anthropic gets a system field and its own headers; OpenAI gets a system message', () => {
  const messages = [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi' },
  ]
  const anthropic = buildChatRequest({
    provider: providerById('anthropic')!,
    model: 'claude-sonnet-4-5',
    apiKey: 'sk-ant-test',
    baseUrl: 'https://api.anthropic.com/v1',
    messages,
    maxTokens: 4096,
  })
  assert.equal(anthropic.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(anthropic.headers['x-api-key'], 'sk-ant-test')
  assert.equal(anthropic.headers['anthropic-version'], ANTHROPIC_VERSION)
  assert.equal(anthropic.headers.authorization, undefined)
  const anthropicBody = JSON.parse(anthropic.body || '{}')
  assert.equal(anthropicBody.system, 'Be brief.', 'the system prompt is a field, not a message')
  assert.deepEqual(anthropicBody.messages.map((m: { role: string }) => m.role), ['user', 'assistant'])
  assert.equal(anthropicBody.max_tokens, 4096)
  assert.equal(anthropicBody.stream, true)

  const openai = buildChatRequest({
    provider: providerById('openai')!,
    model: 'gpt-4o-mini',
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com/v1',
    messages,
    maxTokens: 4096,
  })
  assert.equal(openai.url, 'https://api.openai.com/v1/chat/completions')
  assert.equal(openai.headers.authorization, 'Bearer sk-test')
  assert.equal(openai.headers['x-api-key'], undefined)
  const openaiBody = JSON.parse(openai.body || '{}')
  assert.deepEqual(openaiBody.messages.map((m: { role: string }) => m.role), ['system', 'user', 'assistant'])
  assert.equal(openaiBody.stream, true)
})

test('the model list is read from what the provider sent, never from a catalogue', () => {
  const request = buildModelsRequest(providerById('groq')!, 'gsk-test', 'https://api.groq.com/openai/v1')
  assert.equal(request.method, 'GET')
  assert.equal(request.url, 'https://api.groq.com/openai/v1/models')
  assert.equal(request.headers.authorization, 'Bearer gsk-test')
  assert.deepEqual(readModelNames({ data: [{ id: 'llama-3.3-70b' }, { id: 'mixtral' }] }), [
    'llama-3.3-70b',
    'mixtral',
  ])
  assert.deepEqual(readModelNames({ models: [{ name: 'qwen2.5' }] }), ['qwen2.5'])
  assert.deepEqual(readModelNames({ nonsense: true }), [])
})

test('server-sent events survive being split anywhere, including mid-separator', () => {
  const parser = createSseParser()
  // One event, delivered one character at a time: the worst case a real socket
  // produces. Nothing may be lost or doubled.
  const text = 'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hel"}}\n\n' +
    'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"lo"}}\n\n'
  const events = []
  for (const character of text) events.push(...parser.push(character))
  assert.equal(events.length, 2)
  assert.equal(translateSseEvent('anthropic', events[0])?.content, 'Hel')
  assert.equal(translateSseEvent('anthropic', events[1])?.content, 'lo')

  // Carriage returns, and an event that carries no data line at all.
  const crlf = createSseParser()
  assert.deepEqual(crlf.push('event: ping\r\n\r\n'), [{ event: 'ping', data: '' }])
})

test('an Anthropic stream becomes the same records the interface already reads', () => {
  assert.deepEqual(
    translateSseEvent('anthropic', {
      event: 'content_block_delta',
      data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}',
    }),
    { content: 'Hi' }
  )
  assert.deepEqual(
    translateSseEvent('anthropic', {
      event: 'content_block_delta',
      data: '{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}',
    }),
    { thinking: 'hmm' }
  )
  assert.deepEqual(
    translateSseEvent('anthropic', { event: 'message_start', data: '{"message":{"usage":{"input_tokens":12}}}' }),
    { inputTokens: 12 }
  )
  assert.deepEqual(translateSseEvent('anthropic', { event: 'message_delta', data: '{"usage":{"output_tokens":7}}' }), {
    outputTokens: 7,
  })
  assert.deepEqual(translateSseEvent('anthropic', { event: 'message_stop', data: '{"type":"message_stop"}' }), {
    done: true,
  })
})

test('an OpenAI stream becomes the same records, and says why when it fails', () => {
  assert.deepEqual(
    translateSseEvent('openai', { event: '', data: '{"choices":[{"delta":{"content":"Hi"}}]}' }),
    { content: 'Hi' }
  )
  assert.deepEqual(translateSseEvent('openai', { event: '', data: '[DONE]' }), { done: true })
  assert.deepEqual(
    translateSseEvent('openai', { event: '', data: '{"choices":[{"finish_reason":"stop"}]}' }),
    { done: true }
  )
  assert.deepEqual(
    translateSseEvent('openai', {
      event: '',
      data: '{"choices":[{"delta":{}}],"usage":{"prompt_tokens":9,"completion_tokens":4}}',
    }),
    { inputTokens: 9, outputTokens: 4 }
  )
  assert.deepEqual(translateSseEvent('openai', { event: '', data: '{"error":{"message":"bad key"}}' }), {
    error: 'bad key',
  })
  // Anything unreadable is dropped rather than thrown: one odd frame must not
  // end an answer that is otherwise fine.
  assert.equal(translateSseEvent('openai', { event: '', data: 'not json' }), null)
  assert.equal(translateSseEvent('anthropic', { event: 'ping', data: '{}' }), null)
})
