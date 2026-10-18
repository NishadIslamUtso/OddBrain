import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createVaultService } from '../src/main/vault/service'
import { handleVaultRequest } from '../src/main/vault/routes'

/**
 * The link check (research adaptation: the wikilink linters). The rule it
 * enforces is the one the rulebooks teach — link only what exists, by path —
 * and what it reports it never repairs: dead links and ambiguous bare names
 * are counted and named, not silently rewritten.
 */

test('the link check separates dead, ambiguous and resolving links, by exact path', t => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-links-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (relative: string, body: string): void => {
    mkdirSync(join(root, relative, '..'), { recursive: true })
    writeFileSync(join(root, relative), body, 'utf8')
  }
  put('00 System/Privacy & Access.md', '# Privacy\n')
  put('05 Knowledge/Tea.md', 'Brewed from [[05 Knowledge/Leaves]] and [[Leaves]].\n')
  put('05 Knowledge/Leaves.md', 'The leaf itself. Alias [[05 Knowledge/Tea|the tea note]] counts.\n')
  put('05 Knowledge/Loop.md', 'Points at [[Missing Note]] — dead.\n')
  put('06 Review/Names.md', 'Two files share a name: [[Overview]] is ambiguous.\n')
  put('10 People/Overview.md', 'A person.\n')
  put('06 Review/Overview.md', 'Another Overview, same basename.\n')
  const service = createVaultService({ vaultPath: root })
  const report = service.links()
  assert.equal(report.files, 7)
  assert.equal(report.dead.length, 1)
  assert.equal(report.dead[0].target, 'Missing Note')
  assert.equal(report.dead[0].from, '05 Knowledge/Loop.md')
  assert.equal(report.ambiguous.length, 1)
  assert.equal(report.ambiguous[0].target, 'Overview')
  assert.equal(report.ambiguous[0].matches.length, 2)
  // checked counts every link instance, resolving ones included
  assert.ok(report.checked >= 5)
  // edges carry only the unambiguously resolved links
  assert.ok(report.edges.some(edge => edge.from === '05 Knowledge/Tea.md' && edge.to === '05 Knowledge/Leaves.md'))
  assert.ok(!report.edges.some(edge => edge.from === '06 Review/Names.md'))
})

test('templates hold placeholder links by design, so they are not scanned', t => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-links4-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, '00 System/Templates'), { recursive: true })
  mkdirSync(join(root, '05 Knowledge'), { recursive: true })
  writeFileSync(join(root, '00 System/Templates/Entity.md'), 'sources: [[source-id]] related: [[other-entity]]\n', 'utf8')
  writeFileSync(join(root, '05 Knowledge/Real.md', ), '[[05 Knowledge/Real2]]\n', 'utf8')
  writeFileSync(join(root, '05 Knowledge/Real2.md'), 'x\n', 'utf8')
  const report = createVaultService({ vaultPath: root }).links()
  assert.equal(report.files, 2)
  assert.equal(report.dead.length, 0)
})

test('anchors, aliases and dot prefixes do not break resolution; dot folders are skipped', t => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-links2-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, '05 Knowledge'), { recursive: true })
  mkdirSync(join(root, '.trash'), { recursive: true })
  writeFileSync(join(root, '05 Knowledge/A.md'), '[[05 Knowledge/B#section|b note]] [[./C]]\n', 'utf8')
  writeFileSync(join(root, '05 Knowledge/B.md'), 'x\n', 'utf8')
  writeFileSync(join(root, '05 Knowledge/C.md'), 'y\n', 'utf8')
  writeFileSync(join(root, '.trash/Z.md'), '[[Nowhere]]\n', 'utf8')
  const report = createVaultService({ vaultPath: root }).links()
  assert.equal(report.files, 3)
  assert.equal(report.dead.length, 0)
  assert.equal(report.ambiguous.length, 0)
  assert.equal(report.checked, 2)
})

test('the route table serves the link check read-only, on the doors the engine shares', t => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-links3-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, '00 System'), { recursive: true })
  writeFileSync(join(root, '00 System/Privacy & Access.md'), '# Privacy\n', 'utf8')
  const service = createVaultService({ vaultPath: root })
  const reply = handleVaultRequest(service, { route: '/links', method: 'GET', query: new URLSearchParams() })
  assert.equal(reply.status, 200)
  assert.deepEqual(reply.body, { files: 1, checked: 0, dead: [], ambiguous: [], edges: [] })
  const refused = handleVaultRequest(service, { route: '/links', method: 'POST', query: new URLSearchParams() })
  assert.equal(refused.status, 405)
})
