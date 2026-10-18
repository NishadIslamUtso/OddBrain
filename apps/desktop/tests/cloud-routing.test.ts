import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startLocalApi, type LocalApi } from '../src/main/api/server'
import { createKeyStore } from '../src/main/cloud/keys'
import { createCloudClient } from '../src/main/cloud/client'

/**
 * One address for a reply, whoever answers it.
 *
 * The interface posts to `/api/ollama/chat` and nothing else, cloud or local.
 * What decides is the model name in the body: `provider/model` for a provider
 * whose key is saved, anything else to Ollama. These tests hold that line, and
 * they hold the two refusals that keep it honest — a model with no key, and a
 * name that only looks like a provider.
 */

const sse = (response: import('node:http').ServerResponse): void => {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
}

async function fakeProvider(): Promise<{ url: string; asked: string[]; close: () => Promise<void> }> {
  const asked: string[] = []
  const server: Server = createServer((request, response) => {
    asked.push(request.url || '')
    if ((request.url || '').endsWith('/models')) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"data":[{"id":"gpt-4o-mini"}]}')
      return
    }
    sse(response)
    response.write('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n')
    response.write('data: {"choices":[{"delta":{"content":"from the provider"}}]}\n\n')
    response.write('data: [DONE]\n\n')
    response.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { url: `http://127.0.0.1:${port}`, asked, close: () => new Promise<void>(done => server.close(() => done())) }
}

function keys(withKey: boolean): ReturnType<typeof createKeyStore> {
  const store = createKeyStore({ file: join(mkdtempSync(join(tmpdir(), 'keys-')), 'keys.json') })
  if (withKey) store.set('openai', 'sk-test')
  return store
}

async function start(providerUrl: string, withKey: boolean): Promise<LocalApi> {
  const cloud = createCloudClient({
    keys: keys(withKey),
    env: { AI_ASSISTANT_OPENAI_BASE_URL: providerUrl },
  })
  return startLocalApi({
    port: 0,
    // A dead Ollama: anything that reaches it answers 502, which is how a
    // misrouted request gives itself away.
    ollamaUrl: 'http://127.0.0.1:9',
    cloud,
  })
}

const chat = (api: LocalApi, model: string): Promise<Response> =>
  fetch(`${api.url}/api/ollama/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hello' }], stream: true }),
  })

test('a chat with a provider model streams the provider’s answer as NDJSON records', async () => {
  const provider = await fakeProvider()
  const api = await start(provider.url, true)
  try {
    const response = await chat(api, 'openai/gpt-4o-mini')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') || '', /ndjson/)
    const records = (await response.text())
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    assert.equal(records.map(record => record.message?.content || '').join(''), 'Hello from the provider')
    assert.deepEqual(records.at(-1), { done: true }, 'the stream ends the way Ollama’s does')
    assert.deepEqual(provider.asked, ['/chat/completions'], 'one request, to the provider, and nothing else')
  } finally {
    await api.close()
    await provider.close()
  }
})

test('a local model is still forwarded to Ollama, unchanged', async () => {
  const provider = await fakeProvider()
  const api = await start(provider.url, true)
  try {
    const response = await chat(api, 'qwen2.5:3b')
    assert.equal(response.status, 502)
    const body = (await response.json()) as { error: string }
    assert.match(body.error, /Ollama is not reachable on this machine/)
    assert.deepEqual(provider.asked, [], 'a local model never goes near a provider')
  } finally {
    await api.close()
    await provider.close()
  }
})

test('a model whose provider has no key is refused before anything is sent', async () => {
  const provider = await fakeProvider()
  const api = await start(provider.url, false)
  try {
    const response = await chat(api, 'openai/gpt-4o-mini')
    assert.equal(response.status, 502)
    const body = (await response.json()) as { error: string }
    assert.match(body.error, /No key is saved for GPT \(OpenAI\)/)
    assert.deepEqual(provider.asked, [], 'no key means no request')
  } finally {
    await api.close()
    await provider.close()
  }
})

test('a name that only looks like a provider is Ollama’s business, never a provider’s', async () => {
  const provider = await fakeProvider()
  const api = await start(provider.url, true)
  try {
    // 'somecompany' is not a provider this app knows, and 'anthropic-x' is not
    // 'anthropic': neither may be routed anywhere but Ollama.
    for (const model of ['somecompany/gpt', 'anthropic-x/claude', 'hf.co/user/model']) {
      const response = await chat(api, model)
      assert.equal(response.status, 502)
      assert.match(((await response.json()) as { error: string }).error, /Ollama is not reachable/)
    }
    assert.deepEqual(provider.asked, [])
  } finally {
    await api.close()
    await provider.close()
  }
})
