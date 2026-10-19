// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { startLocalApi } from '../src/main/api/server'
import { createVaultService } from '../src/main/vault/service'

/**
 * Search over everything the vault holds.
 *
 * The old vault had a name filter and a `grep` that stopped at the first
 * matching line per file. This suite is about the three questions a person
 * actually asks of it: is the best match first, did it search the captured
 * conversations (one file per message), and does "no results" mean "looked"?
 */

const CLOCK = (): Date => new Date('2026-10-19T10:00:00Z')
const DAY = 86_400_000

function vaultWith(files: Record<string, string>): { root: string; service: ReturnType<typeof createVaultService> } {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-search-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path.split('/').slice(0, -1).join('/')), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return { root, service: createVaultService({ vaultPath: root, clock: CLOCK }) }
}

function conversationFiles({
  id,
  title,
  provider = 'ChatGPT',
  url = 'https://chatgpt.com/c/abc',
  at = '2026-10-18T12:00:00Z',
  messages,
}: {
  id: string
  title: string
  provider?: string
  url?: string
  at?: string
  messages: Array<{ id: string; role: string; text: string }>
}): Record<string, string> {
  const base = `02 Sources/Conversations/Browser/${id}`
  const out: Record<string, string> = {
    [`${base}/conversation.json`]: JSON.stringify({ provider, key: id, title, url, updated_at: at, observed_at: at, message_ids: messages.map(m => m.id) }),
    [`${base}/conversation.md`]: `---\ntype: conversation\ntitle: ${title}\n---\n# ${title}\n`,
  }
  for (const message of messages) {
    out[`${base}/messages/${message.id}.md`] = `---\ntype: conversation_message\nconversation_id: ${id}\ntitle: ${title}\nurl: ${url}\nrole: ${message.role}\n---\n# ${message.role}\n\n${message.text}\n`
  }
  return out
}

