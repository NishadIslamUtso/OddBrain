// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleVaultRequest } from '../src/main/vault/routes'
import { createVaultService } from '../src/main/vault/service'

/**
 * Vault (05): the folder on screen. The routes answer from the real files —
 * the tree, one file's content (with the vault's own escape rules), and a
 * content search that names the file and the line.
 */
function serviceOn(root: string) {
  return createVaultService({ vaultPath: root })
}

function request(route: string, query = new URLSearchParams()): Parameters<typeof handleVaultRequest>[1] {
  return { route, method: 'GET', query, body: {}, headers: new Headers() } as never
}

test('vault routes: the tree is the real files, and the route table knows the new doors', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-vault-'))
  try {
    mkdirSync(join(root, 'notes'), { recursive: true })
    writeFileSync(join(root, 'notes', 'plan.md'), '# Plan\n\nShip the thing.', 'utf8')
    const service = serviceOn(root)
    const reply = handleVaultRequest(service, request('/files')) as { status: number; body: { files: string[]; capped: boolean } }
    assert.equal(reply.status, 200)
    assert.deepEqual(reply.body.files, ['notes/plan.md'])
    assert.equal(reply.body.capped, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('vault routes: one file reads back; the vault refuses escapes', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-vault2-'))
  try {
    writeFileSync(join(root, 'a.md'), 'hello vault', 'utf8')
    const service = serviceOn(root)
    const good = new URLSearchParams({ path: 'a.md' })
    const reply = handleVaultRequest(service, request('/file', good)) as { status: number; body: { content: string } }
    assert.equal(reply.status, 200)
    assert.equal(reply.body.content, 'hello vault')

    const escape = new URLSearchParams({ path: '../outside.md' })
    const refused = handleVaultRequest(service, request('/file', escape)) as { status: number }
    assert.equal(refused.status, 400, 'a path outside the vault is an error, never a read')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('vault routes: content search names the file and the line', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-vault3-'))
  try {
    writeFileSync(join(root, 'x.md'), 'first line\nthe password is carrots', 'utf8')
    writeFileSync(join(root, 'y.md'), 'nothing here', 'utf8')
    const service = serviceOn(root)
    const reply = handleVaultRequest(service, request('/grep', new URLSearchParams({ q: 'password' }))) as {
      status: number
      body: { hits: Array<{ path: string; line: number; text: string }> }
    }
    assert.equal(reply.status, 200)
    assert.equal(reply.body.hits.length, 1)
    assert.equal(reply.body.hits[0].path, 'x.md')
    assert.equal(reply.body.hits[0].line, 2)
    // An empty needle is a mistake, answered as one.
    const empty = handleVaultRequest(service, request('/grep')) as { status: number }
    assert.equal(empty.status, 400)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
