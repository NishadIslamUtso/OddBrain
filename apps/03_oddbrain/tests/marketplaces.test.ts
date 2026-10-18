import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createMarketplaceStore,
  marketplaceCommands,
  parseMarketplaceIndex,
  parseRepo,
  MARKETPLACE_FETCH_BYTES,
} from '../src/main/store/marketplaces'

/**
 * Store phase 2: sources are added by explicit press, read with a cap,
 * labelled with their provenance, and installed ONLY through the engine's
 * own exact CLI line built in main — no renderer text ever becomes a
 * command, and list() never touches the network.
 */

const INDEX = JSON.stringify({
  name: 'owner-tools',
  owner: { name: 'The Owner' },
  plugins: [
    { name: 'ship-helper', description: 'Ships things.', author: 'ada', source: './plugins/ship-helper' },
    { name: 'reviewer', description: 'Reviews diffs.' },
    { name: '' },
    'not-an-object',
  ],
})

function harness(options: { indexBody?: string; indexStatus?: number; throwFetch?: boolean } = {}) {
  const calls: string[] = []
  const spawns: Array<{ command: string; args: string[] }> = []
  let pluginHelp = false
  const store = createMarketplaceStore({
    root: join(tmpdir(), `mb-${Math.random().toString(36).slice(2)}`),
    fetchImpl: async (url) => {
      calls.push(url)
      if (options.throwFetch) throw new Error('ECONNRESET')
      return {
        ok: (options.indexStatus ?? 200) < 400,
        status: options.indexStatus ?? 200,
        body: options.indexBody ?? INDEX,
      }
    },
    spawnImpl: (command, args) => {
      spawns.push({ command, args })
      const child = {
        stdout: { on: (_e: string, l: (c: string) => void) => { setImmediate(() => l(pluginHelp ? 'Available commands:\n  extension manage a catalog\n' : 'Usage: agy [options]\n')); return child } },
        stderr: { on: () => child },
        on: (event: string, l: (...a: never[]) => void) => {
          if (event === 'close') setImmediate(() => (l as (code: number | null) => void)(0))
          return child
        },
      }
      return child as never
    },
    resolveClaude: () => '/opt/claude',
    now: () => new Date('2026-10-18T10:00:00.000Z'),
  })
  return { store, calls, spawns, setHelp: (value: boolean) => { pluginHelp = value } }
}

test('parseRepo takes owner/repo and github URLs, refuses anything else', () => {
  assert.deepEqual(parseRepo('anthropics/claude-code'), { ok: true, slug: 'anthropics/claude-code' })
  assert.deepEqual(parseRepo('https://github.com/anthropics/claude-code/'), { ok: true, slug: 'anthropics/claude-code' })
  assert.deepEqual(parseRepo('https://github.com/a/b.git'), { ok: true, slug: 'a/b' })
  const evil = parseRepo('owner/repo; rm -rf ~')
  assert.equal(evil.ok, false)
  const otherHost = parseRepo('https://evil.example/owner/repo')
  assert.equal(otherHost.ok, false)
  assert.ok(!otherHost.ok && /not github.com/.test(otherHost.reason))
  const nested = parseRepo('a/b/c')
  assert.equal(nested.ok, false)
})

test('the index parser keeps only real named plugins and real fields', () => {
  const parsed = parseMarketplaceIndex(INDEX)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.name, 'owner-tools')
  assert.deepEqual(parsed.plugins.map(p => p.name), ['ship-helper', 'reviewer'])
  assert.equal(parsed.plugins[0].author, 'ada')
  assert.equal(parsed.plugins[1].description, 'Reviews diffs.')
  assert.equal(parseMarketplaceIndex('not json').ok, false)
  assert.equal(parseMarketplaceIndex('{"plugins":[]}').ok, false)
  const emptyName = parseMarketplaceIndex('{"name":"x","plugins":[{"name":"  "}]}')
  assert.equal(emptyName.ok, false)
})

