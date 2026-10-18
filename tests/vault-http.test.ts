import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { startLocalApi, type LocalApi } from '../src/main/api/server'
import { createVaultService } from '../src/main/vault/service'

/**
 * The vault over real HTTP, through the real boundary.
 *
 * The service is tested on its own next door; this file is about the two layers
 * around it, which is where a local API goes wrong in practice:
 *
 *   - the boundary in api/guard.ts, which decides who may call at all
 *   - the reply shape, which the interface reads to find out whether something
 *     was saved or refused
 *
 * Requests are made the way the interface makes them: same origin, JSON for
 * writes, nothing else. A refusal is asserted as loudly as a success, because a
 * vault that answers 200 to a request it did not honour is worse than one that
 * refuses.
 */

const CLOCK = (): Date => new Date('2026-10-10T19:00:00Z')

async function withApi(t: { after: (fn: () => unknown) => void }): Promise<{
  api: LocalApi
  root: string
  post: (route: string, body: unknown, origin?: string) => Promise<{ status: number; body: any }>
  get: (route: string, origin?: string) => Promise<{ status: number; body: any }>
}> {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-vault-http-'))
  const service = createVaultService({ vaultPath: root, clock: CLOCK })
  const api = await startLocalApi({ port: 0, ollamaUrl: 'http://127.0.0.1:9', vault: service })
  t.after(async () => {
    await api.close()
    rmSync(root, { recursive: true, force: true })
  })

  async function call(method: string, route: string, body?: unknown, origin?: string) {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    // Undefined means "no Origin header at all", which is how a request from the
    // app's own renderer arrives for a same-origin fetch.
    if (origin !== undefined) headers.origin = origin
    const response = await fetch(`${api.url}/api/vault${route}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }

  return {
    api,
    root,
    post: (route, body, origin = api.url) => call('POST', route, body, origin),
    get: (route, origin = api.url) => call('GET', route, undefined, origin),
  }
}

const conversation = (): Record<string, unknown> => ({
  type: 'conversation',
  provider: 'OddBrain',
  conversation_id: 'chat-1',
  title: 'A kept conversation',
  captured_at: '2026-10-10T19:00:00Z',
  messages: [
    { role: 'user', text: 'keep this', timestamp: '2026-10-10T18:00:00Z' },
    { role: 'assistant', text: 'kept', timestamp: '2026-10-10T18:01:00Z', status: 'complete' },
  ],
})

test('a conversation sent from the interface lands in the vault', async t => {
  const { root, post, get } = await withApi(t)
  const captured = await post('/capture', conversation())
  assert.equal(captured.status, 200)
  assert.equal(captured.body.ok, true)
  assert.equal(captured.body.duplicate, false)

  const file = join(root, captured.body.source)
  assert.equal(existsSync(file), true)
  const text = readFileSync(file, 'utf8')
  assert.match(text, /keep this/)
  assert.match(text, /A kept conversation/)

  // The same conversation again is a duplicate, not a second file.
  const again = await post('/capture', conversation())
  assert.equal(again.body.duplicate, true)

  // And the interface can read the vault back.
  const status = await get('/status')
  assert.equal(status.body.ok, true)
  assert.equal(status.body.available, true)
  assert.ok(status.body.counts.files >= 1)
})

test('a refused capture is refused on the wire too, with the reason', async t => {
  const { post } = await withApi(t)
  const cross = await post('/capture', conversation(), 'http://127.0.0.1:1')
  assert.equal(cross.status, 403, 'another origin does not get to write to the vault')
  const traversal = await post('/capture', { ...conversation(), provider: '../../outside' })
  assert.equal(traversal.status, 400)
  assert.match(traversal.body.error, /Invalid provider/)
})

test('the boundary decides the method before the vault ever sees it', async t => {
  const { api, get } = await withApi(t)
  // /capture is a POST route; a GET is refused by the route table in guard.ts.
  const wrong = await get('/capture')
  assert.equal(wrong.status, 403)
  // A path that is not on the list is refused rather than answered.
  const unknown = await get('/arbitrary-path')
  assert.equal(unknown.status, 403)
  // A write has to be JSON, so a web page cannot post a form at the vault.
  const form = await fetch(`${api.url}/api/vault/capture`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'type=conversation',
  })
  assert.equal(form.status, 415)
})

test('a body that is not JSON is answered as a bad request, not a crash', async t => {
  const { api } = await withApi(t)
  const response = await fetch(`${api.url}/api/vault/capture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: api.url },
    body: '{not json',
  })
  assert.equal(response.status, 400)
  assert.match(((await response.json()) as { error: string }).error, /not valid JSON/)
})

