// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { startLocalApi, type LocalApi } from '../src/main/api/server'
import { createVaultService } from '../src/main/vault/service'
import { LOCAL_API_ROUTES } from '../src/main/api/guard'
import { VAULT_ROUTES } from '../src/main/vault/routes'

/**
 * Reading one note, through every layer the app actually uses.
 *
 * The Vault screen, the Brain graph and the memory workspace all show a note by
 * asking `GET /api/vault/file?path=…`. That request crosses the boundary in
 * api/guard.ts before it reaches the vault, and the boundary is an allowlist.
 * For a while the route existed in the router and the interface called it, but
 * the allowlist did not name it: every preview answered 403, while the tests on
 * each side of the boundary stayed green. So this file checks the seam rather
 * than either side of it.
 */

const here = dirname(fileURLToPath(import.meta.url))

let root = ''

function makeVault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'oddbrain-preview-'))
  writeFileSync(join(dir, 'Note.md'), '# Hello\nOne line of a real note.\n')
  writeFileSync(join(dir, 'Empty.md'), '')
  mkdirSync(join(dir, 'Folder'))
  return dir
}

async function start(): Promise<{ api: LocalApi; service: ReturnType<typeof createVaultService> }> {
  root = root || makeVault()
  const service = createVaultService({ vaultPath: root, clock: () => new Date('2026-10-10T19:00:00Z') })
  const api = await startLocalApi({ port: 0, ollamaUrl: 'http://127.0.0.1:9', vault: service })
  return { api, service }
}

async function get(api: LocalApi, route: string, origin?: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${api.url}/api/vault${route}`, {
    headers: origin ? { origin } : {},
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

test('a note preview reaches the vault through the real boundary', async () => {
  const { api } = await start()
  try {
    const reply = await get(api, '/file?path=Note.md')
    assert.equal(reply.status, 200, 'the preview route must be on the boundary’s allowlist')
    assert.equal(reply.body.ok, true)
    assert.match(reply.body.content, /One line of a real note/)
    assert.equal(reply.body.truncated, false)
  } finally {
    await api.close()
    rmSync(root, { recursive: true, force: true })
    root = ''
  }
})

test('an empty note reads as empty; a missing one is named as missing', async () => {
  const { api } = await start()
  try {
    const empty = await get(api, '/file?path=Empty.md')
    assert.equal(empty.status, 200)
    assert.equal(empty.body.content, '', 'an existing empty file is a real answer')

    const missing = await get(api, '/file?path=Not%20There.md')
    assert.equal(missing.status, 404, 'absence is not an empty note')
    assert.equal(missing.body.ok, false)
    assert.match(missing.body.error, /no file at Not There\.md/i)
    assert.equal(missing.body.content, undefined)
  } finally {
    await api.close()
    rmSync(root, { recursive: true, force: true })
    root = ''
  }
})

test('a preview cannot be used to read outside the vault or a folder', async () => {
  const { api } = await start()
  try {
    const outside = await get(api, '/file?path=../secrets.md')
    assert.equal(outside.status, 400)
    assert.match(outside.body.error, /outside vault/i)
    assert.equal(outside.body.content, undefined)

    const folder = await get(api, '/file?path=Folder')
    assert.equal(folder.status, 404)
  } finally {
    await api.close()
    rmSync(root, { recursive: true, force: true })
    root = ''
  }
})

test('a captured message opens with the chat it came from, and a note does not', async () => {
  const base = `02 Sources/Conversations/Browser/${'a'.repeat(64)}`
  const message = `${'b'.repeat(64)}`
  const dir = mkdtempSync(join(tmpdir(), 'oddbrain-preview-chat-'))
  try {
    mkdirSync(join(dir, base, 'messages'), { recursive: true })
    writeFileSync(
      join(dir, `${base}/conversation.json`),
      JSON.stringify({ provider: 'Claude', key: 'x', title: 'A real chat', url: 'https://claude.ai/chat/abc', updated_at: '2026-10-18T12:00:00Z' })
    )
    writeFileSync(
      join(dir, `${base}/messages/${message}.md`),
      `---\ntype: conversation_message\nrole: user\n---\n# user\n\nThe marigold needs water.\n`
    )
    writeFileSync(join(dir, `${base}/messages/${message}.json`), JSON.stringify({ message: { id: message, role: 'user', text: 'The marigold needs water.' }, hash: 'x' }))
    writeFileSync(join(dir, 'Note.md'), '# Note\n\nPlain.\n')
    const service = createVaultService({ vaultPath: dir, clock: () => new Date('2026-10-10T19:00:00Z') })
    const api = await startLocalApi({ port: 0, ollamaUrl: 'http://127.0.0.1:9', vault: service })
    try {
      const captured = await get(api, `/file?path=${encodeURIComponent(`${base}/messages/${message}.md`)}`)
      assert.equal(captured.status, 200)
      assert.equal(captured.body.conversation.provider, 'Claude')
      assert.equal(captured.body.conversation.title, 'A real chat')
      assert.equal(captured.body.conversation.url, 'https://claude.ai/chat/abc')
      assert.equal(captured.body.conversation.role, 'user')
      const note = await get(api, '/file?path=Note.md')
      assert.equal(note.body.conversation, undefined)
    } finally {
      await api.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the preview stays same-origin: another page cannot read the vault through it', async () => {
  const { api } = await start()
  try {
    const foreign = await get(api, '/file?path=Note.md', 'https://example.com')
    assert.equal(foreign.status, 403)
    assert.equal(foreign.body.content, undefined)

    const same = await get(api, '/file?path=Note.md', api.url)
    assert.equal(same.status, 200)
  } finally {
    await api.close()
    rmSync(root, { recursive: true, force: true })
    root = ''
  }
})

