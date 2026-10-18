import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createVaultService } from '../src/main/vault/service'
import { createSourceMap, dhakaDay, hostOf } from '../src/main/vault/sources'
import { startLocalApi, type LocalApi } from '../src/main/api/server'

/**
 * The map of what was read and when.
 *
 * The subject is a vault that already holds things — which is what a real one
 * looks like after a week — so the tests write captures through the service and
 * then read the map, the way the app will. What matters here:
 *
 *   - it reads exactly what the vault says and invents nothing
 *   - a captured page is one entry, not two (its visit line points at its file)
 *   - a visit is not treated as reading, and the vault's own sentence about that
 *     is carried through rather than dropped
 *   - the summary always describes the entries beside it
 *   - a missing vault is reported, and an unreadable month file does not sink the map
 */

const CLOCK = (): Date => new Date('2026-10-10T19:00:00Z')

type Fixture = {
  root: string
  service: ReturnType<typeof createVaultService>
  map: (options?: { q?: string; kind?: string; days?: number }) => ReturnType<ReturnType<typeof createSourceMap>['read']>
}

function fixture(t: { after: (fn: () => unknown) => void }): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-map-'))
  mkdirSync(join(root, '00 System'), { recursive: true })
  writeFileSync(
    join(root, '00 System/Privacy & Access.md'),
    '# Privacy\n\n```yaml\nexcluded_patterns:\n  - bank.com/*\n```\n'
  )
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const service = createVaultService({ vaultPath: root, clock: CLOCK })
  return {
    root,
    service,
    map: options => createSourceMap(service.files()).read(options),
  }
}

const conversation = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'conversation',
  provider: 'claude',
  conversation_id: id,
  title: `Conversation ${id}`,
  url: 'https://claude.ai/chat/' + id,
  captured_at: '2026-10-10T18:00:00Z',
  messages: [{ role: 'user', text: 'hello there', timestamp: '2026-10-10T17:59:00Z' }],
  ...extra,
})

const page = (url: string, title: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'web_page',
  url,
  title,
  content: `The readable text of ${title}`,
  captured_at: '2026-10-10T18:30:00Z',
  ...extra,
})

const visit = (url: string, at: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'browser_visit',
  url,
  title: '',
  visited_at: at,
  captured_at: at,
  ...extra,
})

test('the map reads conversations, pages and visits, newest first', (t) => {
  const { service, map } = fixture(t)
  service.capture(conversation('a'))
  service.capture(page('https://example.com/one', 'One'))
  service.capture(visit('https://news.example/story', '2026-10-10T17:00:00Z'))

  const { entries, summary } = map()
  assert.deepEqual(summary.kinds, { conversation: 1, page: 1, visit: 1 })
  assert.equal(summary.total, 3)
  assert.equal(summary.capped, false)

  // Newest first: the page (18:30), the conversation (18:00), the visit (17:00).
  assert.deepEqual(
    entries.map(entry => entry.kind),
    ['page', 'conversation', 'visit']
  )
  const [first] = entries
  assert.equal(first.title, 'One')
  assert.equal(first.host, 'example.com')
  assert.equal(first.url, 'https://example.com/one')
  assert.match(first.path, /^02 Sources[\\/]Web Pages[\\/]2026[\\/]web-/, 'the vault-relative path, in either separator')
  assert.ok(first.bytes > 0, 'a page capture says how much was kept')
})

test('a captured page is one entry: its visit line points at the file, not at a second thing', (t) => {
  const { root, service, map } = fixture(t)
  service.capture(page('https://example.com/twice', 'Twice'))
  // The vault appends a visit line for the same page, carrying source_id.
  // The vault stamps activity with the Dhaka date; the fixture clock is 19:00Z on
  // the 10th, which is the 11th at 01:00 in Dhaka, so the month file is 10.
  const activity = join(root, '02 Sources/Browser Activity/2026/10.jsonl')
  const lines = writeFileSync // (keeps the import used; the file is read back below)
  void lines
  assert.equal(map().entries.filter(entry => entry.kind === 'page').length, 1)

  const { entries } = map()
  // Exactly one entry for that page, not a page plus a visit of the same URL.
  const same = entries.filter(entry => entry.url === 'https://example.com/twice')
  assert.equal(same.length, 1)
  assert.equal(same[0].kind, 'page')
  // And the activity file it was noted in did get written, with source_id.
  const raw = service.files().read('02 Sources/Browser Activity/2026/10.jsonl')
  assert.ok(raw.includes('"source_id"'), 'the vault records the file a visit belongs to')
  void activity
})

test('a visit says it is only a visit, in the vault’s own words', (t) => {
  const { service, map } = fixture(t)
  service.capture(visit('https://reading.example/article', '2026-10-10T17:00:00Z'))
  const [entry] = map().entries
  assert.equal(entry.kind, 'visit')
  assert.equal(entry.completeness, 'visit-only')
  // The vault writes that sentence beside the visit; the map repeats what the
  // capture says rather than upgrading it to "read".
  const raw = service.files().read(String(entry.path))
  assert.match(raw, /Visit metadata is not proof of reading or agreement\./)
})

test('hosts are grouped without www, and the busiest site comes first', (t) => {
  const { service, map } = fixture(t)
  service.capture(page('https://www.example.com/a', 'A'))
  service.capture(page('https://example.com/b', 'B'))
  service.capture(page('https://other.test/c', 'C'))
  const { summary } = map()
  assert.deepEqual(
    summary.hosts.map(host => [host.host, host.count]),
    [
      ['example.com', 2],
      ['other.test', 1],
    ]
  )
  assert.equal(summary.hosts[0].lastAt, '2026-10-10T18:30:00Z')
  assert.equal(hostOf('not a url'), '')
  assert.equal(hostOf(''), '')
})

