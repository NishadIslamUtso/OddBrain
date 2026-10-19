import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createVaultService } from '../src/main/vault/service'
import { createMemoryWorkspace } from '../src/main/memory/workspace'
import { searchVault } from '../src/main/vault/recall'
import { backupVault, restoreVault } from '../src/main/vault/backup'
import { handleVaultRequest } from '../src/main/vault/routes'
import { protectLocalApi } from '../src/main/api/guard'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function setup() {
  const parent = mkdtempSync(join(tmpdir(), 'ob-recall-')); roots.push(parent)
  const root = join(parent, 'vault'); mkdirSync(root)
  const vault = createVaultService({ vaultPath: root }), store = createMemoryWorkspace(vault.files())
  const conversation = { provider: 'Messenger', adapter: 'messenger', key: 'workshop', title: 'Workshop arrangements', url: 'https://example.com/messages' }
  const message = { id: 'm1', role: 'other', speaker: 'Sam', text: 'I will bring the orange toolbox on Friday.', timestamp: '', model: '', reply_to: '', identity: 'native', status: 'observed', attachments: [] }
  const save = () => vault.conversationSync({ op: 'messages', url: conversation.url, conversation, messages: [message], order: [message.id] })
  save()
  const job = store.discover().jobs[0]
  const raw = JSON.stringify({ proposals: [{ kind: 'profile', subject: job.source.account, title: 'Sam offered tools', text: 'Sam offered to bring an orange toolbox. Delivery is unconfirmed.', quote: message.text, date: '', uncertainty: 'An offer, not evidence of delivery.', }] })
  const complete = () => { store.complete(job.id, raw, 'small-model-v1'); return store.read().proposals[0] }
  return { parent, root, vault, store, conversation, message, save, job, complete }
}
describe('read-only cross-source recall and recovery', () => {
  it('finds complete message bodies without a model, shows only confirmed interpretations and preserves qualifications', () => {
    const h = setup(); h.message.text += ' filler'.repeat(2000) + ' ENDNEEDLE'; h.save()
    expect(searchVault(h.vault.files(), 'endneedle').hits[0].text).toContain('ENDNEEDLE')
    h.vault.files().writeAtomic('Notes/Preparation.md', 'Check the orange toolbox before Friday.')
    const p = h.complete()
    expect(searchVault(h.vault.files(), 'orange toolbox').hits.map(h => h.kind)).toEqual(['conversation','file'])
    h.store.act({ type: 'review', id: p.id, decision: 'approve', expectedRevision: h.store.read().revision })
    const results = searchVault(h.vault.files(), 'orange toolbox')
    expect(results.hits.map(h => h.kind)).toEqual(['confirmed','conversation','file'])
    expect(results.hits[0].text).toContain('unconfirmed')
    expect(results.hits[0].path).toBe(p.source.path)
    expect(results.hits[0].date).toBe('')
    h.store.act({ type: 'review', id: p.id, decision: 'retract', expectedRevision: h.store.read().revision })
    expect(searchVault(h.vault.files(), 'orange toolbox').hits.some(h => h.kind === 'confirmed')).toBe(false)
  })
  it('honors source revocation for originals and confirmed records; never searches settings or pending state', () => {
    const h = setup(), p = h.complete()
    h.store.act({ type: 'review', id: p.id, decision: 'approve', expectedRevision: h.store.read().revision })
    h.vault.files().writeAtomic('00 System/Private.md', 'secret-key orange toolbox')
    h.vault.files().writeAtomic('00 System/Privacy & Access.md', '---\nexcluded_patterns: ["example.com/*"]\n---\n')
    expect(searchVault(h.vault.files(), 'orange toolbox').hits).toEqual([])
    expect(searchVault(h.vault.files(), 'secret-key').hits).toEqual([])
    expect(searchVault(h.vault.files(), 'small-model-v1').hits).toEqual([])
  })
  it('damaged memory does not break raw-source recall and reports incompleteness', () => {
    const h = setup(); h.vault.files().writeAtomic('06 Review/Organizer/state.json', '{broken')
    const reply = searchVault(h.vault.files(), 'orange toolbox')
    expect(reply.hits).toHaveLength(1); expect(reply.incomplete).toBe(true)
    expect(h.vault.files().read('06 Review/Organizer/state.json')).toBe('{broken')
  })
  it('does not call a damaged current observation a reliable original', () => {
    const h = setup(), path = h.job.source.path.replace('/revisions/', '/messages/').replace(/-[a-f0-9]{64}\.json$/, '.json')
    const record = JSON.parse(h.vault.files().read(path)); record.message.text = 'corrupt newneedle'
    h.vault.files().writeAtomic(path, JSON.stringify(record))
    const reply = searchVault(h.vault.files(), 'newneedle')
    expect(reply.hits).toEqual([]); expect(reply.incomplete).toBe(true)
  })
  it('reports result and read budgets rather than pretending it searched everything', () => {
    const h = setup()
    for (let i = 0; i < 65; i++) h.vault.files().writeAtomic(`Notes/${i}.md`, 'matchword')
    h.vault.files().writeAtomic('Notes/huge.md', 'x'.repeat(16_000_001))
    const result = searchVault(h.vault.files(), 'matchword')
    expect(result.hits).toHaveLength(60); expect(result.notices).toHaveLength(2); expect(result.incomplete).toBe(true)
    expect(searchVault(h.vault.files(), ' ').ok).toBe(false)
  })
  it('is a guarded read-only API route, not an approval or model capability', () => {
    const h = setup()
    expect(handleVaultRequest(h.vault, { route: '/recall', method: 'GET', query: new URLSearchParams('q=toolbox'), body: null }).body.hits).toHaveLength(1)
    let status = 0, called = false
    const response = { writeHead: (code: number) => { status = code }, end: () => {} }
    expect(protectLocalApi({ url: '/api/vault/recall', method: 'GET', headers: { host: 'localhost:8765', origin: 'https://evil.example' } }, response, () => { called = true })).toBe(false)
    expect(status).toBe(403); expect(called).toBe(false)
    expect(protectLocalApi({ url: '/api/vault/recall', method: 'POST', headers: {} }, response, () => {})).toBe(false)
  })
  it('saves → links → confirms → backs up → restores → recalls with original evidence and binary attachments intact', () => {
    const h = setup(), p = h.complete()
    h.store.act({ type: 'person', name: 'Sam', expectedRevision: h.store.read().revision })
    const person = h.store.read().people[0]
    h.store.act({ type: 'link', account: p.subject, person: person.id, expectedRevision: h.store.read().revision })
    h.store.act({ type: 'review-batch', ids: [p.id], decision: 'approve', expectedRevision: h.store.read().revision })
    const bytes = Buffer.from([0,255,16,0,44,100]); h.vault.files().writeOnce('02 Sources/Attachments/test.bin', bytes)
    h.vault.files().writeAtomic('.obsidian/preferences.json', '{"theme":"dark"}')
    const original = readFileSync(join(h.root, p.source.path))
    const backup = join(h.parent, 'backup'), restored = join(h.parent, 'restored')
    expect(backupVault(h.root, backup).ok).toBe(true)
    expect(restoreVault(backup, restored).ok).toBe(true)
    const next = createVaultService({ vaultPath: restored }), state = createMemoryWorkspace(next.files()).read()
    expect(state.proposals[0].state).toBe('approved'); expect(state.accounts[0].person).toBe(person.id)
    expect(state.proposals[0].model).toBe('small-model-v1')
    expect(readFileSync(join(restored, p.source.path))).toEqual(original)
    expect(readFileSync(join(restored, '02 Sources/Attachments/test.bin'))).toEqual(bytes)
    expect(readFileSync(join(restored, '.obsidian/preferences.json'), 'utf8')).toContain('dark')
    expect(searchVault(next.files(), 'orange toolbox').hits.map(h => h.kind)).toEqual(['confirmed','conversation'])
    // Original vault is still untouched; a restored copy doesn't silently become active.
    expect(h.store.read().proposals[0]).toEqual(state.proposals[0])
  })
  it('refuses tampering, path escapes, existing destinations and backups inside the vault', () => {
    const h = setup(), backup = join(h.parent, 'backup'), restored = join(h.parent, 'restored')
    expect(backupVault(h.root, join(h.root, 'nested')).ok).toBe(false)
    expect(existsSync(join(h.root, 'nested'))).toBe(false)
    expect(backupVault(h.root, backup).ok).toBe(true)
    expect(backupVault(h.root, backup).ok).toBe(false)
    const m = JSON.parse(readFileSync(join(backup, 'oddbrain-backup.json'), 'utf8'))
    writeFileSync(join(backup, 'data', m.files[0].path), 'damaged')
    expect(restoreVault(backup, restored).ok).toBe(false); expect(existsSync(restored)).toBe(false)
    m.files[0].path = '../escape'
    writeFileSync(join(backup, 'oddbrain-backup.json'), JSON.stringify(m))
    expect(restoreVault(backup, restored).ok).toBe(false); expect(existsSync(join(h.parent, 'escape'))).toBe(false)
  })
  it('checks hashes even if the damaged file length is unchanged', () => {
    const h = setup(), backup = join(h.parent, 'backup')
    expect(backupVault(h.root, backup).ok).toBe(true)
    const m = JSON.parse(readFileSync(join(backup, 'oddbrain-backup.json'), 'utf8')), file = m.files[0]
    writeFileSync(join(backup, 'data', file.path), Buffer.alloc(file.bytes, 65))
    expect(restoreVault(backup, join(h.parent, 'restored')).ok).toBe(false)
    expect(createHash('sha256').update(readFileSync(join(backup, 'data', file.path))).digest('hex')).not.toBe(file.sha256)
  })
})

it('links a chosen profile name into recall without inferring identity, and refuses corrupt revision bytes', () => {
  const h = setup(), p = h.complete()
  expect(searchVault(h.vault.files(), 'Nadia toolbox').hits).toEqual([])
  h.store.act({ type: 'person', name: 'Nadia', expectedRevision: h.store.read().revision })
  h.store.act({ type: 'link', account: p.subject, person: h.store.read().people[0].id, expectedRevision: h.store.read().revision })
  expect(searchVault(h.vault.files(), 'Nadia toolbox').hits).toHaveLength(1)
  h.vault.files().writeAtomic(p.source.path, JSON.stringify({ message: { text: 'tampered' } }))
  const results = searchVault(h.vault.files(), 'toolbox')
  expect(results.hits).toEqual([]); expect(results.incomplete).toBe(true)
})

it('does not ignore excess query words silently', () => {
  const h = setup()
  expect(searchVault(h.vault.files(), Array(17).fill('toolbox').join(' ')).ok).toBe(false)
})
