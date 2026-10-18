import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKeyStore, type KeyStore } from '../src/main/cloud/keys'
import { createCloudClient } from '../src/main/cloud/client'

/**
 * The cloud side, tested against a real socket.
 *
 * The fake provider is a local server that streams server-sent events exactly the
 * way a real one does — in pieces, with delays in the middle of an event — because
 * that is the part that breaks silently if the parsing is wrong. Nothing here talks
 * to the internet, and no test sends a request without a key.
 */

type Recorded = { method: string; url: string; headers: IncomingMessage['headers']; body: string }

async function readBody(request: IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of request) body += chunk
  return body
}

/** A provider stand-in: scripted per path, and it remembers everything it was sent. */
async function fakeProvider(
  handler: (request: IncomingMessage, response: ServerResponse, body: string) => void
): Promise<{ url: string; seen: Recorded[]; close: () => Promise<void> }> {
  const seen: Recorded[] = []
  const server: Server = createServer((request, response) => {
    void readBody(request).then(body => {
      seen.push({ method: request.method || '', url: request.url || '', headers: request.headers, body })
      handler(request, response, body)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

const sse = (response: ServerResponse): void => {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
}
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

function store(options: { encrypt?: (value: string) => string; decrypt?: (value: string) => string } = {}): {
  keys: KeyStore
  file: string
} {
  const file = join(mkdtempSync(join(tmpdir(), 'keys-')), 'keys.json')
  return { keys: createKeyStore({ file, ...options }), file }
}

/** A stand-in for safeStorage, reversible so a reload can be checked. */
const seal = (value: string): string => `sealed:${Buffer.from(value, 'utf8').toString('base64')}`
const unseal = (value: string): string => {
  if (!value.startsWith('sealed:')) throw new Error('not ours')
  return Buffer.from(value.slice(7), 'base64').toString('utf8')
}

test('with no encryptor, a key lives for this run only — and says so', () => {
  const { keys, file } = store()
  assert.equal(keys.encryption, 'none')
  keys.set('openai', 'sk-secret')
  assert.equal(keys.get('openai'), 'sk-secret')
  assert.equal(keys.has('openai'), true)
  assert.equal(keys.persisted('openai'), false, 'nothing plaintext is ever written to disk')
  // No file was created at all.
  assert.throws(() => statSync(file), 'the file must not exist')
  keys.clear('openai')
  assert.equal(keys.has('openai'), false)
})

test('with an encryptor, the key survives a restart — and never touches disk readable', () => {
  const { keys, file } = store({ encrypt: seal, decrypt: unseal })
  assert.equal(keys.encryption, 'os')
  keys.set('anthropic', 'sk-ant-secret')
  assert.equal(keys.persisted('anthropic'), true)

  const onDisk = readFileSync(file, 'utf8')
  assert.equal(onDisk.includes('sk-ant-secret'), false, 'the raw key is not in the file')
  assert.equal(JSON.parse(onDisk).anthropic, seal('sk-ant-secret'))
  if (process.platform !== 'win32') {
    // Windows reports fabricated mode bits; the key's seal there is DPAPI
    // (safeStorage), asserted by the encrypted-at-rest case above.
    assert.equal(statSync(file).mode & 0o777, 0o600, 'readable by this user only')
  }

  const reopened = createKeyStore({ file, encrypt: seal, decrypt: unseal })
  assert.equal(reopened.get('anthropic'), 'sk-ant-secret')
  reopened.clear('anthropic')
  assert.equal(createKeyStore({ file, encrypt: seal, decrypt: unseal }).has('anthropic'), false)
})

test('a key this machine cannot unseal is dropped, and a damaged file is not a crash', () => {
  const { file } = store({ encrypt: seal, decrypt: unseal })
  writeFileSync(file, JSON.stringify({ openai: 'sealed-from-someone-elses-machine' }))
  const elsewhere = createKeyStore({
    file,
    encrypt: seal,
    decrypt: () => {
      throw new Error('cannot decrypt on this machine')
    },
  })
  assert.equal(elsewhere.has('openai'), false)

  writeFileSync(file, '{ this is not json')
  const damaged = createKeyStore({ file, encrypt: seal, decrypt: unseal })
  assert.deepEqual(damaged.ids(), [], 'a damaged file means no keys, not a failed launch')
  damaged.set('openai', 'sk-new')
  assert.equal(createKeyStore({ file, encrypt: seal, decrypt: unseal }).get('openai'), 'sk-new')
})

test('nothing reaches a provider when no key is saved', async () => {
  const provider = await fakeProvider((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{"data":[]}')
  })
  let requests = 0
  const client = createCloudClient({
    keys: store().keys,
    env: { AI_ASSISTANT_OPENAI_BASE_URL: provider.url },
    fetchImpl: (...args: Parameters<typeof fetch>) => {
      requests += 1
      return fetch(...args)
    },
  })
  try {
    const { models, problems } = await client.models()
    assert.deepEqual(models, [], 'a provider with no key offers no models')
    assert.deepEqual(problems, [])
    await assert.rejects(
      async () => {
        for await (const _record of client.stream({ model: 'openai/gpt-4o-mini', messages: [], maxTokens: 4096 })) {
          // unreachable
        }
      },
      /No key is saved for GPT \(OpenAI\)\./,
      'a message sent to an unkeyed model is refused before any request'
    )
    assert.equal(requests, 0, 'zero requests went out')
    assert.equal(provider.seen.length, 0)
  } finally {
    await provider.close()
  }
})

test('keys and prompts never go to insecure or ambiguous remote base URLs', async () => {
  const keys = store().keys
  keys.set('openai', 'sk-do-not-send')
  let requests = 0
  const make = (baseUrl: string) => createCloudClient({
    keys,
    env: { AI_ASSISTANT_OPENAI_BASE_URL: baseUrl },
    fetchImpl: async () => {
      requests += 1
      return new Response('{"data":[]}', { status: 200 })
    },
  })
  for (const baseUrl of ['http://198.51.100.20/v1', 'https://user:password@example.com/v1', 'https://example.com/v1?tenant=x']) {
    const client = make(baseUrl)
    await assert.rejects(() => client.listModels('openai'), /needs HTTPS, or HTTP on loopback/)
    await assert.rejects(async () => {
      for await (const _record of client.stream({ model: 'openai/private-model', messages: [{ role: 'user', content: 'private prompt' }], maxTokens: 10 })) {
        // unreachable
      }
    }, /needs HTTPS, or HTTP on loopback/)
  }
  assert.equal(requests, 0, 'validation happens before a key or prompt can leave')
})

test('oversized model-list responses are cancelled and refused', async () => {
  const keys = store().keys
  keys.set('openai', 'sk-live')
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(2_000_001))
    },
    cancel() { cancelled = true },
  })
  const client = createCloudClient({
    keys,
    env: { AI_ASSISTANT_OPENAI_BASE_URL: 'https://provider.example/v1' },
    fetchImpl: async () => new Response(body, { status: 200 }),
  })
  await assert.rejects(() => client.listModels('openai'), /2,000,000-byte limit/)
  assert.equal(cancelled, true)
})

test('a saved key is what makes a model appear, and Test reports a refused key plainly', async () => {
  const provider = await fakeProvider((request, response) => {
    if (request.url === '/models') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"data":[{"id":"gpt-4o-mini"},{"id":"o4-mini"}]}')
      return
    }
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end('{"error":{"message":"Incorrect API key provided"}}')
  })
  try {
    const withKey = createKeyStore({ file: join(mkdtempSync(join(tmpdir(), 'keys-')), 'keys.json') })
    withKey.set('openai', 'sk-live')
    const client = createCloudClient({
      keys: withKey,
      env: { AI_ASSISTANT_OPENAI_BASE_URL: provider.url },
    })
    const { models, problems } = await client.models()
    assert.deepEqual(problems, [])
    assert.deepEqual(models.map(model => model.name), ['openai/gpt-4o-mini', 'openai/o4-mini'])
    assert.equal(provider.seen[0].headers.authorization, 'Bearer sk-live')

    // A key the provider will not take is answered with the reason, not a stack.
    const rejecting = await fakeProvider((_request, response) => {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end('{"error":{"message":"Incorrect API key provided"}}')
    })
    try {
      const strict = createCloudClient({
        keys: withKey,
        env: { AI_ASSISTANT_OPENAI_BASE_URL: rejecting.url },
      })
      await assert.rejects(() => strict.listModels('openai'), /That key was refused by GPT \(OpenAI\)\./)
      await assert.rejects(() => strict.listModels('nope'), /There is no provider called nope\./)
    } finally {
      await rejecting.close()
    }
  } finally {
    await provider.close()
  }
})

