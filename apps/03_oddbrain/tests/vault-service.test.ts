import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createVaultService } from '../src/main/vault/service'
import { dhakaParts, parseFollowups, safeSegment } from '../src/main/vault/text'
import { InputError } from '../src/main/vault/errors'
import { handleVaultRequest } from '../src/main/vault/routes'

/**
 * The vault service, on a real throwaway vault.
 *
 * These came from the old app's `vault-api.test.cjs` and `vault-capture.test.cjs`.
 * The subject is the same — what actually lands on disk, byte for byte, and what
 * is refused — but the subject moved into this app's main process, so the tests
 * call the service directly instead of posting to a companion server. Nothing is
 * asserted more weakly for the change: the file names, the wording of the
 * documents written, the deduplication and every refusal are the same rules.
 *
 * The clock is fixed, so a capture is byte-identical when it repeats and a
 * deduplicated file can be compared exactly.
 */

const CLOCK = (): Date => new Date('2026-10-10T19:00:00Z')
const YEAR = '2026'

function seed(root: string, relative: string, content: string): void {
  const full = join(root, relative)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf-8')
}

type Fixture = {
  root: string
  service: ReturnType<typeof createVaultService>
  read: (relative: string) => string
}

/** A vault with the two canonical system documents and whatever a test adds. */
function fixture(t: { after: (fn: () => unknown) => void }, files: Record<string, string> = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-vault-'))
  mkdirSync(join(root, '00 System'), { recursive: true })
  writeFileSync(
    join(root, '00 System/Privacy & Access.md'),
    '# Privacy\n\n```yaml\nexcluded_patterns:\n  - bank.com/*\n```\n'
  )
  for (const [relative, content] of Object.entries(files)) seed(root, relative, content)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return {
    root,
    service: createVaultService({ vaultPath: root, clock: CLOCK }),
    read: (relative: string) => readFileSync(join(root, relative), 'utf8'),
  }
}

const conversation = (extra: Record<string, unknown> = {}): Record<string, any> => ({
  type: 'conversation',
  provider: 'OddBrain',
  conversation_id: 'chat-1',
  title: 'Original source',
  captured_at: '2026-10-10T19:00:00Z',
  messages: [
    { role: 'user', text: 'Original user message', timestamp: '2026-10-10T18:00:00Z' },
    { role: 'assistant', text: 'Original reply', timestamp: '2026-10-10T18:01:00Z', status: 'complete' },
  ],
  ...extra,
})

/* ------------------------------------------------------------------ the rules */

test('a missing vault is reported, never replaced with an empty one', () => {
  const missing = join(tmpdir(), `ai-assistant-missing-${Date.now()}`)
  const service = createVaultService({ vaultPath: missing, clock: CLOCK })
  const status = service.status()
  assert.equal(status.ok, false)
  assert.equal(status.available, false)
  assert.match(String(status.error), /No vault at/)
  assert.match(String(status.error), /never created/)
  assert.throws(() => service.capture(conversation()), /No vault at/)
  assert.equal(existsSync(missing), false, 'nothing may be created to stand in for it')
})

test('vault dates are Asia/Dhaka, not the machine timezone', () => {
  assert.deepEqual(dhakaParts(new Date('2026-10-10T19:00:00Z')), {
    year: '2026',
    month: '10',
    date: '2026-10-11',
  })
})

test('only unchecked boxes become follow-ups, with their dates read out', () => {
  const items = parseFollowups('- [ ] Follow-up: [[gym-plan]] - next check 2026-10-12\n- [x] Done: [[old]]\n')
  assert.equal(items.length, 1)
  assert.equal(items[0].topic, 'Follow-up: gym-plan')
  assert.equal(items[0].next_check, '2026-10-12')
})

test('a file name that had to be rewritten is refused instead', () => {
  assert.equal(safeSegment('chat-1', 'id'), 'chat-1')
  assert.throws(() => safeSegment('../escape', 'id'), InputError)
  assert.throws(() => safeSegment('a/b', 'id'), InputError)
  assert.throws(() => safeSegment('', 'id'), InputError)
})

/* ------------------------------------------------------------------ status and today */

test('status reports the vault it is writing into', (t) => {
  const { root, service } = fixture(t, {
    '04 Working Memory/Current Snapshot.md': '# Current Snapshot\n\nWorking on the clone.\n',
  })
  const status = service.status()
  assert.equal(status.ok, true)
  assert.equal(status.available, true)
  assert.equal(status.vault, root)
  assert.ok(status.counts.files >= 2)
  assert.equal(status.time, CLOCK().toISOString())
})

