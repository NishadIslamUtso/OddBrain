/**
 * Memory_OB adapter trap suite — the judge's trap list, in the repository so
 * it survives. Run with: node packages/Memory_OB/goose-addon/test/run-traps.mjs
 *
 * Every trap uses disposable fixtures under /tmp. The adapter is never modified;
 * the suite proves the gates.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createChatStore } from '../../../../apps/03_oddbrain/src/main/chats/store'
import { createMemoryObStore } from '../../../../apps/03_oddbrain/src/main/memoryOb/store'

const sha = (v: string): string => createHash('sha256').update(v).digest('hex')
let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) { pass++; console.log(`PASS  ${name}`) } else { fail++; console.log(`FAIL  ${name}${detail ? ` — ${detail.slice(0, 200)}` : ''}`) }
}

const root = mkdtempSync('/tmp/memory-traps-')
const catalogueRoot = join(root, 'catalogue'), chatsRoot = join(root, 'chats'), vaultRoot = join(root, 'vault')
const bundle = join(process.cwd(), 'apps/03_oddbrain/out/memory-ob/memory-ob-mcp.cjs')

// ---------- fixtures ----------
mkdirSync(catalogueRoot, { recursive: true })
mkdirSync(join(vaultRoot, '00 System', 'Connectors'), { recursive: true })
mkdirSync(join(vaultRoot, '06 Review', 'Organizer'), { recursive: true })
writeFileSync(join(catalogueRoot, 'manifest.json'), JSON.stringify({
  format: 'oddbrain-memory-ob', version: 1, revision: 7,
  createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z',
  records: 2, relationships: 0, lastChatStoreRevision: 0,
}, null, 2) + '\n')
const projectId = 'proj-trap'
const objectPath = (identity: string): string => {
  const digest = sha(identity)
  return join(catalogueRoot, 'objects', digest.slice(0, 2), `${digest}.json`)
}
const writeObject = (identity: string, row: Record<string, unknown>): void => {
  const path = objectPath(identity)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(row, null, 2))
}
writeObject(`project:${projectId}`, { id: `project:${projectId}`, kind: 'project', lifecycle: 'active', authority: 'raw', source: { domain: 'generated', externalId: projectId, locator: 'projects.json' }, neverSend: false, sensitivity: 'ordinary' })
writeObject('project:proj-other', { id: 'project:proj-other', kind: 'project', lifecycle: 'active', authority: 'raw', source: { domain: 'generated', externalId: 'proj-other', locator: 'projects.json' }, neverSend: false, sensitivity: 'ordinary' })

const m1 = { id: 'm1', role: 'user', content: 'When is the Lantern launch?', at: '2026-10-22T01:00:00.000Z' }
const m3 = { id: 'm3', role: 'user', content: 'purplemonkey\u200Bdishwasher notes', at: '2026-10-22T01:02:00.000Z' }
const chat = {
  id: 'chat-trap-1', title: 'Trap chat', projectId, lifecycle: 'active',
  messages: [m1, { id: 'm2', role: 'assistant', content: 'Nothing about dates is stored in this conversation.', at: '2026-10-22T01:00:01.000Z' }, m3],
}
const trashChat = {
  id: 'chat-trash-1', title: 'Trashed chat', projectId: null, lifecycle: 'trash',
  trash: { at: '2026-10-22T02:00:00.000Z', by: 'ai', reason: 'owner asked for this one to go to Trash', previous: 'active' },
  messages: [{ id: 't1', role: 'user', content: 'the deleted confession: the moon is made of green cheese, half-eaten by mice', at: '2026-10-21T23:00:00.000Z' }],
}
createChatStore(chatsRoot).migrate({ chats: [chat, trashChat], currentChat: chat.id, rawChats: JSON.stringify([chat, trashChat]), rawCurrentChat: JSON.stringify(chat.id) })

writeFileSync(join(vaultRoot, '00 System', 'Privacy & Access.md'),
  '# Privacy & Access\n\nThe never-check list.\n\n```yaml\nexcluded_patterns:\n  - secret.example.com/*\n```\n')
writeFileSync(join(vaultRoot, '00 System', 'Connectors', 'Source Scope.md'), '# Source Scope\n\nNo scope patterns yet.\n')

const conv1 = sha('trap-conv-1'), conv2 = sha('trap-conv-2'), conv3 = sha('trap-conv-3')
const rev1 = `${sha('trap-rev-1a')}-${sha('trap-rev-1b')}.json`
const rev2 = `${sha('trap-rev-2a')}-${sha('trap-rev-2b')}.json`
const rev3 = `${sha('trap-rev-3a')}-${sha('trap-rev-3b')}.json`
const T1 = 'Observed: The Lantern launch date is March 9.'
const T5 = 'Observed: The secret code is omega-seven.'
const T6 = 'Observed: the drop is\u200B scheduled at dawn.'
const observation = (text: string): Record<string, unknown> => {
  const message = { id: 'm', role: 'assistant', text }
  return { hash: sha(JSON.stringify(message)), message }
}
const writeObservation = (conv: string, rev: string, text: string): string => {
  const record = observation(text)
  writeFileSync(join(vaultRoot, `02 Sources/Conversations/App/${conv}`, 'revisions', rev), JSON.stringify(record))
  return record.hash as string
}
for (const [dir, url] of [
  [`02 Sources/Conversations/App/${conv1}`, 'https://news.example.org/story'],
  [`02 Sources/Conversations/App/${conv2}`, 'https://secret.example.com/login'],
  [`02 Sources/Conversations/App/${conv3}`, 'https://news.example.org/drop'],
] as const) {
  mkdirSync(join(vaultRoot, dir, 'revisions'), { recursive: true })
  writeFileSync(join(vaultRoot, dir, 'conversation.json'), JSON.stringify({ url, title: 'Trap source', provider: 'example', key: 'k1', adapter: 'browser' }, null, 2))
}
const H1 = writeObservation(conv1, rev1, T1)
const H5 = writeObservation(conv2, rev2, T5)
const H6 = writeObservation(conv3, rev3, T6)

const text1 = 'The Lantern launch date is March 9.'
const textPending = 'The budget is 40 dollars.'
const textRejected = 'The API key is sk-trap-123.'
const text5 = 'The secret code is omega-seven.'
const text6 = 'The drop is scheduled at dawn.'
const proposal = (id: string, text: string, quote: string, stateName: string, sourcePath: string, hash: string, end: number): Record<string, unknown> => ({
  id, kind: 'journal', subject: 'Trap', title: `Trap ${id}`, text, quote, date: '2026-10-22',
  uncertainty: 'low', model: 'trap-model', authored: 'ai', state: stateName, revision: 1, history: [],
  source: {
    id: `src-${id}`, path: sourcePath, title: 'Trap source', provider: 'example', conversation: 'conv-key',
    message: 'msg-1', role: 'assistant', speaker: 'Bot', account: '', kind: 'ai',
    observed: '2026-10-22T00:00:00.000Z', hash, start: 0, end,
  },
})
const p1 = proposal('p1', text1, text1, 'approved', `02 Sources/Conversations/App/${conv1}/revisions/${rev1}`, H1, T1.length)
const p2 = proposal('p2', textPending, textPending, 'pending', `02 Sources/Conversations/App/${conv1}/revisions/${rev1}`, H1, T1.length)
const p3 = proposal('p3', textRejected, textRejected, 'rejected', `02 Sources/Conversations/App/${conv1}/revisions/${rev1}`, H1, T1.length)
const p4 = proposal('p4', text5, text5, 'approved', `02 Sources/Conversations/App/${conv2}/revisions/${rev2}`, H5, T5.length)
const p6 = proposal('p6', text6, 'the drop is', 'approved', `02 Sources/Conversations/App/${conv3}/revisions/${rev3}`, H6, T6.length)
const statePath = join(vaultRoot, '06 Review', 'Organizer', 'state.json')
const writeState = (proposals: Record<string, unknown>[] = [p1, p2, p3, p4]): void => {
  writeFileSync(statePath, JSON.stringify({
    version: 1, revision: 3, preferences: { enabled: true, model: 'trap', allowExternal: false },
    proposals, people: [], accounts: [], jobs: [], merges: [], scanCapped: false, discoveryWarnings: [], projectionWarnings: [],
  }, null, 2))
}
writeState()

// ---------- MCP stdio client ----------
class Mcp {
  private proc: ReturnType<typeof spawn>
  private buffer = ''
  private pending = new Map<number, (value: any) => void>()
  private nextId = 1
  constructor(catalogue: string = catalogueRoot, chats: string = chatsRoot, vault: string = vaultRoot) {
    this.proc = spawn('node', [bundle, '--catalogue', catalogue, '--chats', chats, '--vault', vault], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8')
      let index: number
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1)
        if (!line.trim()) continue
        const message = JSON.parse(line)
        if (message.id !== undefined && this.pending.has(message.id)) { this.pending.get(message.id)!(message); this.pending.delete(message.id) }
      }
    })
  }
  request(method: string, params: Record<string, unknown>): Promise<any> {
    const id = this.nextId++
    const promise = new Promise(resolve => {
      const guard = setTimeout(() => { this.pending.delete(id); resolve({ id, error: { message: 'MCP request timed out — the adapter did not answer.' } }) }, 30_000)
      this.pending.set(id, (value: any) => { clearTimeout(guard); resolve(value) })
    })
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    return promise
  }
  async call(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean; json: any }> {
    const response = await this.request('tools/call', { name, arguments: args })
    const text = response.result?.content?.[0]?.text ?? JSON.stringify(response.error ?? {})
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch { /* keep text */ }
    return { text, isError: Boolean(response.result?.isError) || Boolean(response.error), json: parsed }
  }
  close(): void { this.proc.stdin.end(); this.proc.kill() }
}