test('a body larger than the vault accepts is refused instead of buffered', async t => {
  const { api } = await withApi(t)
  const huge = JSON.stringify({ type: 'web_page', url: 'https://example.org/big', content: 'x'.repeat(21 * 1024 * 1024) })
  const response = await fetch(`${api.url}/api/vault/capture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: huge,
  }).catch(() => null)
  // Either the refusal arrives, or the connection is closed — never a 200, and
  // never a silent truncation of the capture.
  if (response) {
    assert.equal(response.status, 413)
    assert.match(((await response.json()) as { error: string }).error, /larger than the vault accepts/)
  }
  // The server is still healthy afterwards, which is the part that matters.
  const after = await fetch(`${api.url}/api/vault/status`)
  assert.equal(after.status, 200)
})

test('the blacklist is editable over HTTP and takes effect immediately', async t => {
  const { root, get, post } = await withApi(t)
  const added = await post('/blacklist', { action: 'add', excluded_patterns: ['private.example/*'] })
  assert.equal(added.status, 200)
  assert.deepEqual(added.body.excluded_patterns, ['private.example/*'])

  const kept = await get('/blacklist')
  assert.deepEqual(kept.body.excluded_patterns, ['private.example/*'])
  assert.match(readFileSync(join(root, '00 System/Privacy & Access.md'), 'utf8'), /private\.example/)

  const denied = await post('/capture', { type: 'web_page', url: 'https://private.example/secret', content: 'MUST NOT SAVE' })
  assert.equal(denied.body.skipped, true)
  assert.equal(existsSync(join(root, '02 Sources/Web Pages')), false)
})

test('a deployable export comes back as a real archive', async t => {
  const { post } = await withApi(t)
  const result = await post('/export-zip', {
    files: [
      { name: 'index.html', content: '<!doctype html><title>artifact</title>' },
      { name: 'README.md', content: '# Artifact' },
    ],
  })
  assert.equal(result.status, 200)
  assert.match(result.body.filename, /^oddbrain-artifact-\d{4}-\d{2}-\d{2}\.zip$/)
  const bytes = Buffer.from(result.body.zip, 'base64')
  assert.equal(bytes.length, result.body.bytes)
  assert.equal(bytes.readUInt32LE(0), 0x04034b50, 'a local file header: the archive is readable')

  // A name that tries to escape the archive is the caller's mistake.
  const escaping = await post('/export-zip', { files: [{ name: '../escape.txt', content: 'x' }] })
  assert.equal(escaping.status, 400)
})

test('an unwritable vault is reported, and the interface is told which vault', async t => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-vault-gone-'))
  const service = createVaultService({ vaultPath: root, clock: CLOCK })
  const api = await startLocalApi({ port: 0, ollamaUrl: 'http://127.0.0.1:9', vault: service })
  t.after(async () => {
    await api.close()
    rmSync(root, { recursive: true, force: true })
  })
  // The vault disappears underneath a running app — a folder on a stick, an
  // unmounted drive, a folder the user moved. The app must not invent one.
  rmSync(root, { recursive: true, force: true })
  const status = await fetch(`${api.url}/api/vault/status`)
  const body = (await status.json()) as { available: boolean; error: string; vault: string }
  assert.equal(status.status, 200)
  assert.equal(body.available, false)
  assert.equal(body.vault, root)
  assert.match(body.error, /No vault at/)

  const write = await fetch(`${api.url}/api/vault/capture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(conversation()),
  })
  assert.equal(write.status, 503)
  assert.match(((await write.json()) as { error: string }).error, /never created/)
  assert.equal(existsSync(root), false)
})

test('with no vault service at all, the vault routes say so instead of hanging', async t => {
  const api = await startLocalApi({ port: 0, ollamaUrl: 'http://127.0.0.1:9' })
  t.after(() => api.close())
  const response = await fetch(`${api.url}/api/vault/status`)
  assert.equal(response.status, 503)
  assert.match(((await response.json()) as { error: string }).error, /not running in this process/)
})

test('the interface can be told where a file went, but not made to leak one', async t => {
  const { api } = await withApi(t)
  // A GET on a query route with a query string: the only thing the vault takes
  // from a URL is a search term.
  const response = await fetch(`${api.url}/api/vault/context?q=${encodeURIComponent('../../etc/passwd')}`)
  assert.equal(response.status, 200)
  const body = (await response.json()) as { entities: unknown[]; capsules: unknown[] }
  assert.deepEqual(body.entities, [])
  assert.deepEqual(body.capsules, [])
})

// A quiet console is part of the deal for anything the interface triggers, so
// the writer that reports failures is the only thing that may log. This asserts
// the shape the renderer depends on: a JSON body with ok/error, always.
test('every vault reply is JSON the interface can read', async t => {
  const { api, get } = await withApi(t)
  const routes = ['/status', '/today', '/blacklist', '/capsules', '/context', '/health']
  for (const route of routes) {
    const response = await fetch(`${api.url}/api/vault${route}`)
    assert.match(response.headers.get('content-type') || '', /application\/json/, route)
    const body = (await response.json()) as Record<string, unknown>
    assert.equal(typeof body, 'object', route)
  }
  const failure = await get('/today', 'http://127.0.0.1:1')
  assert.equal(failure.status, 403)
  assert.equal(typeof failure.body.error, 'string')
})
