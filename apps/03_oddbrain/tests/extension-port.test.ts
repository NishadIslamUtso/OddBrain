import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXTENSION_ROUTES,
  extensionOrigin,
  startExtensionApi,
  type ExtensionApi,
} from '../src/main/extension/server'
import { createVaultService } from '../src/main/vault/service'

/**
 * The port the browser extension posts to.
 *
 * This is the only socket in the app that anything outside it can reach, so the
 * tests are about the two questions that matter: who may talk to it, and what it
 * can be asked to do. The surface is deliberately tiny, and half of this file
 * exists to keep it that way — a route added to the vault must not become
 * reachable from a browser extension just because it exists.
 */

const CLOCK = (): Date => new Date('2026-10-10T19:00:00Z')
/** An extension origin. Only the scheme matters: an id exists once installed. */
const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
const PAGE = 'https://somewhere.example'

type Call = { status: number; body: any; headers: Headers }

async function withPort(t: { after: (fn: () => unknown) => void }): Promise<{
  api: ExtensionApi
  root: string
  call: (method: string, route: string, options?: { body?: unknown; origin?: string; contentType?: string }) => Promise<Call>
  filesIn: (relative: string) => string[]
}> {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-extension-'))
  mkdirSync(join(root, '00 System'), { recursive: true })
  writeFileSync(
    join(root, '00 System/Privacy & Access.md'),
    '# Privacy\n\n```yaml\nexcluded_patterns:\n  - bank.com/*\n```\n'
  )
  const service = createVaultService({ vaultPath: root, clock: CLOCK })
  // Port 0 in the tests so a run never fights the real app for 8765.
  const api = await startExtensionApi({ port: 0, vault: service })
  t.after(async () => {
    await api.close()
    rmSync(root, { recursive: true, force: true })
  })

  const call = async (
    method: string,
    route: string,
    options: { body?: unknown; origin?: string; contentType?: string; pair?: string | false } = {}
  ): Promise<Call> => {
    const headers: Record<string, string> = {}
    if (options.body !== undefined) headers['content-type'] = options.contentType || 'application/json'
    if (options.origin !== undefined) headers.origin = options.origin
    // The pairing token rides every call unless a test is deliberately
    // checking the refusal.
    if (options.pair !== false) headers['x-oddbrain-pair'] = options.pair || api.pairToken
    const response = await fetch(`${api.url}${route}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers }
  }

  return {
    api,
    root,
    call,
    filesIn: (relative: string) => {
      const full = join(root, relative)
      return existsSync(full) ? readdirSync(full) : []
    },
  }
}

const conversation = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'conversation',
  provider: 'claude',
  conversation_id: 'ext-chat-1',
  title: 'A chat in the browser',
  captured_at: '2026-10-10T19:00:00Z',
  messages: [
    { role: 'user', text: 'typed in the browser 4417-KEEP', timestamp: '2026-10-10T18:00:00Z' },
    { role: 'assistant', text: 'answered in the browser', timestamp: '2026-10-10T18:01:00Z', status: 'complete' },
  ],
  ...extra,
})

/* ------------------------------------------------------------- who may call */

test('the port answers a browser extension, and this machine, and nobody else', () => {
  assert.deepEqual(extensionOrigin(EXT, 8765), { allowed: true, allow: EXT, error: '' })
  // A local tool poking at the port during development, on this port only.
  assert.equal(extensionOrigin('http://127.0.0.1:8765', 8765).allowed, true)
  assert.equal(extensionOrigin('http://localhost:8765', 8765).allowed, true)
  // The same loopback origin pointing somewhere else is a different service.
  assert.equal(extensionOrigin('http://127.0.0.1:9999', 8765).allowed, false)

  // A web page can never pass: script cannot set its own Origin header, and if a
  // page somehow sent one it is refused rather than trusted.
  const page = extensionOrigin(PAGE, 8765)
  assert.equal(page.allowed, false)
  assert.match(page.error, /browser extension/)

  // No origin at all, and a nonsense one.
  assert.equal(extensionOrigin(undefined, 8765).allowed, false)
  assert.equal(extensionOrigin('not a url', 8765).allowed, false)
  // An https origin on a loopback hostname is still not this port's business.
  assert.equal(extensionOrigin('https://127.0.0.1:8765', 8765).allowed, false)
})

test('the extension can ask whether the app is there — and is told what answers', async t => {
  const { api, root, call } = await withPort(t)
  const health = await call('GET', '/health', { origin: EXT })
  assert.equal(health.status, 200)
  assert.equal(health.body.app, 'OddBrain')
  assert.equal(health.body.vault, root)
  assert.equal(health.body.available, true)
  assert.equal(health.body.timezone, 'Asia/Dhaka')
  // The reply has to be readable by the extension, so it is allowed, by name.
  assert.equal(health.headers.get('access-control-allow-origin'), EXT)
  assert.equal(health.headers.get('vary'), 'Origin')
  // And the same answer on '/', which is what someone typing the address gets.
  assert.equal((await call('GET', '/', { origin: EXT })).body.app, 'OddBrain')
  assert.ok(api.port > 0)
})

test('a web page gets nothing, and is not even told the port is there', async t => {
  const { call } = await withPort(t)
  const page = await call('GET', '/health', { origin: PAGE })
  assert.equal(page.status, 403)
  assert.match(page.body.error, /browser extension/)
  assert.equal(page.headers.get('access-control-allow-origin'), null, 'no CORS permission on a refusal')

  // No Origin header at all: refused too. A browser always sends one, so a
  // request without one is not a browser extension.
  const bare = await call('GET', '/health')
  const unpaired = await call('GET', '/health', { origin: EXT, pair: false })
  assert.equal(unpaired.status, 401, 'an unpaired extension is refused, politely and in full')
  assert.match(unpaired.body.error, /not paired with OddBrain yet/)
  const wrongToken = await call('GET', '/health', { origin: EXT, pair: 'not-the-token'.padEnd(48, 'x') })
  assert.equal(wrongToken.status, 401, 'a wrong token is the same refusal')
  assert.equal(bare.status, 403)
  assert.match(bare.body.error, /says where it is calling from/)
})

/* ------------------------------------------------------------ what it can do */

test('captures switched off in Agent access are refused, and nothing is written', async t => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-extension-off-'))
  const service = createVaultService({ vaultPath: root, clock: CLOCK })
  let allowed = true
  const api = await startExtensionApi({ port: 0, vault: service, mayCapture: () => allowed })
  t.after(async () => {
    await api.close()
    rmSync(root, { recursive: true, force: true })
  })
  const post = (route: string, body: unknown): Promise<Response> =>
    fetch(`${api.url}${route}`, {
      method: 'POST',
      headers: { origin: EXT, 'content-type': 'application/json', 'x-oddbrain-pair': api.pairToken },
      body: JSON.stringify(body),
    })

  // On: the capture is written.
  assert.equal((await post('/capture', conversation())).status, 200)
  assert.equal(existsSync(join(root, '02 Sources/Conversations/claude/2026')), true)

  // Off: refused, with the reason and the place to change it, and nothing new
  // lands on disk. The permission is read per request, so this is immediate.
  allowed = false
  const refused = await post('/capture', conversation({ conversation_id: 'ext-chat-off' }))
  assert.equal(refused.status, 403)
  const body = (await refused.json()) as { ok: boolean; skipped: boolean; reason: string; error: string }
  assert.equal(body.ok, false)
  assert.equal(body.skipped, true)
  assert.equal(body.reason, 'captures-off')
  assert.match(body.error, /switched off in Settings > Agent access/)
  assert.equal(existsSync(join(root, '02 Sources/Conversations/claude/2026/ext-chat-off')), false)

  // Reading is still allowed: the never-check list is what keeps a site private,
  // and the extension has to be able to show it while captures are off.
  assert.equal((await fetch(`${api.url}/blacklist`, { headers: { origin: EXT, 'x-oddbrain-pair': api.pairToken } })).status, 200)
  const health = await (await fetch(`${api.url}/health`, { headers: { origin: EXT, 'x-oddbrain-pair': api.pairToken } })).json()
  assert.equal((health as { captures: boolean }).captures, false, 'the extension can see why instead of retrying')

  // On again, without a restart.
  allowed = true
  assert.equal((await post('/capture', conversation({ conversation_id: 'ext-chat-back' }))).status, 200)
})

test('a capture from the extension lands in the vault as Markdown', async t => {
  const { call, root, filesIn } = await withPort(t)
  const captured = await call('POST', '/capture', { origin: EXT, body: conversation() })
  assert.equal(captured.status, 200)
  assert.equal(captured.body.ok, true)

  const written = filesIn('02 Sources/Conversations/claude/2026')
  assert.equal(written.length, 1, 'one file, named after the conversation')
  assert.match(written[0], /ext-chat-1/)
  const markdown = readFileSync(join(root, '02 Sources/Conversations/claude/2026', written[0]), 'utf8')
  assert.match(markdown, /typed in the browser 4417-KEEP/)
  assert.match(markdown, /answered in the browser/)
  // And the activity log knows about it, like any other capture.
  const activity = filesIn('09 Activity & Undo/2026')
  assert.equal(activity.length, 1)
})

test('the never-check list round-trips, and takes effect immediately', async t => {
  const { call } = await withPort(t)
  const before = await call('GET', '/blacklist', { origin: EXT })
  assert.deepEqual(before.body.excluded_patterns, ['bank.com/*'])

  const added = await call('POST', '/blacklist', {
    origin: EXT,
    body: { action: 'add', excluded_patterns: ['shopping.example/*'] },
  })
  assert.equal(added.status, 200)
  assert.deepEqual((await call('GET', '/blacklist', { origin: EXT })).body.excluded_patterns.sort(), [
    'bank.com/*',
    'shopping.example/*',
  ])

  // The rule the person set is already in force for the next capture.
  const skipped = await call('POST', '/capture', {
    origin: EXT,
    body: conversation({ conversation_id: 'ext-chat-2', url: 'https://shopping.example/cart' }),
  })
  assert.equal(skipped.body.skipped, true)
  assert.equal(skipped.body.reason, 'blacklist')

  // And the extension's own writer, exactly as it is written today: it adds a
  // pattern by posting a capture whose type is the update. That has to keep
  // working, because that is the code that will run in the browser.
  const viaWriter = await call('POST', '/capture', {
    origin: EXT,
    body: { type: 'blacklist_update', excluded_patterns: ['bank.com/*', 'shopping.example/*', 'news.example/*'] },
  })
  assert.equal(viaWriter.status, 200)
  assert.deepEqual((await call('GET', '/blacklist', { origin: EXT })).body.excluded_patterns.sort(), [
    'bank.com/*',
    'news.example/*',
    'shopping.example/*',
  ])
})

test('context and capsules are readable, so the extension can inject what it was told to', async t => {
  const { call } = await withPort(t)
  assert.deepEqual((await call('GET', '/context?q=nothing', { origin: EXT })).body.entities ?? [], [])
  assert.deepEqual((await call('GET', '/capsules', { origin: EXT })).body.capsules, [])
})

test('the port carries the capture side only: no chat, no export, no settings', async t => {
  const { call } = await withPort(t)
  // The routes the app itself answers, which an extension must never reach: a
  // chat would spend a saved key, and an export hands over the whole vault.
  const forbidden = [
    ['POST', '/chat'],
    ['POST', '/api/ollama/chat'],
    ['GET', '/api/ollama/tags'],
    ['POST', '/export-zip'],
    ['GET', '/settings'],
    ['POST', '/settings'],
    ['GET', '/today'],
    ['GET', '/../../etc/passwd'],
  ] as const
  for (const [method, route] of forbidden) {
    const response = await call(method, route, { origin: EXT, body: method === 'POST' ? {} : undefined })
    assert.equal(response.status, 404, `${method} ${route} must not exist on this port`)
    assert.match(response.body.error, /not one of the routes/)
  }
  // The table is the whole surface, and nothing else in this file may add to it
  // without saying so here. /onui (A.6) is a read-only door: the newest captured
  // page for the engine to ask about, served by the same vault route table.
  assert.deepEqual(
    [...EXTENSION_ROUTES.keys()].sort(),
    ['/', '/appearance', '/blacklist', '/capsules', '/capture', '/context', '/conversation-sync', '/grep', '/health', '/links', '/onui', '/status']
  )
})

test('every route in the table actually answers, with its own method', async t => {
  const { call } = await withPort(t)
  for (const [route, methods] of EXTENSION_ROUTES) {
    for (const method of methods) {
      const response = await call(method, route, {
        origin: EXT,
        body: method === 'POST' ? (route === '/capture' ? conversation() : { action: 'set', patterns: [] }) : undefined,
      })
      assert.ok(response.status < 500, `${method} ${route} answered ${response.status}`)
    }
  }
})

test('a method the route does not answer is refused with the list of what it does', async t => {
  const { call } = await withPort(t)
  const response = await call('DELETE', '/capture', { origin: EXT })
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'POST')
  assert.match(response.body.error, /answers POST/)
})

test('a write has to be JSON: a browser form is refused even when it parses', async t => {
  const { call } = await withPort(t)
  const form = await call('POST', '/capture', {
    origin: EXT,
    body: JSON.stringify(conversation()),
    contentType: 'application/x-www-form-urlencoded',
  })
  assert.equal(form.status, 415)
  const broken = await call('POST', '/capture', { origin: EXT, body: '{ not json' })
  assert.equal(broken.status, 400)
})

test('an oversized capture is refused instead of buffered', async t => {
  const { call } = await withPort(t)
  const huge = await call('POST', '/capture', {
    origin: EXT,
    body: JSON.stringify({ ...conversation(), content: 'x'.repeat(21 * 1024 * 1024) }),
  })
  assert.equal(huge.status, 413)
  assert.match(huge.body.error, /larger than the vault accepts/)
})

test('preflight is answered for the extension, refused for a page', async t => {
  const { call } = await withPort(t)
  const allowed = await call('OPTIONS', '/capture', { origin: EXT })
  assert.equal(allowed.status, 204)
  assert.equal(allowed.headers.get('access-control-allow-origin'), EXT)
  assert.match(String(allowed.headers.get('access-control-allow-headers')), /content-type/)

  const refused = await call('OPTIONS', '/capture', { origin: PAGE })
  assert.equal(refused.status, 403)
})

test('a vault that is not there is reported, not created — and the port says so', async t => {
  const missing = join(tmpdir(), `ai-assistant-extension-missing-${Date.now()}`)
  const service = createVaultService({ vaultPath: missing, clock: CLOCK })
  const api = await startExtensionApi({ port: 0, vault: service })
  t.after(() => api.close())
  const pair = { origin: EXT, 'x-oddbrain-pair': api.pairToken }
  const response = await fetch(`${api.url}/health`, { headers: pair })
  const health = await response.json()
  assert.equal(health.available, false)
  const capture = await fetch(`${api.url}/capture`, {
    method: 'POST',
    headers: { ...pair, 'content-type': 'application/json' },
    body: JSON.stringify(conversation()),
  })
  assert.equal(capture.status, 503)
  assert.equal(existsSync(missing), false, 'no empty vault may be manufactured to satisfy a request')
})

test('a damaged capture identity is reported, not thrown — and replay is refused with the reason', async t => {
  const { call, root } = await withPort(t)
  mkdirSync(join(root, '.oddbrain'), { recursive: true })
  writeFileSync(join(root, '.oddbrain/capture-destination'), 'truncated')
  const health = await call('GET', '/health', { origin: EXT })
  assert.equal(health.status, 200, 'a damaged identity must not take the whole port down')
  assert.equal(health.body.capture_target, null)
  assert.match(String(health.body.capture_problem), /damaged/)
  assert.match(String(health.body.capture_problem), /capture-destination/)
  // Read-only features keep working, which is the point of not throwing here.
  assert.equal((await call('GET', '/appearance', { origin: EXT })).status, 200)
  const replay = await call('POST', '/conversation-sync', {
    origin: EXT,
    body: { ...conversation(), op: 'messages', messages: [], order: [], capture_target: 'a'.repeat(64) },
  })
  assert.equal(replay.status, 503)
  assert.equal(replay.body.code, 'capture-unavailable')
  assert.match(String(replay.body.error), /damaged/)
})

test('an unwritable vault folder is reported, not thrown', async t => {
  const denied = Object.assign(new Error('denied'), { code: 'EACCES' })
  const service = {
    root: '/unwritable-vault',
    available: () => true,
    files: () => ({
      writeOnce: () => { throw denied },
      readHead: () => '',
    }),
  }
  const api = await startExtensionApi({ port: 0, vault: service as never })
  t.after(() => api.close())
  const health = await (
    await fetch(`${api.url}/health`, { headers: { origin: EXT, 'x-oddbrain-pair': api.pairToken } })
  ).json()
  assert.equal(health.capture_target, null)
  assert.match(String(health.capture_problem), /EACCES/)
})

test('the capture identity belongs to the vault, not the pairing token', async t => {
  const { api, call } = await withPort(t)
  const before = (await call('GET', '/health', { origin: EXT })).body.capture_target
  assert.match(String(before), /^[a-f0-9]{64}$/)
  api.setPairToken('n'.repeat(48))
  const after = (await call('GET', '/health', { origin: EXT })).body.capture_target
  assert.equal(after, before, 'rotating the token must not orphan bytes already in a browser')
  const replay = await call('POST', '/conversation-sync', {
    origin: EXT,
    body: { ...conversation(), op: 'messages', messages: [], order: [], capture_target: before },
  })
  assert.notEqual(replay.status, 409, 'the same vault accepted the same target after rotation')
})

test('a busy port is reported, never fatal', async t => {
  const first = await withPort(t)
  const second = await startExtensionApi({ port: first.api.port, vault: createVaultService({ vaultPath: first.root }) })
  assert.equal(second.listening, false)
  assert.equal(second.port, first.api.port)
  assert.match(second.error, /already in use/)
  await second.close()
})