const run = async (): Promise<void> => {
  const mcp = new Mcp()
  await mcp.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'traps', version: '1' } })
  const listed = await mcp.request('tools/list', {})
  const names = (listed.result?.tools ?? []).map((tool: any) => tool.name).sort()
  check('trap0: four read-only tools plus the one owner-gated propose tool', JSON.stringify(names) === JSON.stringify(['memory_ob_evidence', 'memory_ob_project', 'memory_ob_propose', 'memory_ob_search', 'memory_ob_status']), JSON.stringify(names))

  const s1 = await mcp.call('memory_ob_search', { query: 'Lantern launch date' })
  const hit = (s1.json?.hits ?? []).find((row: any) => row.authority === 'confirmed-owner-memory')
  check('trap1: confirmed fact found and labelled', Boolean(hit) && hit.text.includes('March 9') && hit.recordId === 'interpretation:p1', s1.text)
  const ev1 = await mcp.call('memory_ob_evidence', { recordId: 'interpretation:p1', expectedSha256: sha(text1) })
  check('trap1: evidence returns quote + verified original', !ev1.isError && ev1.json.text === text1 && ev1.json.originalObservation === T1 && /hash verified/.test(ev1.json.sourceVerification), ev1.text)

  const s2 = await mcp.call('memory_ob_search', { query: 'budget dollars' })
  check('trap2: pending proposal never surfaces', (s2.json?.hits ?? []).length === 0, s2.text)
  const ev2 = await mcp.call('memory_ob_evidence', { recordId: 'interpretation:p2', expectedSha256: sha(textPending) })
  check('trap2: pending evidence refused as not found', ev2.isError && /Not found/.test(ev2.text), ev2.text)
  const s3 = await mcp.call('memory_ob_search', { query: 'sk-trap-123' })
  check('trap3: rejected proposal never surfaces', (s3.json?.hits ?? []).length === 0, s3.text)

  const ev4a = await mcp.call('memory_ob_evidence', { recordId: 'interpretation:p1', expectedSha256: sha('a different snapshot') })
  check('trap4: wrong hash refused as changed', ev4a.isError && /source changed/i.test(ev4a.text), ev4a.text)
  writeState([{ ...p1, text: 'The Lantern launch date is March 10.', quote: 'March 10' }, p2, p3, p4])
  const ev4b = await mcp.call('memory_ob_evidence', { recordId: 'interpretation:p1', expectedSha256: sha(text1) })
  check('trap4: edited claim refused as changed', ev4b.isError && /source changed/i.test(ev4b.text), ev4b.text)
  writeState()

  const s5 = await mcp.call('memory_ob_search', { query: 'omega-seven' })
  check('trap5: excluded source never surfaces', (s5.json?.hits ?? []).length === 0 && /excluded by current privacy rules/.test(s5.json?.notice ?? ''), s5.text)
  const ev5 = await mcp.call('memory_ob_evidence', { recordId: 'interpretation:p4', expectedSha256: sha(text5) })
  check('trap5: excluded evidence refused by privacy law', ev5.isError && /excluded or unavailable/.test(ev5.text), ev5.text)

  writeObservation(conv1, rev1, 'Observed: The Lantern launch date is April 1.')
  const ev7 = await mcp.call('memory_ob_evidence', { recordId: 'interpretation:p1', expectedSha256: sha(text1) })
  check('trap7: tampered original source refused', ev7.isError && /missing or changed/.test(ev7.text), ev7.text)
  writeObservation(conv1, rev1, T1)

  writeState([{ ...p1, quote: 'a quotation that was never observed' }, p2, p3, p4])
  const ev8 = await mcp.call('memory_ob_evidence', { recordId: 'interpretation:p1', expectedSha256: sha(text1) })
  check('trap8: unmatched quotation refused', ev8.isError && /quotation is not present/.test(ev8.text), ev8.text)
  writeState()

  writeObject(`app-chat:${chat.id}`, { id: `app-chat:${chat.id}`, kind: 'app-chat', lifecycle: 'active', authority: 'raw', source: { domain: 'brain-memory', externalId: chat.id, locator: 'chats' }, neverSend: true, sensitivity: 'ordinary' })
  const s9 = await mcp.call('memory_ob_search', { query: 'Lantern launch', projectId })
  check('trap9: Never-Send chat hidden from search', (s9.json?.hits ?? []).every((row: any) => row.kind !== 'app-chat'), s9.text)
  const ev9 = await mcp.call('memory_ob_evidence', { recordId: `app-chat:${chat.id}`, messageId: 'm1', expectedSha256: sha(m1.content), projectId })
  check('trap9: Never-Send chat evidence refused', ev9.isError && /Never Send/.test(ev9.text), ev9.text)
  writeObject(`app-chat:${chat.id}`, { id: `app-chat:${chat.id}`, kind: 'app-chat', lifecycle: 'active', authority: 'raw', source: { domain: 'brain-memory', externalId: chat.id, locator: 'chats' }, neverSend: false, sensitivity: 'ordinary' })

  const s10 = await mcp.call('memory_ob_search', { query: 'Lantern launch', projectId })
  check('trap10: project-scoped chat evidence available', (s10.json?.hits ?? []).some((row: any) => row.kind === 'app-chat' && row.authority === 'raw-unconfirmed-evidence'), s10.text)
  const s10b = await mcp.call('memory_ob_search', { query: 'Lantern launch' })
  check('trap10: no raw chat sweep without a Project scope', (s10b.json?.hits ?? []).every((row: any) => row.kind !== 'app-chat') && /approved Project scope/.test(s10b.json?.notice ?? ''), s10b.text)

  const ev12 = await mcp.call('memory_ob_evidence', { recordId: `app-chat:${chat.id}`, messageId: 'm1', expectedSha256: sha(m1.content), projectId })
  check('trap12: project-scoped evidence returns exact message', !ev12.isError && ev12.json.text === m1.content, ev12.text)
  const ev12b = await mcp.call('memory_ob_evidence', { recordId: `app-chat:${chat.id}`, messageId: 'm1', expectedSha256: sha(m1.content) })
  check('trap12: evidence without Project scope refused', ev12b.isError && /approved Project scope/.test(ev12b.text), ev12b.text)
  const ev12c = await mcp.call('memory_ob_evidence', { recordId: `app-chat:${chat.id}`, messageId: 'm1', expectedSha256: sha(m1.content), projectId: 'proj-other' })
  check('trap12: evidence from a different Project refused', ev12c.isError && /not part of the requested Project scope/.test(ev12c.text), ev12c.text)
  const ev12d = await mcp.call('memory_ob_evidence', { recordId: `app-chat:${chat.id}`, messageId: 'm1', expectedSha256: sha(m1.content), projectId, currentChatId: chat.id })
  check('trap12: current-chat evidence refused', ev12d.isError && /current chat is excluded/.test(ev12d.text), ev12d.text)

  writeState([p1, p2, p3, p4, p6])
  const ev13 = await mcp.call('memory_ob_evidence', { recordId: 'interpretation:p6', expectedSha256: sha(text6) })
  check('trap13: verified claim returned', !ev13.isError && ev13.json.text === text6, ev13.text)
  check('trap13: hazardous original observation omitted', ev13.json.originalObservation === '' && /omitted because the exact text contains/.test(ev13.json.notice ?? ''), ev13.text)
  writeState()

  const ownerRun = (verb: string, id: string) => spawnSync('node', [bundle, '--catalogue', catalogueRoot, '--chats', chatsRoot, '--vault', vaultRoot, 'owner', verb, id], { encoding: 'utf8' })
  const cli1 = ownerRun('never-send', `app-chat:${chat.id}`)
  check('trap14: owner never-send command succeeds', cli1.status === 0 && /Never Send set for/.test(cli1.stdout), cli1.stdout + cli1.stderr)
  const s14 = await mcp.call('memory_ob_search', { query: 'Lantern launch', projectId })
  check('trap14: CLI Never-Send hides chat from search', (s14.json?.hits ?? []).every((row: any) => row.kind !== 'app-chat'), s14.text)
  const cli2 = ownerRun('allow-send', `app-chat:${chat.id}`)
  check('trap14: owner allow-send clears the mark', cli2.status === 0 && /Never Send cleared for/.test(cli2.stdout), cli2.stdout + cli2.stderr)
  const s14b = await mcp.call('memory_ob_search', { query: 'Lantern launch', projectId })
  check('trap14: cleared mark restores project-scoped evidence', (s14b.json?.hits ?? []).some((row: any) => row.kind === 'app-chat'), s14b.text)

  const s11 = await mcp.call('memory_ob_search', { query: 'purplemonkey', projectId })
  check('trap11: hazard excerpt omitted', (s11.json?.hits ?? []).length === 0 && /invisible or direction-changing text/.test(s11.json?.notice ?? ''), s11.text)

  const fresh = await mcp.call('memory_ob_search', { query: 'Lantern launch date' })
  mcp.close()
  const restarted = new Mcp()
  await restarted.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'traps-2', version: '1' } })
  const s6 = await restarted.call('memory_ob_search', { query: 'Lantern launch date' })
  check('trap6: restart returns identical evidence', JSON.stringify(s6.json?.hits) === JSON.stringify(fresh.json?.hits) && s6.json?.revision === 7, s6.text)
  restarted.close()

  const freshRoot = mkdtempSync('/tmp/memory-fresh-')
  const freshCatalogue = join(freshRoot, 'store'), freshChats = join(freshRoot, 'chats')
  mkdirSync(freshCatalogue, { recursive: true }); mkdirSync(freshChats, { recursive: true })
  const at = new Date().toISOString()
  writeFileSync(join(freshCatalogue, 'manifest.json'), JSON.stringify({ format: 'oddbrain-memory-ob', version: 1, revision: 0, createdAt: at, updatedAt: at, records: 0, relationships: 0, lastChatStoreRevision: 0 }, null, 2) + '\n')
  const freshMcp = new Mcp(freshCatalogue, freshChats, freshRoot)
  await freshMcp.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'traps-3', version: '1' } })
  const statusFresh = await freshMcp.call('memory_ob_status', {})
  check('trap15: empty-but-valid catalogue status works', !statusFresh.isError && statusFresh.json.revision === 0, statusFresh.text)
  const searchFresh = await freshMcp.call('memory_ob_search', { query: 'anything at all' })
  check('trap15: empty brain search is safe and empty', !searchFresh.isError && (searchFresh.json?.hits ?? []).length === 0, searchFresh.text)
  freshMcp.close()

  // ---- trap16: the trashed-chat trap ----
  {
    const mcp = new Mcp()
    await mcp.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'traps-4', version: '1' } })
    const searchTrash = await mcp.call('memory_ob_search', { query: 'moon green cheese confession' })
    const trashText = searchTrash.text || ''
    check('trap16: trashed chat never surfaces in scoped search', !trashText.includes('green cheese'), trashText)
    const searchLive = await mcp.call('memory_ob_search', { query: 'When is the Lantern launch' })
    check('trap16: the live chat still answers', /Lantern launch/.test(searchLive.text || ''), searchLive.text)
    const evidenceTrash = await mcp.call('memory_ob_evidence', { statement: 'the moon is made of green cheese' })
    const evText = evidenceTrash.text || ''
    check('trap16: trashed chat produces no evidence record', !evText.includes('green cheese, half-eaten') && !evText.includes('chat-trash-1'), evText)
    mcp.close()
  }

  // ---- trap17: module intake — memory takes anything ----
  {
    const moduleRoot = mkdtempSync('/tmp/memory-modules-')
    const catalogue = join(moduleRoot, 'store'), chatsDir = join(moduleRoot, 'chats')
    mkdirSync(catalogue, { recursive: true }); mkdirSync(chatsDir, { recursive: true })
    const at = new Date().toISOString()
    writeFileSync(join(catalogue, 'manifest.json'), JSON.stringify({ format: 'oddbrain-memory-ob', version: 1, revision: 0, createdAt: at, updatedAt: at, records: 0, relationships: 0, lastChatStoreRevision: 0 }, null, 2) + '\n')
    const store = createMemoryObStore(catalogue)
    store.syncProjects([{ id: 'proj-mod', name: 'Module project', instruction: '', folder: '', createdAt: at, goals: [], references: [] }] as never)
    const text = 'The video review says the launch trailer renders at 1080p after the Tuesday change.'
    store.syncSources([{ id: 'shot-1', module: 'video', title: 'Trailer render check', text, projectId: 'proj-mod', speaker: 'owner' }])
    const hits = store.search({ query: 'trailer renders 1080p', projectId: 'proj-mod' })
    const hit = hits.find(h => h.recordId === 'raw-source:video:shot-1')
    check('trap17: any module can hand memory a source', Boolean(hit), JSON.stringify(hits).slice(0, 160))
    check('trap17: module source is labelled raw unconfirmed evidence', Boolean(hit) && hit!.authority === 'raw-unconfirmed-evidence' && /video module/.test(hit!.coverage), hit?.coverage)
    check('trap17: word-match finds the module source like any evidence', store.search({ query: 'trailer renders 1080p' }).some(h => h.recordId === 'raw-source:video:shot-1'), '')
    const mcp = new Mcp(catalogue, chatsDir, moduleRoot)
    await mcp.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'traps-5', version: '1' } })
    const ok = await mcp.call('memory_ob_evidence', { recordId: 'raw-source:video:shot-1', expectedSha256: sha(text), projectId: 'proj-mod' })
    check('trap17: evidence verifies the module source by hash', !ok.isError && /Trailer render check/.test(ok.text), ok.text)
    const wrong = await mcp.call('memory_ob_evidence', { recordId: 'raw-source:video:shot-1', expectedSha256: sha(text + '!'), projectId: 'proj-mod' })
    check('trap17: a wrong expected hash is refused', wrong.isError === true, wrong.text)
    const denied = await mcp.call('memory_ob_evidence', { recordId: 'raw-source:video:shot-1', expectedSha256: sha(text) })
    check('trap17: module evidence needs the Project scope', denied.isError === true && /Project scope/.test(denied.text), denied.text)
    writeFileSync(join(catalogue, 'sources', `${sha(text)}.txt`), `${text} tampered`)
    const tampered = await mcp.call('memory_ob_evidence', { recordId: 'raw-source:video:shot-1', expectedSha256: sha(text), projectId: 'proj-mod' })
    check('trap17: a tampered source copy is refused', tampered.isError === true && /changed|Nothing/.test(tampered.text), tampered.text)
    const meaning = await mcp.call('memory_ob_search', { query: 'trailer renders', meaning: true, projectId: 'proj-mod' })
    const meaningBlock = meaning.json?.meaning ?? {}
    check('trap17: meaning without an index is honest', !meaning.isError && /unchanged/i.test(String(meaningBlock.notice || '')), meaning.text)
    check('trap17: meaning never replaces word-match hits', Array.isArray(meaning.json?.hits), meaning.text)
    mcp.close()
  }

  // ---- trap18: the owner's card — propose-approve in chat ----
  {
    const cardRoot = mkdtempSync('/tmp/memory-card-')
    const catalogue = join(cardRoot, 'store'), chatsDir = join(cardRoot, 'chats'), vault = join(cardRoot, 'vault')
    mkdirSync(catalogue, { recursive: true })
    mkdirSync(join(vault, '00 System', 'Connectors'), { recursive: true })
    mkdirSync(join(vault, '06 Review', 'Organizer'), { recursive: true })
    const at = new Date().toISOString()
    writeFileSync(join(catalogue, 'manifest.json'), JSON.stringify({ format: 'oddbrain-memory-ob', version: 1, revision: 0, createdAt: at, updatedAt: at, records: 0, relationships: 0, lastChatStoreRevision: 0 }, null, 2) + '\n')
    writeFileSync(join(vault, '00 System', 'Privacy & Access.md'), '# Privacy & Access\n\nThe never-check list.\n\n```yaml\nexcluded_patterns:\n  - secret.example.com/*\n```\n')
    writeFileSync(join(vault, '00 System', 'Connectors', 'Source Scope.md'), '# Source Scope\n\nNo scope patterns yet.\n')
    const u1 = { id: 'u1', role: 'user', content: 'Remember: the launch moved to Tuesday and I prefer my tea without sugar.', at: '2026-10-23T01:00:00.000Z' }
    const a1 = { id: 'a1', role: 'assistant', content: 'Understood — I will keep that in mind going forward.', at: '2026-10-23T01:00:01.000Z' }
    const u2 = { id: 'u2', role: 'user', content: 'Remember: the launch moved to Tuesday and I prefer my tea without sugar.', at: '2026-10-23T01:02:00.000Z' }
    const cardChat = { id: 'chat-card-1', title: 'Card chat', projectId: null, lifecycle: 'active', messages: [u1, a1, u2] }
    createChatStore(chatsDir).migrate({ chats: [cardChat], currentChat: cardChat.id, rawChats: JSON.stringify([cardChat]), rawCurrentChat: JSON.stringify(cardChat.id) })
    const mcp = new Mcp(catalogue, chatsDir, vault)
    await mcp.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'traps-6', version: '1' } })

    const ambiguous = await mcp.call('memory_ob_propose', { kind: 'memory', title: 'Launch day', text: 'The launch moved to Tuesday.', basis: { quote: 'the launch moved to Tuesday' } })
    check('trap18: an ambiguous quotation is refused, nothing saved', ambiguous.isError === true && /more than one message/.test(ambiguous.text), ambiguous.text)
    const saved = await mcp.call('memory_ob_propose', { kind: 'memory', title: 'Launch day', text: 'The launch moved to Tuesday.', basis: { quote: 'the launch moved to Tuesday', messageId: 'u1' } })
    check('trap18: the card click saves exactly one confirmed memory', !saved.isError && saved.json?.saved === true && saved.json?.recordId?.startsWith('interpretation:'), saved.text)
    check('trap18: it is labelled confirmed owner memory, not raw evidence', saved.json?.savedAs?.kind === 'memory' && saved.json?.approval?.by === 'owner', saved.text)
    const found = await mcp.call('memory_ob_search', { query: 'launch moved to Tuesday' })
    const confirmed = (found.json?.hits ?? []).find((row: any) => row.recordId === saved.json?.recordId)
    check('trap18: word-match finds it as confirmed memory', confirmed?.authority === 'confirmed-owner-memory', found.text)
    const ev = await mcp.call('memory_ob_evidence', { recordId: saved.json?.recordId, expectedSha256: saved.json?.sha256 })
    check('trap18: evidence verifies the saved text by hash', !ev.isError && /launch moved to Tuesday/.test(ev.text), ev.text)
    const wrongHash = await mcp.call('memory_ob_evidence', { recordId: saved.json?.recordId, expectedSha256: sha('different') })
    check('trap18: a wrong hash is refused as changed', wrongHash.isError === true, wrongHash.text)
    const again = await mcp.call('memory_ob_propose', { kind: 'memory', title: 'Launch day again', text: 'Duplicate attempt.', basis: { quote: 'the launch moved to Tuesday', messageId: 'u1' } })
    check('trap18: the same quotation twice says already saved, never a second copy', !again.isError && again.json?.already === true && again.json?.saved === false, again.text)
    const aiReply = await mcp.call('memory_ob_propose', { kind: 'memory', title: 'From the AI', text: 'Something the assistant said.', basis: { quote: 'keep that in mind going forward', messageId: 'a1' } })
    check('trap18: an AI reply cannot become a personal fact', aiReply.isError === true && /capsule|personal fact/.test(aiReply.text), aiReply.text)
    const capsule = await mcp.call('memory_ob_propose', { kind: 'capsule', title: 'Assistant acknowledgement', text: 'The assistant acknowledged the launch change.', basis: { quote: 'keep that in mind going forward', messageId: 'a1' } })
    check('trap18: an AI reply may still become a capsule', !capsule.isError && capsule.json?.saved === true, capsule.text)
    const invisible = await mcp.call('memory_ob_propose', { kind: 'journal', title: 'Sneaky', text: 'Visible\u200Binvisible', basis: { quote: 'prefer my tea without sugar', messageId: 'u1' } })
    check('trap18: invisible characters in the memory text are refused', invisible.isError === true && /invisible/.test(invisible.text), invisible.text)
    const journal = await mcp.call('memory_ob_propose', { kind: 'journal', title: 'Tea preference', text: 'I prefer my tea without sugar.', date: '2026-10-23', basis: { quote: 'prefer my tea without sugar', messageId: 'u2' } })
    check('trap18: a journal lands as a journal with its event date', !journal.isError && journal.json?.saved === true && journal.json?.savedAs?.kind === 'journal', journal.text)
    const bogus = await mcp.call('memory_ob_propose', { kind: 'memory', title: 'Made up', text: 'Invented memory.', basis: { quote: 'this was never said by anyone' } })
    check('trap18: a quotation that is not an exact message is refused', bogus.isError === true && /not an exact message/.test(bogus.text), bogus.text)
    mcp.close()
  }
}

run().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}).catch(error => { console.error(error); process.exit(1) })