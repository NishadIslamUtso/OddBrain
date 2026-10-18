import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_SETTINGS, folderProblem, readSettings, vaultCandidates, writeSettings } from '../src/main/settings'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import { createVaultService } from '../src/main/vault/service'
import { startLocalApi } from '../src/main/api/server'

/**
 * Settings, and what happens to the vault when it moves.
 *
 * The settings file is deliberately tiny, so what is worth testing is not the
 * format: it is that a damaged file never costs somebody a launch, that a wrong
 * folder is refused instead of created, and that pointing the app somewhere else
 * takes effect on the running app — with the old vault left exactly as it was.
 */

const CLOCK = (): Date => new Date('2026-10-10T19:00:00Z')

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

test('no settings file means nothing chosen yet, not an error', (t) => {
  const dir = tempDir('oddbrain-settings-')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.deepEqual(readSettings(join(dir, 'settings.json')), EMPTY_SETTINGS)
  assert.deepEqual(EMPTY_SETTINGS.permissions, {
    local: true,
    browserCapture: true,
    keepConversations: true,
    cloud: {},
  })
})

test('settings round-trip, and unknown keys are dropped rather than kept', (t) => {
  const dir = tempDir('oddbrain-settings-')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'nested', 'settings.json')

  const written = writeSettings(file, {
    vaultPath: '  /tmp/some vault  ',
    cloud: { baseUrl: ' https://example.test/v1 ', model: ' my-model ' },
  })
  assert.equal(written.vaultPath, '/tmp/some vault', 'the stored path is trimmed')
  // The custom provider's endpoint is not secret: it is a machine setting, and a
  // person can read and edit it in the same small file.
  assert.deepEqual(written.cloud, { baseUrl: 'https://example.test/v1', model: 'my-model' })
  assert.deepEqual(readSettings(file), {
    vaultPath: '/tmp/some vault',
    cloud: { baseUrl: 'https://example.test/v1', model: 'my-model' },
    // Nothing was said about permissions, so the file carries the defaults: a
    // local model may answer, a local vault may keep, nothing is switched off.
    permissions: { local: true, browserCapture: true, keepConversations: true, cloud: {} },
    // Nothing was said about the engine either, so it carries the brain the
    // owner verified works: Claude Code through the local Ollama door.
    engine: DEFAULT_ENGINE,
  })
  assert.equal(readdirSync(join(dir, 'nested')).includes('settings.json.tmp'), false, 'no half-written file is left')

  // A file someone edited by hand, with a stray key and a wrong type.
  writeFileSync(file, JSON.stringify({ vaultPath: 42, theme: 'dark' }), 'utf8')
  assert.deepEqual(readSettings(file), EMPTY_SETTINGS)
})

test('a damaged settings file is treated as empty, never as a failed launch', (t) => {
  const dir = tempDir('oddbrain-settings-')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'settings.json')
  writeFileSync(file, '{ this is not json', 'utf8')
  assert.deepEqual(readSettings(file), EMPTY_SETTINGS)
  // And it is not "repaired" behind the person's back.
  assert.equal(readFileSync(file, 'utf8'), '{ this is not json')
})

test('a hand-edited endpoint is capped, never trusted, and never a launch failure', (t) => {
  const dir = tempDir('oddbrain-settings-')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'settings.json')

  writeSettings(file, {
    vaultPath: '',
    cloud: { baseUrl: 'https://example.test/v1', model: 'x'.repeat(5000) },
  })
  const stored = readSettings(file)
  assert.equal(stored.cloud.baseUrl, 'https://example.test/v1')
  assert.equal(stored.cloud.model.length, 300, 'the model id is capped rather than stored whole')

  // A cloud object of the wrong shape degrades to empty, field by field.
  writeFileSync(file, JSON.stringify({ vaultPath: '/tmp', cloud: 'nonsense' }), 'utf8')
  assert.deepEqual(readSettings(file).cloud, { baseUrl: '', model: '' })
})

test('permissions round-trip, and anything unreadable becomes the safe default', (t) => {
  const file = join(tempDir('oddbrain-perms-'), 'settings.json')
  const written = writeSettings(file, {
    vaultPath: '',
    cloud: { baseUrl: '', model: '' },
    permissions: { local: false, browserCapture: false, keepConversations: false, cloud: { openai: false } },
  })
  assert.deepEqual(written.permissions, {
    local: false,
    browserCapture: false,
    keepConversations: false,
    cloud: { openai: false },
  })
  assert.deepEqual(readSettings(file).permissions, written.permissions, 'what was written is what is read')

  // A hand-edited file: unknown providers are dropped, non-booleans fall back to
  // the default — never to a yes that nobody chose, and never to a crash.
  const edited = writeFileSync(
    file,
    JSON.stringify({
      permissions: { local: 'yes please', cloud: { openai: false, madeup: true, anthropic: 'on' }, extra: 1 },
    })
  )
  void edited
  const read = readSettings(file)
  assert.deepEqual(read.permissions, {
    local: true,
    browserCapture: true,
    keepConversations: true,
    cloud: { openai: false },
  })

  writeFileSync(file, '{"permissions": "nonsense"}')
  assert.deepEqual(readSettings(file).permissions, {
    local: true,
    browserCapture: true,
    keepConversations: true,
    cloud: {},
  })
})