test('an Anthropic stream, split mid-event over a real socket, reads as ordinary records', async () => {
  const provider = await fakeProvider(async (_request, response) => {
    sse(response)
    response.write('event: message_start\ndata: {"message":{"usage":{"input_tokens":12}}}\n\nevent: content_blo')
    await wait(15)
    response.write('ck_delta\ndata: {"delta":{"type":"text_delta","text":"Hello"}}\n\n')
    await wait(15)
    response.write('event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":" world"}}\n\n')
    await wait(15)
    response.write('event: message_delta\ndata: {"usage":{"output_tokens":3}}\n\n')
    await wait(15)
    response.write('event: message_stop\ndata: {"type":"message_stop"}\n\n')
    response.end()
  })
  try {
    const keys = createKeyStore({ file: join(mkdtempSync(join(tmpdir(), 'keys-')), 'keys.json') })
    keys.set('anthropic', 'sk-ant-live')
    const client = createCloudClient({
      keys,
      env: { AI_ASSISTANT_ANTHROPIC_BASE_URL: provider.url },
    })
    const records = []
    for await (const record of client.stream({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Say hello' },
      ],
      maxTokens: 4096,
    })) {
      records.push(record)
    }
    assert.equal(records.map(record => record.message?.content || '').join(''), 'Hello world')
    assert.deepEqual(records.at(-1), { done: true })
    assert.equal(records.some(record => record.usage?.input_tokens === 12), true)
    assert.equal(records.some(record => record.usage?.output_tokens === 3), true)

    // The request carried the key in the header Anthropic expects, and the system
    // prompt as a field — not as a message.
    const sent = provider.seen[0]
    assert.equal(sent.url, '/messages')
    assert.equal(sent.headers['x-api-key'], 'sk-ant-live')
    assert.equal(sent.headers['anthropic-version'], '2023-06-01')
    const body = JSON.parse(sent.body)
    assert.equal(body.system, 'Be brief.')
    assert.deepEqual(body.messages.map((message: { role: string }) => message.role), ['user'])
    assert.equal(body.stream, true)
  } finally {
    await provider.close()
  }
})