test('every word narrows the answer, and the better match comes first', () => {
  const { root, service } = vaultWith({
    'Projects/Garden plan.md': '# Garden plan\n\nMint and tomatoes on the balcony.\n',
    'Projects/Kitchen.md': '# Kitchen\n\nThe balcony gets mint in spring. The balcony also gets basil. The balcony is where the mint lives.\n',
    'Projects/Travel.md': '# Travel\n\nA note about trains with none of the other words.\n',
  })
  try {
    const answer = service.search({ query: 'balcony mint' })
    assert.equal(answer.ok, true)
    assert.deepEqual(answer.terms, ['balcony', 'mint'])
    assert.equal(answer.hits.length, 2, 'a file with only one of the words is not a match')
    assert.equal(answer.hits[0].path, 'Projects/Kitchen.md', 'more occurrences and a nearer pair rank higher')
    assert.equal(answer.scanned.files, 3)
    // The whole phrase is worth more than the words apart.
    const phrase = service.search({ query: 'garden plan' })
    assert.equal(phrase.hits[0].path, 'Projects/Garden plan.md')
    // A title match is worth more than a mention in a paragraph.
    const title = service.search({ query: 'travel' })
    assert.equal(title.hits[0].path, 'Projects/Travel.md')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a captured conversation is searched through its messages, with a way back to it', () => {
  const files = conversationFiles({
    id: 'a'.repeat(64),
    title: 'Deploying the greenhouse sensor',
    messages: [
      { id: 'b'.repeat(64), role: 'user', text: 'How do I calibrate the greenhouse sensor?' },
      { id: 'c'.repeat(64), role: 'assistant', text: 'Start with a dry reference and a wet reference. The greenhouse sensor reads both.' },
    ],
  })
  const { root, service } = vaultWith(files)
  try {
    const answer = service.search({ query: 'greenhouse sensor calibrate' })
    assert.equal(answer.hits.length, 1, 'only the user message has all three words')
    const hit = answer.hits[0]
    assert.equal(hit.kind, 'message')
    assert.equal(hit.title, 'Deploying the greenhouse sensor')
    assert.equal(hit.conversation?.provider, 'ChatGPT')
    assert.equal(hit.conversation?.url, 'https://chatgpt.com/c/abc')
    assert.match(hit.path, /\/messages\/b{64}\.md$/)
    // The line number counts the frontmatter that was skipped, so it points at
    // the real line in the real file.
    const lines = files[hit.path].split('\n')
    assert.match(lines[hit.line - 1], /calibrate the greenhouse sensor/)
    assert.equal(hit.snippet.text.toLowerCase().includes('greenhouse'), true)
    // The marker points at a real word in the shown line, at the offset given.
    assert.equal(hit.snippet.text.slice(hit.snippet.start, hit.snippet.end).toLowerCase(), 'calibrate')

    // Filters are honest about what they exclude.
    assert.equal(service.search({ query: 'greenhouse', kind: 'note' }).hits.length, 0)
    const chats = service.search({ query: 'greenhouse', kind: 'conversation' }).hits
    assert.ok(chats.length >= 1)
    assert.ok(chats.every(hit => hit.kind !== 'note'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('one long conversation cannot fill the whole answer', () => {
  const messages = Array.from({ length: 8 }, (_, index) => ({
    id: String(index + 1).padStart(64, '0'),
    role: index % 2 ? 'assistant' : 'user',
    text: `The tomato plant is doing fine, observation ${index + 1}.`,
  }))
  const { root, service } = vaultWith({
    ...conversationFiles({ id: 'd'.repeat(64), title: 'Tomato diary', messages }),
    'Notes/Tomato.md': '# Tomato\n\nOne note about the tomato plant.\n',
  })
  try {
    const answer = service.search({ query: 'tomato plant', limit: 30 })
    const fromChat = answer.hits.filter(hit => hit.kind === 'message')
    assert.equal(fromChat.length, 3, 'a conversation contributes at most three message hits')
    assert.ok(answer.hits.some(hit => hit.path === 'Notes/Tomato.md'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a date window excludes older conversations and keeps notes', () => {
  const old = conversationFiles({
    id: 'e'.repeat(64),
    title: 'Old chat',
    at: new Date(CLOCK().getTime() - 40 * DAY).toISOString(),
    messages: [{ id: 'f'.repeat(64), role: 'user', text: 'The quokka appeared in the old chat.' }],
  })
  const fresh = conversationFiles({
    id: '1'.repeat(64),
    title: 'Fresh chat',
    at: new Date(CLOCK().getTime() - 2 * DAY).toISOString(),
    messages: [{ id: '2'.repeat(64), role: 'user', text: 'The quokka appeared in the fresh chat.' }],
  })
  const { root, service } = vaultWith({ ...old, ...fresh, 'Notes/Quokka.md': '# Quokka\n\nA note about the quokka.\n' })
  try {
    const answer = service.search({ query: 'quokka', days: 7 })
    const paths = answer.hits.map(hit => hit.path)
    assert.ok(paths.includes('Notes/Quokka.md'), 'notes are not dated, so a window cannot exclude them')
    assert.ok(paths.some(path => path.includes('1'.repeat(64))), 'the fresh chat is in the window')
    assert.ok(!paths.some(path => path.includes('e'.repeat(64))), 'the forty-day-old chat is not')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the answer says when it read only part of a file, and does not pretend to have searched it', () => {
  const head = `# Long note\n\nThe needle is at the top.\n${'x'.repeat(70 * 1024)}\n\nthe filler word appears only past the read window\n`
  const { root, service } = vaultWith({ 'Notes/Long.md': head })
  try {
    const near = service.search({ query: 'needle' })
    assert.equal(near.hits.length, 1)
    assert.equal(near.scanned.partial, 1, 'the file is larger than the read window')
    assert.equal(near.hits[0].partial, true)
    // A word past the window is honestly absent rather than guessed at.
    const far = service.search({ query: 'filler' })
    assert.equal(far.hits.length, 0, 'a term only in the unread tail is not reported as found')
    assert.equal(far.scanned.partial, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an empty query looks at nothing and says so; templates are not claims about the vault', () => {
  const { root, service } = vaultWith({
    '00 System/Templates/Note.md': '# Template\n\n[[source-id]] placeholder words\n',
    'Notes/Real.md': '# Real\n\nplaceholder words in a real note\n',
  })
  try {
    const empty = service.search({ query: '   ' })
    assert.equal(empty.hits.length, 0)
    assert.equal(empty.scanned.files, 0)
    const answer = service.search({ query: 'placeholder' })
    assert.deepEqual(answer.hits.map(hit => hit.path), ['Notes/Real.md'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an edited file is seen after its size changes, and a repeat query still answers', () => {
  const { root, service } = vaultWith({ 'Notes/Edit.md': '# Edit\n\nfirst version has the ostrich\n' })
  try {
    assert.equal(service.search({ query: 'ostrich' }).hits.length, 1)
    assert.equal(service.search({ query: 'ostrich' }).hits.length, 1, 'the cache answers the same question')
    appendFileSync(join(root, 'Notes/Edit.md'), '\nand now a longer second line with a pangolin\n')
    assert.equal(service.search({ query: 'pangolin' }).hits.length, 1, 'a changed file is read again')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('search reaches the interface through the real boundary and refuses an empty question', async () => {
  const { root, service } = vaultWith({
    'Notes/Searchable.md': '# Searchable\n\nThe marigold is on the windowsill.\n',
  })
  const api = await startLocalApi({ port: 0, ollamaUrl: 'http://127.0.0.1:9', vault: service })
  try {
    const found = await fetch(`${api.url}/api/vault/search?q=${encodeURIComponent('marigold windowsill')}`)
    assert.equal(found.status, 200)
    const body = (await found.json()) as { ok: boolean; hits: Array<{ path: string; snippet: { text: string } }> }
    assert.equal(body.ok, true)
    assert.equal(body.hits[0].path, 'Notes/Searchable.md')
    assert.match(body.hits[0].snippet.text, /marigold/)

    const empty = await fetch(`${api.url}/api/vault/search?q=`)
    assert.equal(empty.status, 400)
    assert.match(((await empty.json()) as { error: string }).error, /search word is required/)

    const other = await fetch(`${api.url}/api/vault/search?q=${encodeURIComponent('marigold')}&limit=999&kind=note`)
    assert.equal(other.status, 200, 'a silly limit is clamped, not refused')
    const limited = (await other.json()) as { hits: unknown[] }
    assert.ok(limited.hits.length <= 100)

    // The boundary's own refusal: the route is on the allowlist, the method is not.
    const write = await fetch(`${api.url}/api/vault/search?q=marigold`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    assert.equal(write.status, 403)
  } finally {
    await api.close()
    rmSync(root, { recursive: true, force: true })
  }
})