/**
 * The interface's own calls, read from its source. A route the renderer asks for
 * but the boundary does not permit is invisible to tests on either side: the
 * router answers correctly when called directly, and the boundary is correct
 * about the list it was given. Only asking both the same question finds it.
 */
function interfaceLocalCalls(): Array<{ file: string; method: string; path: string }> {
  const roots = [join(here, '../src/renderer'), join(here, '../src/shared/lib')]
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
    }
  }
  roots.forEach(walk)
  const calls: Array<{ file: string; method: string; path: string }> = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/vault(Get|Post)\(\s*[`'"]([^`'"$?]*)/g)) {
      calls.push({ file, method: match[1] === 'Get' ? 'GET' : 'POST', path: `/api/vault${match[2]}` })
    }
    const ollama = [...text.matchAll(/\$\{API\}(\/[a-z]+)/g)]
    ollama.forEach((match, index) => {
      // Look only as far as the next call, so one route's options cannot be
      // read as another's.
      const end = index + 1 < ollama.length ? ollama[index + 1].index! : match.index! + 240
      const call = text.slice(match.index!, Math.min(end, match.index! + 240))
      calls.push({ file, method: /method:\s*'POST'/.test(call) ? 'POST' : 'GET', path: `/api/ollama${match[1]}` })
    })
  }
  return calls
}

test('every local API call the interface makes is one the boundary permits', () => {
  const calls = interfaceLocalCalls()
  assert.ok(calls.length >= 13, `expected the interface’s local calls to be found, found ${calls.length}`)
  const denied = calls
    .filter(call => !LOCAL_API_ROUTES.get(call.path)?.includes(call.method))
    .map(call => `${call.method} ${call.path} (${call.file.replace(here, '')})`)
  assert.deepEqual(denied, [], `the boundary would refuse these calls the interface makes:\n${denied.join('\n')}`)
})

test('every vault route the boundary permits is a route the vault answers', () => {
  const unknown: string[] = []
  for (const [pathname, methods] of LOCAL_API_ROUTES) {
    if (!pathname.startsWith('/api/vault')) continue
    const suffix = pathname.slice('/api/vault'.length)
    const route = suffix.replace(/\/+$/, '') || '/'
    const answered = VAULT_ROUTES[route]
    if (!answered) {
      unknown.push(`${pathname} has no handler`)
      continue
    }
    for (const method of methods) {
      if (!answered.includes(method)) unknown.push(`${method} ${pathname} is not answered by ${route}`)
    }
  }
  assert.deepEqual(unknown, [], `the boundary advertises routes the vault does not answer:\n${unknown.join('\n')}`)
})