test('days are Dhaka days, and the summary always describes the entries beside it', (t) => {
  const { service, map } = fixture(t)
  // 10:00 UTC is the afternoon of the 10th in Dhaka; 19:00 UTC is already the
  // 11th there, which is the whole point of a Dhaka calendar.
  service.capture(conversation('d1', { captured_at: '2026-10-10T10:00:00Z' }))
  service.capture(visit('https://late.example/x', '2026-10-10T19:00:00Z'))
  assert.equal(dhakaDay('2026-10-10T10:00:00Z'), '2026-10-10')
  assert.equal(dhakaDay('2026-10-10T19:00:00Z'), '2026-10-11')

  const all = map()
  assert.deepEqual(all.summary.days, [
    { date: '2026-10-11', count: 1 },
    { date: '2026-10-10', count: 1 },
  ])

  // Filtering: the summary counts only what is beside it, never the whole vault.
  const pages = map({ kind: 'page' })
  assert.deepEqual(pages.summary.kinds, { conversation: 0, page: 0, visit: 0 })
  assert.equal(pages.summary.total, 0)
  assert.deepEqual(pages.summary.hosts, [])

  const visits = map({ kind: 'visit' })
  assert.equal(visits.entries.length, 1)
  assert.equal(visits.summary.total, 1)
  assert.deepEqual(visits.summary.hosts, [{ host: 'late.example', count: 1, lastAt: '2026-10-10T19:00:00Z' }])
})

test('search looks at what a person would remember: title, site and provider', (t) => {
  const { service, map } = fixture(t)
  service.capture(page('https://docs.example/guide', 'The Guide'))
  service.capture(conversation('chat-42', { title: 'About rendering' }))

  assert.equal(map({ q: 'guide' }).entries.length, 1)
  assert.equal(map({ q: 'DOCS.example' }).entries.length, 1)
  assert.equal(map({ q: 'claude' }).entries.length, 1, 'the provider is searchable')
  assert.equal(map({ q: 'nothing here' }).entries.length, 0)
  assert.equal(map({ q: 'guide' }).summary.total, 1, 'the count follows the filter')
})

test('an empty vault is an empty map, not an invented one', (t) => {
  const { map } = fixture(t)
  const { entries, summary } = map()
  assert.deepEqual(entries, [])
  assert.deepEqual(summary.kinds, { conversation: 0, page: 0, visit: 0 })
  assert.equal(summary.total, 0)
  assert.deepEqual(summary.hosts, [])
  assert.deepEqual(summary.days, [])
})

test('a missing vault is reported, and nothing is created to satisfy the map', (t) => {
  const missing = join(tmpdir(), `ai-assistant-map-missing-${Date.now()}`)
  const service = createVaultService({ vaultPath: missing, clock: CLOCK })
  t.after(() => rmSync(missing, { recursive: true, force: true }))
  assert.throws(() => createSourceMap(service.files()).read(), /No vault at/)
})

test('a truncated line is not a visit: only complete records count', (t) => {
  const { root, service, map } = fixture(t)
  service.capture(visit('https://one.example/a', '2026-10-10T17:00:00Z'))
  // Append half a record, the way a crash mid-write would leave one.
  const month = join(root, '02 Sources/Browser Activity/2026/10.jsonl')
  const fs = require('node:fs') as typeof import('node:fs')
  fs.appendFileSync(month, '{"url":"https://half.example/x","visited_at":"2026-10-10T17:30:')
  const { entries, summary } = map()
  assert.equal(summary.total, 1, 'the half-written record is not counted')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].url, 'https://one.example/a')

  // And once it is completed, it is a visit like any other.
  fs.appendFileSync(month, '00Z","captured_at":"2026-10-10T17:30:00Z"}\n')
  assert.equal(map().summary.total, 2)
})

test('the map is served over the app’s API, and reports a missing vault as 503', async (t) => {
  const { root, service } = fixture(t)
  service.capture(page('https://served.example/x', 'Served'))
  const api: LocalApi = await startLocalApi({
    port: 0,
    ollamaUrl: 'http://127.0.0.1:9',
    vault: service,
  })
  t.after(() => api.close())

  const response = await fetch(`${api.url}/api/vault/sources`)
  assert.equal(response.status, 200)
  const body = (await response.json()) as { ok: boolean; entries: { host: string }[]; summary: { total: number } }
  assert.equal(body.ok, true)
  assert.equal(body.entries[0].host, 'served.example')
  assert.equal(body.summary.total, 1)

  // Filtering through the query string, the way the interface asks.
  const filtered = await fetch(`${api.url}/api/vault/sources?kind=conversation`)
  assert.equal(((await filtered.json()) as { summary: { total: number } }).summary.total, 0)

  const missingApi = await startLocalApi({
    port: 0,
    ollamaUrl: 'http://127.0.0.1:9',
    vault: createVaultService({ vaultPath: join(root, 'nope'), clock: CLOCK }),
  })
  t.after(() => missingApi.close())
  const missing = await fetch(`${missingApi.url}/api/vault/sources`)
  assert.equal(missing.status, 503)
  assert.equal(((await missing.json()) as { available: boolean }).available, false)
})