test('today returns snapshot, open loops, follow-ups and the journal path', (t) => {
  const { root, service } = fixture(t, {
    '04 Working Memory/Open Loops.md': '# Open Loops\n\n- [ ] Follow-up: [[gym-plan]] - next check 2026-10-12\n- [x] Done: [[old]]\n',
    '04 Working Memory/Current Snapshot.md': '# Current Snapshot\n\nWorking on the clone.\n',
  })
  const data = service.today()
  assert.match(data.snapshot, /Working on the clone/)
  assert.match(data.openLoops, /gym-plan/)
  assert.equal(data.followups.length, 1)
  assert.equal(data.followups[0].next_check, '2026-10-12')
  assert.match(data.journalPath, /^08 Journal\/\d{4}\/\d{4}-\d{2}-\d{2}\.md$/)
  assert.equal(data.vault, root)
})

/* ------------------------------------------------------------------ the blacklist */

test('the blacklist round-trips and is written into both system documents', (t) => {
  const { service, read } = fixture(t)
  assert.deepEqual(service.blacklist(), ['bank.com/*'])

  const updated = service.updateBlacklist({ excluded_patterns: ['bank.com/*', 'https://private.example.com/page'] })
  assert.deepEqual(updated.excluded_patterns, ['bank.com/*', 'https://private.example.com/page'])
  for (const file of ['00 System/Privacy & Access.md', '00 System/Connectors/Source Scope.md']) {
    assert.match(read(file), /## Never-check blacklist|excluded_patterns/)
    const lines = read(file).split(/\r?\n/).map(line => line.trim())
    assert.ok(lines.some(line => line === '- https://private.example.com/page'))
  }

  // The second document did not exist before; it is created with the list, not
  // with a broken half of it.
  assert.deepEqual(service.blacklist(), ['bank.com/*', 'https://private.example.com/page'])

  // Revocable: an empty list clears the deny list.
  assert.deepEqual(service.updateBlacklist({ excluded_patterns: [] }).excluded_patterns, [])
  assert.deepEqual(service.blacklist(), [])
})

test('blacklist edits keep every other field and the surrounding prose', (t) => {
  const { service, read } = fixture(t, {
    '00 System/Connectors/Source Scope.md': `---
provider: browser
excluded_patterns: [bank.com/*]
---

# Keep this note

\`\`\`yaml
other_setting: keep
excluded_patterns: [bank.com/*]
\`\`\`
`,
  })
  const result = service.updateBlacklist({ action: 'remove', excluded_patterns: ['bank.com/*'] })
  assert.equal(result.ok, true)
  assert.deepEqual(service.blacklist(), [])
  const document = read('00 System/Connectors/Source Scope.md')
  assert.match(document, /provider: browser/)
  assert.match(document, /other_setting: keep/)
  assert.match(document, /Keep this note/)
})

test('the previous text is archived before the blacklist changes', (t) => {
  const { root, service } = fixture(t)
  service.updateBlacklist({ action: 'add', excluded_patterns: ['private.example/*'] })
  const revisions = readdirSync(join(root, '90 Archive/System Revisions'))
  assert.ok(revisions.length >= 1)
  assert.ok(revisions.some(name => name.endsWith('Privacy & Access.md')))
})

test('a blacklisted URL is skipped, logged, and written nowhere', (t) => {
  const { root, service } = fixture(t)
  const denied = service.capture({ type: 'web_page', url: 'https://bank.com/secret', content: 'MUST NOT SAVE' })
  assert.equal(denied.skipped, true)
  assert.equal(denied.reason, 'blacklist')
  assert.equal(existsSync(join(root, '02 Sources/Web Pages')), false)
  const activity = readFileSync(join(root, `09 Activity & Undo/${YEAR}/10.md`), 'utf8')
  assert.match(activity, /skipped - blacklist/)

  service.updateBlacklist({ action: 'remove', excluded_patterns: ['bank.com/*'] })
  const allowed = service.capture({ type: 'web_page', url: 'https://bank.com/secret', content: 'Explicitly allowed again' })
  assert.equal(allowed.ok, true)
  assert.match(readFileSync(join(root, String(allowed.source)), 'utf8'), /Explicitly allowed again/)
})

/* ------------------------------------------------------------------ conversations */

test('a conversation is written under its provider, and a retry is one file', (t) => {
  const { root, service, read } = fixture(t)
  const first = service.capture(conversation())
  assert.equal(first.ok, true)
  assert.equal(first.duplicate, false)
  assert.match(String(first.source), new RegExp(`^02 Sources/Conversations/OddBrain/${YEAR}/chat-1-[0-9a-f]+\\.md$`))

  const original = read(String(first.source))
  assert.match(original, /Original user message/)
  assert.match(original, /Original reply/)
  assert.match(original, /18:00:00Z/)
  assert.match(original, /### \[user\]/)
  assert.match(original, /Response status: complete/)

  // The same conversation again: deduplicated, byte-identical, never rewritten.
  const retry = service.capture(conversation({ captured_at: '2026-10-11T01:00:01+06:00' }))
  assert.equal(retry.duplicate, true)
  assert.equal(read(String(retry.source)), original)

  // A conversation that grew is a new source beside it; the old one stays.
  const grown = service.capture(
    conversation({
      messages: [
        ...conversation().messages,
        { role: 'user', text: 'Next turn', timestamp: '2026-10-10T18:02:00Z' },
      ],
    })
  )
  assert.notEqual(grown.source, first.source)
  assert.equal(read(String(first.source)), original)

  // A conversation is not a claim about the person in it.
  assert.equal(existsSync(join(root, '03 Memory/Entities')), false, 'a title must not become a fact')
})

test('a conversation keeps thinking, context and the attachments that were sent', (t) => {
  const { root, service, read } = fixture(t)
  const payload = conversation({
    messages: [
      {
        role: 'user',
        text: 'see attached',
        timestamp: '2026-10-10T18:00:00Z',
        attachments: [
          { id: 'file-1', name: 'notes.md', kind: 'text', text: 'Original attachment' },
          { id: 'file-2', name: 'image.png', kind: 'image', mime: 'image/png', data: Buffer.from('test-image').toString('base64') },
        ],
      },
      {
        role: 'assistant',
        text: 'Answer',
        timestamp: '2026-10-10T18:01:00Z',
        thinking: 'Weighing two options',
        context: 'vault excerpt',
        status: 'complete',
      },
    ],
  })
  const result = service.capture(payload)
  assert.equal(result.ok, true)
  const note = read(String(result.source))
  assert.match(note, /Model thinking output/)
  assert.match(note, /Weighing two options/)
  assert.match(note, /Included vault context/)
  assert.match(note, /notes\.md.*02 Sources\/Attachments/)

  const attachments = readdirSync(join(root, '02 Sources/Attachments'))
  assert.equal(attachments.length, 2)
  const textFile = attachments.find(name => name.endsWith('.txt'))
  assert.equal(readFileSync(join(root, '02 Sources/Attachments', String(textFile)), 'utf8'), 'Original attachment')
  assert.ok(attachments.some(name => name.endsWith('.png')))
})

test('unusable stores are refused instead of half-written', (t) => {
  const { service } = fixture(t)
  for (const payload of [
    conversation({ provider: '../../outside' }),
    conversation({ conversation_id: '../escape' }),
    { type: 'not-implemented' },
    conversation({ messages: [] }),
    conversation({ messages: [{ role: 'observer', text: 'x' }] }),
    { type: 'web_page', url: 'file:///private', content: 'x' },
    { type: 'conversation', provider: 'OddBrain', conversation_id: 'x', messages: [{ role: 'user', text: 'x' }], captured_at: 'not-a-date' },
  ]) {
    assert.throws(() => service.capture(payload), InputError, JSON.stringify(payload).slice(0, 60))
  }
})

test('a symlink out of the vault is refused and nothing lands outside', (t) => {
  const { root, service } = fixture(t)
  const outside = mkdtempSync(join(tmpdir(), 'oddbrain-outside-'))
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  mkdirSync(join(root, '02 Sources'))
  try {
    symlinkSync(outside, join(root, '02 Sources/Conversations'), 'dir')
  } catch {
    // Windows denies symlinks without admin/developer-mode; the escape guard
    // itself is pinned on this filesystem and in the memory-files tests.
    t.skip('this filesystem denies symlinks')
  }
  assert.throws(() => service.capture(conversation()), InputError)
  assert.equal(readdirSync(outside).length, 0)
})

/* ------------------------------------------------------------------ other capture types */

test('a long readable source is not silently truncated', (t) => {
  const { read, service } = fixture(t)
  const content = `${'Original '.repeat(2500)}END-MARKER`
  const result = service.capture({ type: 'web_page', url: 'https://example.org/article', content, title: 'Article' })
  assert.equal(result.ok, true)
  assert.match(read(String(result.source)), /END-MARKER/)
})

test('an inaccessible source is logged, in both locations, with the required wording', (t) => {
  const { read, service } = fixture(t)
  const result = service.capture({
    type: 'wasnt_accessible',
    url: 'https://example.org/private',
    title: 'Private',
    reason: 'permission blocked',
  })
  assert.equal(result.ok, true)
  for (const relative of [String(result.source), `09 Activity & Undo/${YEAR}/10.md`]) {
    assert.match(read(relative), /wasn't accessible - permission blocked/)
  }
})

test('new history collection is refused without removing earlier saved visits', (t) => {
  const { service } = fixture(t), path = '02 Sources/Browser Activity/2026/10.jsonl'
  service.files().writeAtomic(path, '{"url":"https://example.org/old","capture_status":"visit-only"}\n')
  assert.throws(() => service.capture({ type: 'browser_visit', url: 'https://example.org/new' }), /retired/)
  assert.ok(service.files().read(path).includes('example.org/old'))
  assert.equal(service.files().read(path).includes('example.org/new'), false)
})

test('a readable page is recorded as content, with the visit beside it', (t) => {
  const { read, service } = fixture(t)
  const result = service.capture({
    type: 'web_page',
    url: 'https://example.org/page',
    title: 'Page',
    content: 'Body text',
    visited_at: '2026-10-01T01:00:00Z',
  })
  const line = JSON.parse(read(`02 Sources/Browser Activity/${YEAR}/10.jsonl`).trim())
  assert.equal(line.capture_status, 'content-captured')
  assert.equal(line.source_id, result.source)
  assert.equal(line.visited_at, '2026-10-01T01:00:00Z')
})

test('an artifact is filed as a runnable file beside a linked note', (t) => {
  const { root, read, service } = fixture(t)
  const result = service.capture({
    type: 'artifact',
    artifact: { id: 'art-1', title: 'Tic Tac Toe', type: 'html', content: '<!doctype html><html><body>hi</body></html>' },
  })
  assert.equal(result.ok, true)
  assert.match(String(result.source), /^02 Sources\/Attachments\/artifacts\/art-1-v1-[0-9a-f]+\.md$/)
  const note = read(String(result.source))
  assert.match(note, /Tic Tac Toe/)
  const fileName = note.match(/^File: \[\[(.+)\]\]$/m)?.[1] || ''
  assert.match(fileName, /^art-1-v1-[0-9a-f]+\.html$/)
  assert.match(readFileSync(join(root, '02 Sources/Attachments/artifacts', fileName), 'utf8'), /<body>hi<\/body>/)
})

test('a journal capture writes the day file, dated in the vault timezone', (t) => {
  const { read, service } = fixture(t)
  const result = service.capture({ type: 'journal', content: '# Today\n\nDid the work.' })
  assert.equal(result.source, '08 Journal/2026/2026-10-11.md')
  assert.match(read(String(result.source)), /Did the work/)
})

/* ------------------------------------------------------------------ the library */

test('capsules keep every version on disk while the library shows the newest', (t) => {
  const { root, service } = fixture(t)
  const capsule = { id: 'capsule-website', title: 'Blue website', background: 'Simple blue and white design', goals: ['Step by step'], version: 1 }
  const first = service.capture({ type: 'capsule', capsule })
  const second = service.capture({ type: 'capsule', capsule: { ...capsule, version: 2, background: 'Updated blue design' } })
  assert.notEqual(first.source, second.source)

  const library = service.capsules()
  assert.equal(library.length, 1)
  assert.equal(library[0].version, 2)
  assert.match(library[0].background, /Updated blue/)

  assert.equal(service.context('blue').capsules.length, 1)
  assert.equal(service.context('unrelated').capsules.length, 0)
  assert.equal(existsSync(join(root, String(first.source))), true, 'the earlier version stays in the vault')
})

test('an archived capsule does not resurrect the version before it', (t) => {
  const { service } = fixture(t)
  const capsule = { id: 'capsule-archived', title: 'Past context', version: 1, status: 'active', background: 'Historical' }
  service.capture({ type: 'capsule', capsule })
  service.capture({ type: 'capsule', capsule: { ...capsule, version: 2, status: 'archived' } })
  assert.deepEqual(service.capsules(), [])
})

/* ------------------------------------------------------------------ the route table */

test('every route answers, and a wrong request is told what is wrong', (t) => {
  const { service } = fixture(t)
  const call = (route: string, method = 'GET', body?: unknown, query = ''): { status: number; body: any } =>
    handleVault(service, route, method, body, query)

  assert.equal(call('/health').body.ok, true)
  assert.equal(call('/status').body.available, true)
  assert.ok(call('/today').body.journalPath)
  assert.deepEqual(call('/blacklist').body.excluded_patterns, ['bank.com/*'])
  assert.deepEqual(call('/capsules').body.capsules, [])
  assert.equal(call('/context').body.retrieval, 'local-keyword-search')

  const captured = call('/capture', 'POST', conversation())
  assert.equal(captured.status, 200)
  assert.equal(captured.body.ok, true)

  const listed = call('/blacklist', 'POST', { action: 'add', excluded_patterns: ['private.example/*'] })
  assert.equal(listed.status, 200)

  const zip = call('/export-zip', 'POST', { files: [{ name: 'index.html', content: '<h1>hi</h1>' }] })
  assert.equal(zip.status, 200)
  assert.ok(zip.body.bytes > 0)

  const bad = call('/capture', 'POST', { type: 'conversation', provider: '../x' })
  assert.equal(bad.status, 400)
  assert.match(bad.body.error, /Invalid provider/)

  assert.equal(call('/nonsense').status, 404)
  assert.equal(call('/capture').status, 405)
})

test('a missing vault answers 503 with the sentence, not a 200', () => {
  const service = createVaultService({ vaultPath: join(tmpdir(), `ai-assistant-absent-${Date.now()}`), clock: CLOCK })
  const reply = handleVault(service, '/status')
  assert.equal(reply.status, 200, 'status is readable: it is how the interface finds out')
  assert.equal(reply.body.available, false)
  assert.match(reply.body.error, /No vault at/)
  for (const route of ['/today', '/blacklist', '/capsules']) {
    assert.equal(handleVault(service, route).status, 503, route)
  }
  assert.equal(handleVault(service, '/capture', 'POST', conversation()).status, 503)
})

/* ------------------------------------------------------------------ helpers */

function handleVault(
  service: ReturnType<typeof createVaultService>,
  route: string,
  method = 'GET',
  body?: unknown,
  query = ''
): { status: number; body: any } {
  const reply = handleVaultRequest(service, {
    route,
    method,
    query: new URLSearchParams(query),
    body,
  })
  return { status: reply.status, body: reply.body as any }
}

/* ------------------------------------------------------------ the monthly audit */

test('the monthly audit writes itself once, from the vault\u2019s own numbers', (t) => {
  const f = fixture(t, {
    '02 Sources/a.md': '# A\nSee [[b]] and [[no such note]].\n',
    '02 Sources/b.md': '# B\n',
    '08 Journal/2026/2026-10-10.md': '# Day\n',
    '04 Working Memory/Open Loops.md': '# Open Loops\n\n- [ ] one open\n- [x] one done\n',
  })
  const first = f.service.monthlyAudit()
  assert.equal(first.written, true)
  assert.equal(first.relative, '06 Review/Monthly Audits/2026-10.md')
  const body = f.read('06 Review/Monthly Audits/2026-10.md')
  assert.match(body, /# Monthly Audit, 2026-10/)
  assert.match(body, /Notes in 02 Sources: 2/)
  assert.match(body, /Journal entries in 08 Journal\/2026: 1/)
  assert.match(body, /Open loops still open: 1/)
  assert.match(body, /dead: 1/)
  // The write-once rule: the same month never writes twice.
  const again = f.service.monthlyAudit()
  assert.equal(again.written, false)
  assert.equal(again.relative, '06 Review/Monthly Audits/2026-10.md')
})

test('a new month writes a fresh page beside the last and never edits it', (t) => {
  const f = fixture(t, { '02 Sources/a.md': '# A\n' })
  f.service.monthlyAudit()
  const october = f.read('06 Review/Monthly Audits/2026-10.md')
  const roll = createVaultService({
    vaultPath: f.root,
    clock: () => new Date('2026-11-15T10:00:00Z'),
  }).monthlyAudit()
  assert.equal(roll.written, true)
  assert.equal(roll.relative, '06 Review/Monthly Audits/2026-11.md')
  assert.equal(f.read('06 Review/Monthly Audits/2026-10.md'), october, 'October is untouched')
  // The Today door can say which month the audit last covered.
  assert.equal(f.service.today().audit, '2026-11')
})