test('add fetches once; list NEVER fetches; refresh is the only other read', async () => {
  const { store, calls } = harness()
  const added = await store.add('owner/repo')
  assert.equal(added.ok, true)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /^https:\/\/raw\.githubusercontent\.com\/owner\/repo\/HEAD\/\.claude-plugin\/marketplace\.json$/)
  assert.equal(added.source?.source, 'Claude Code marketplace')
  assert.equal(added.source?.plugins.length, 2)

  const listed = await store.list()
  assert.equal(listed.length, 1)
  assert.equal(calls.length, 1, 'listing is local — no automatic sync exists')

  const again = await store.add('owner/repo')
  assert.equal(again.ok, false)
  assert.match(again.answer, /already a source/)

  const refreshed = await store.refresh('owner/repo')
  assert.equal(refreshed.ok, true)
  assert.equal(calls.length, 2, 'refresh is an explicit second read')

  await store.remove('owner/repo')
  assert.equal((await store.list()).length, 0)
  assert.equal(calls.length, 2, 'removal reads nothing')
})

test('a failed read says so and saves nothing', async () => {
  const { store } = harness({ indexStatus: 404 })
  const added = await store.add('owner/gone')
  assert.equal(added.ok, false)
  assert.match(added.answer, /404/)
  assert.match(added.answer, /Nothing was saved/)
  assert.equal((await store.list()).length, 0)
})

test('oversized indexes are refused by the cap, not swallowed', async () => {
  const { store } = harness({ indexBody: 'x'.repeat(MARKETPLACE_FETCH_BYTES + 1) })
  const added = await store.add('owner/huge')
  assert.equal(added.ok, false)
  assert.match(added.answer, /more than 2 MB/)
})

test('commands are exact, built in main, and never interpolate renderer text', () => {
  const built = marketplaceCommands('owner/repo', 'owner-tools', 'ship-helper')
  assert.equal(built.ok, true)
  assert.deepEqual(built.lines.map(l => l.line), [
    'claude plugin marketplace add owner/repo',
    'claude plugin install ship-helper@owner-tools',
  ])
  const unsafe = marketplaceCommands('owner/repo', 'owner-tools', 'pwn; echo hi')
  assert.equal(unsafe.ok, false)
  const badSlug = marketplaceCommands('owner/repo$(id)', 'owner-tools')
  assert.equal(badSlug.ok, false)
  const badMarket = marketplaceCommands('owner/repo', 'bad name!', 'x')
  assert.equal(badMarket.ok, false)
})

test('run rebuilds the line from the saved source and answers honestly', async () => {
  const { store, spawns } = harness()
  await store.add('owner/repo')
  const ok = await store.run({ id: 'owner/repo', plugin: 'ship-helper', line: 1 })
  assert.equal(ok.ok, true)
  assert.deepEqual(spawns[0], { command: '/opt/claude', args: ['plugin', 'install', 'ship-helper@owner-tools'] })
  assert.match(ok.answer, /claude plugin install ship-helper@owner-tools/)

  // A line index that does not exist runs nothing at all.
  const before = spawns.length
  const bad = await store.run({ id: 'owner/repo', plugin: 'ship-helper', line: 9 })
  assert.equal(bad.ok, false)
  assert.equal(spawns.length, before)
})

test('agy phase 3 reports what the CLI actually offers — never a catalog', async () => {
  const { store, setHelp } = harness()
  setHelp(false)
  const plain = await store.agyState()
  assert.equal(plain.ok, true)
  assert.equal(plain.hasCatalog, false)
  assert.match(plain.answer, /no extension or catalog command/)
  setHelp(true)
  const mentions = await store.agyState()
  assert.equal(mentions.hasCatalog, false, 'a help page alone never opens phase 3')
  assert.match(mentions.answer, /mentions: extension/)
  assert.match(mentions.answer, /proven on a real signed-in run/)
})

test('the saved source list survives reload from disk', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mb-disk-'))
  try {
    const first = createMarketplaceStore({ root, fetchImpl: async () => ({ ok: true, status: 200, body: INDEX }) })
    await first.add('owner/repo')
    const bytes = await readFile(join(root, 'marketplaces.json'), 'utf8')
    assert.match(bytes, /Claude Code marketplace/)
    const second = createMarketplaceStore({ root })
    const listed = await second.list()
    assert.equal(listed.length, 1)
    assert.equal(listed[0].id, 'owner/repo')
    assert.equal(listed[0].marketplace, 'owner-tools')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