test('an OpenAI-style stream reads the same, and a stream that just stops is still finished', async () => {
  const provider = await fakeProvider(async (_request, response) => {
    sse(response)
    response.write('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n')
    await wait(10)
    response.write('data: {"choices":[{"delta":{"content":" there"}}]}\n\n')
    await wait(10)
    response.end() // no [DONE]: a provider that simply stops
  })
  try {
    const keys = createKeyStore({ file: join(mkdtempSync(join(tmpdir(), 'keys-')), 'keys.json') })
    keys.set('groq', 'gsk-live')
    const client = createCloudClient({
      keys,
      env: { AI_ASSISTANT_GROQ_BASE_URL: provider.url },
    })
    const records = []
    for await (const record of client.stream({
      model: 'groq/llama-3.3-70b',
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 4096,
    })) {
      records.push(record)
    }
    assert.equal(records.map(record => record.message?.content || '').join(''), 'Hi there')
    assert.deepEqual(records.at(-1), { done: true }, 'a good reply is never reported as a dropped connection')
    assert.equal(provider.seen[0].headers.authorization, 'Bearer gsk-live')
    assert.equal(provider.seen[0].url, '/chat/completions')
  } finally {
    await provider.close()
  }
})

test('a provider switched off in Agent access is never asked, and its key stays', async () => {
  const provider = await fakeProvider((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{"data":[{"id":"gpt-4o-mini"}]}')
  })
  try {
    const keys = createKeyStore({ file: join(mkdtempSync(join(tmpdir(), 'keys-')), 'keys.json') })
    keys.set('openai', 'sk-live')
    const permissions = () => ({ local: true, browserCapture: true, keepConversations: true, cloud: { openai: false } })
    const client = createCloudClient({
      keys,
      permissions,
      env: { AI_ASSISTANT_OPENAI_BASE_URL: provider.url },
    })

    // The provider is still listed — with the key it has — so the switch that
    // turned it off can be found again, but it is not reachable.
    const view = client.providers().find(entry => entry.id === 'openai')
    assert.equal(view?.hasKey, true)
    assert.equal(view?.enabled, false)

    // No model list, no test request, and no reply: three refusals, before any
    // request leaves this machine.
    assert.deepEqual(await client.models(), { models: [], problems: [] })
    await assert.rejects(() => client.listModels('openai'), /switched off in Settings > Agent access/)
    await assert.rejects(async () => {
      for await (const _record of client.stream({ model: 'openai/gpt-4o-mini', messages: [], maxTokens: 4096 })) {
        // unreachable
      }
    }, /switched off in Settings > Agent access/)
    assert.equal(provider.seen.length, 0, 'a switched-off provider is never contacted')
    assert.equal(keys.get('openai'), 'sk-live', 'the key is kept: switching off is not deleting')

    // Switched back on, the same client works without recreating anything: the
    // permission is read fresh on every call.
    const on = createCloudClient({
      keys,
      permissions: () => ({ local: true, browserCapture: true, keepConversations: true, cloud: { openai: true } }),
      env: { AI_ASSISTANT_OPENAI_BASE_URL: provider.url },
    })
    assert.equal((await on.models()).models.length, 1)
    assert.equal(provider.seen.length, 1)
  } finally {
    await provider.close()
  }
})
