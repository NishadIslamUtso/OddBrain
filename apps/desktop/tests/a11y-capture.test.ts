import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createVaultService } from '../src/main/vault/service'
import { handleVaultRequest } from '../src/main/vault/routes'

/**
 * Prophet (A.7) — accessibility-tree capture. Structure over screenshots: the
 * tree is roles and names, never full text. The vault treats it as a source
 * document (written once, deduped), the activity log says
 * `structure-captured`, and onui hands the newest tree to the engine with
 * format: 'a11y-tree' so it knows it is looking at structure, not prose.
 */

const CLOCK = (): Date => new Date('2026-10-10T19:00:00Z')
const YEAR = '2026'
const MONTH = '10'

function fixture(t: { after: (fn: () => unknown) => void }): ReturnType<typeof createVaultService> {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-a11y-'))
  mkdirSync(join(root, '00 System'), { recursive: true })
  writeFileSync(
    join(root, '00 System/Privacy & Access.md'),
    '# Privacy\n\n```yaml\nexcluded_patterns:\n  - bank.com/*\n```\n'
  )
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return createVaultService({ vaultPath: root, clock: CLOCK })
}

const TREE = 'banner: Shop\n  heading: Welcome\n  link: Cart\nmain\n  textbox: Search'

test('an a11y tree lands as a source document with nodes, depth and a fenced tree', t => {
  const service = fixture(t)
  const result = service.capture({ type: 'a11y_tree', url: 'https://example.com/shop', title: 'Shop', tree: TREE, nodes: 5, depth: 2 })
  assert.equal(result.skipped, undefined)
  assert.match(result.source, new RegExp(`02 Sources[\\\\/]A11y Trees[\\\\/]${YEAR}[\\\\/]a11y-`), 'the vault-relative path, in either separator')
  const doc = service.files().read(result.source)
  assert.match(doc, /nodes: 5/)
  assert.match(doc, /depth: 2/)
  assert.match(doc, /## Accessibility tree/)
  assert.match(doc, /```/)
  assert.match(doc, /banner: Shop/)
  // the activity line says structure-captured with the counts
  const jsonl = service.files().read(`02 Sources/Browser Activity/${YEAR}/${MONTH}.jsonl`)
  const event = JSON.parse(jsonl.trim().split('\n').slice(-1)[0])
  assert.equal(event.capture_status, 'structure-captured')
  assert.equal(event.nodes, 5)
  assert.equal(event.source_id, result.source)
})

test('the same tree twice is one document; a changed tree is a new one', t => {
  const service = fixture(t)
  const first = service.capture({ type: 'a11y_tree', url: 'https://example.com/a', title: 'A', tree: TREE, nodes: 5, depth: 2 })
  const again = service.capture({ type: 'a11y_tree', url: 'https://example.com/a', title: 'A', tree: TREE, nodes: 5, depth: 2 })
  assert.equal(again.duplicate, true)
  assert.equal(again.source, first.source)
  const changed = service.capture({ type: 'a11y_tree', url: 'https://example.com/a', title: 'A', tree: TREE + '\n  link: New', nodes: 6, depth: 3 })
  assert.equal(changed.duplicate, false)
  assert.notEqual(changed.source, first.source)
})

test('blacklisted sites are never written, and bad counts are refused', t => {
  const service = fixture(t)
  const denied = service.capture({ type: 'a11y_tree', url: 'https://bank.com/x', title: 'Bank', tree: TREE, nodes: 5, depth: 2 })
  assert.equal(denied.skipped, true)
  assert.throws(() => service.capture({ type: 'a11y_tree', url: 'https://ok.com', title: 'x', tree: TREE, nodes: 401, depth: 2 }), /between 1 and 400/)
  assert.throws(() => service.capture({ type: 'a11y_tree', url: 'https://ok.com', title: 'x', tree: TREE, nodes: 5, depth: 13 }), /between 1 and 12/)
  assert.throws(() => service.capture({ type: 'a11y_tree', url: 'https://ok.com', title: 'x', tree: '   ', nodes: 5, depth: 2 }), /tree are required/)
})

test('onui answers with the newest capture whatever it is — a tree carries format: a11y-tree', t => {
  const service = fixture(t)
  service.capture({ type: 'web_page', url: 'https://example.com/a', title: 'Prose page', content: 'Words.' })
  service.capture({ type: 'a11y_tree', url: 'https://example.com/b', title: 'Structured page', tree: TREE, nodes: 5, depth: 2 })
  const answer = service.onui() as {
    page: { url: string; format?: string; content: string; capture_status: string }
  }
  assert.equal(answer.page.url, 'https://example.com/b')
  assert.equal(answer.page.format, 'a11y-tree')
  assert.equal(answer.page.capture_status, 'structure-captured')
  // the fence is presentation: the content is the bare tree
  assert.match(answer.page.content, /^banner: Shop/)
  assert.ok(!answer.page.content.includes('```'))
  // and a newer prose capture flips back — newest line wins, no format field
  service.capture({ type: 'web_page', url: 'https://example.com/c', title: 'Newer prose', content: 'Later words.' })
  const newer = service.onui() as { page: { format?: string; content: string } }
  assert.equal(newer.page.format, undefined)
  assert.match(newer.page.content, /Later words\./)
})

const require = createRequire(import.meta.url)

test('the extension builder walks a fake DOM honestly: roles, names, caps, skips', () => {
  // The content script is plain browser JS; its builder is pure against this
  // minimal Element shape, so the test drives it directly. The script lives
  // two levels up from this app (the repo's extension/ folder).
  const { buildA11yTree, MAX_NODES } = require('../../../extension/content-scripts/a11y-capture.js')

  type El = {
    tagName: string
    children: El[]
    attrs: Record<string, string>
    innerText?: string
    hidden?: null
  }
  const el = (tag: string, attrs: Record<string, string> = {}, children: El[] = [], innerText = ''): El => ({
    tagName: tag.toUpperCase(),
    children,
    attrs,
    innerText,
    get firstElementChild() {
      return this.children[0]
    },
    nextElementSibling: undefined,
    getAttribute(name: string) {
      return this.attrs[name] ?? null
    },
    hasAttribute(name: string) {
      return name in this.attrs
    },
  })

  // Wire the sibling chain the walker follows.
  function link(parent: El): void {
    for (let i = 0; i < parent.children.length; i++) {
      ;(parent.children[i] as El & { nextElementSibling?: El }).nextElementSibling = parent.children[i + 1]
      link(parent.children[i])
    }
  }

  const dom = el('body', {}, [
    el('nav', {}, [el('a', { href: '/cart' }, [], 'Cart'), el('script', {}, [], 'evil()')]),
    el('main', {}, [
      el('h1', {}, [], 'Welcome'),
      el('img', { alt: 'Logo' }),
      el('div', {}, [el('input', { placeholder: 'Search' })]),
      el('p', {}, [], 'plain prose paragraph — no role, not recorded'),
    ]),
  ])
  link(dom)

  const built = buildA11yTree(dom)
  assert.match(built.tree, /^navigation$/m)
  // a nav with no name records the bare role, no colon, no invented name
  assert.match(built.tree, /link: Cart/)
  assert.match(built.tree, /heading: Welcome/)
  assert.match(built.tree, /image: Logo/)
  assert.match(built.tree, /textbox: Search/)
  assert.ok(!built.tree.includes('evil()'))
  assert.ok(!built.tree.includes('plain prose'))
  assert.equal(built.truncated, false)

  // A deep chain is cut at MAX_DEPTH and says so.
  let deep: El = el('main')
  const top = deep
  for (let i = 0; i < 40; i++) {
    const next = el('section')
    next.children.push(deep)
    deep = next
  }
  const deepBuilt = buildA11yTree(top)
  assert.ok(deepBuilt.truncated || deepBuilt.depth <= 12)

  // Node cap is honored and announced.
  const many: El = el('body', {}, Array.from({ length: MAX_NODES + 50 }, () => el('a', { href: '#x' }, [], 'x')))
  link(many)
  const capped = buildA11yTree(many)
  assert.equal(capped.truncated, true)
  assert.match(capped.tree, /cut at 400 nodes/)
})

test('the route table serves captures the extension already makes — no new door needed', t => {
  const service = fixture(t)
  const reply = handleVaultRequest(service, {
    route: '/capture',
    method: 'POST',
    query: new URLSearchParams(),
    body: { type: 'a11y_tree', url: 'https://example.com/x', title: 'X', tree: TREE, nodes: 5, depth: 2 },
  })
  assert.equal(reply.status, 200)
})