test('a folder chosen in Settings is the only candidate, so a missing one is reported', () => {
  // The decision wins outright: a chosen folder that has since gone missing must
  // be reported, not quietly replaced by the checkout's vault.
  assert.deepEqual(
    vaultCandidates({ chosen: '/tmp/notes', env: { AI_ASSISTANT_VAULT: '/env' }, checkout: '/co' }),
    ['/tmp/notes']
  )
  // With nothing chosen, the order is the fresh-install one.
  assert.deepEqual(
    vaultCandidates({ chosen: '  ', env: { AI_ASSISTANT_VAULT: '/env', AI_BRAIN_VAULT: '/brain' }, checkout: '/co', userData: '/ud' }),
    ['/env', '/brain', '', '/co', '/ud']
  )
})

test('a folder that cannot be used says why, and nothing is created', (t) => {
  const dir = tempDir('oddbrain-folders-')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const missing = join(dir, 'not-there')

  assert.match(folderProblem(''), /Choose a folder first/)
  assert.match(folderProblem(missing), /not there/)
  assert.equal(existsSync(missing), false, 'checking a folder never creates it')

  const file = join(dir, 'a-file.md')
  writeFileSync(file, 'x', 'utf8')
  assert.match(folderProblem(file), /a file, not a folder/)

  const real = join(dir, 'real vault')
  mkdirSync(real)
  assert.equal(folderProblem(real), '', 'an existing folder is usable')
})

test('pointing the app at another vault takes effect on the running app', async (t) => {
  const first = tempDir('oddbrain-vault-a-')
  const second = tempDir('oddbrain-vault-b-')
  t.after(() => {
    rmSync(first, { recursive: true, force: true })
    rmSync(second, { recursive: true, force: true })
  })

  const api = await startLocalApi({ port: 0, ollamaUrl: 'http://127.0.0.1:9', vault: createVaultService({ vaultPath: first, clock: CLOCK }) })
  t.after(() => api.close())

  const conversation = (id: string) => ({
    type: 'conversation',
    provider: 'OddBrain',
    conversation_id: id,
    title: `In ${id}`,
    captured_at: '2026-10-10T19:00:00Z',
    messages: [{ role: 'user', text: `kept in ${id}`, timestamp: '2026-10-10T18:00:00Z' }],
  })

  const capture = async (id: string) => {
    const response = await fetch(`${api.url}/api/vault/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(conversation(id)),
    })
    return (await response.json()) as { ok: boolean; source: string }
  }
  const status = async () => {
    const response = await fetch(`${api.url}/api/vault/status`)
    return (await response.json()) as { vault: string; available: boolean; counts: { files: number } }
  }

  const before = await capture('first')
  assert.equal(before.ok, true)
  assert.equal((await status()).vault, first)
  assert.equal(existsSync(join(first, before.source)), true)

  // Settings moves the vault. Same process, same port, no restart.
  const next = createVaultService({ vaultPath: second, clock: CLOCK })
  api.setVault(next)
  assert.equal((await status()).vault, second)
  assert.equal((await status()).counts.files, 0, 'the new vault reports its own contents')

  const after = await capture('second')
  assert.equal(after.ok, true)
  assert.equal(existsSync(join(second, after.source)), true)
  assert.equal(existsSync(join(first, before.source)), true, 'the old vault is left exactly as it was')
  assert.equal(existsSync(join(first, after.source)), false, 'nothing new is written to the vault left behind')
})

test('moving to a folder that is not there is refused, and the old vault keeps working', async (t) => {
  const vault = tempDir('oddbrain-vault-keep-')
  t.after(() => rmSync(vault, { recursive: true, force: true }))
  const api = await startLocalApi({ port: 0, ollamaUrl: 'http://127.0.0.1:9', vault: createVaultService({ vaultPath: vault, clock: CLOCK }) })
  t.after(() => api.close())

  const missing = join(vault, '..', 'definitely-not-here')
  assert.match(folderProblem(missing), /not there/)
  // The refusal is why the service is not re-pointed: the app stays where it was.
  const status = await fetch(`${api.url}/api/vault/status`)
  assert.equal(((await status.json()) as { vault: string }).vault, vault)
  assert.equal(existsSync(missing), false)
})
