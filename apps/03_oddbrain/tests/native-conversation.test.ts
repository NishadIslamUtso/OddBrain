import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { createNativeContext } from '../src/main/nativeContext'
import { newProject } from '../src/shared/lib/projects'
import { createEngineSocket, sessionKey } from '../src/main/engine/socket'
import { createSessionMemory } from '../src/main/engine/sessionMemory'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import { createTurnArchive } from '../src/main/turnArchive'
import { dispatchRecordedTurn } from '../src/main/recordedDispatch'
import { recordNativeTranscript } from '../src/shared/lib/nativeChat'
import { createPermissionTickets } from '../src/main/engine/permissionTickets'
import { checkNativeConversation } from '../src/shared/lib/nativeConversation'
import { vaultFollowupDraft } from '../src/shared/lib/retrievalProposal'
const roots: string[] = []
const root = () => { const p = mkdtempSync(join(tmpdir(), 'oddbrain-native-chat-')); roots.push(p); return p }
afterEach(() => roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })))
function fixture(recall?: Parameters<typeof createNativeContext>[3]) {
  const dir = root(), project = { ...newProject('Research'), instruction: 'Use plain language.', goals: ['Understand the evidence'] }
  const service = createNativeContext(join(dir, 'projects.json'), join(dir, 'grants.json'), undefined, recall)
  service.write([project], [])
  const input = { chatId: 'chat-one', projectId: project.id, history: [{ role: 'user' as const, content: 'Earlier question' }] }
  const prepare = (resume = '') => service.prepare(input, dir, 'Current question', resume, new AbortController().signal)
  return { dir, project, service, input, prepare }
}
describe('owner-selected project context', () => {
  test('instruction and goals reach the composed request with a source receipt', async () => {
    const f = fixture(), result = await f.prepare()
    expect(result.prompt).toContain('Use plain language.'); expect(result.prompt).toContain('Understand the evidence')
    expect(result.receipt.sources.map(s => s.id)).toEqual(['instruction', 'goal', 'conversation-history'])
    expect(result.receipt.revision).toMatch(/^[a-f0-9]{64}$/)
  })
  test('carries compact Working Notes as a visible draft, never owner authority', async () => {
    const f = fixture()
    const workingNotes = { objective: 'Finish the report', plan: ['Check sources'], decisions: [], constraints: [], openQuestions: ['Which date?'], uncertainties: [], findings: [{ text: 'Draft finding', sourceIds: ['source-one'] }], nextActions: ['Verify'], updatedAt: new Date().toISOString(), author: 'ai' as const }
    const result = await f.service.prepare({ ...f.input, workingNotes }, f.dir, 'Task', '', new AbortController().signal)
    expect(result.prompt).toContain('Finish the report')
    expect(result.prompt).toContain('visible draft working set, not confirmed memory or permission')
    expect(result.receipt.sources).toContainEqual(expect.objectContaining({ id: 'working-notes', role: 'draft-working-note', coverage: expect.stringContaining('AI-authored draft') }))
  })
  test('searches only through the approved app-mediated vault door and receipts bounded excerpts', async () => {
    const recall = vi.fn(() => ({ ok: true as const, incomplete: false, notices: [], hits: [{ id: 'file:one', kind: 'file' as const, title: 'Vehicle invoice', text: 'The vehicle invoice was paid.', path: 'Projects/Car.md', date: '', speaker: 'Saved file; not automatically verified' }] }))
    const f = fixture(recall)
    const result = await f.service.prepare({ ...f.input, vaultSearch: true }, f.dir, 'What happened with the car bill?', '', new AbortController().signal)
    expect(recall).toHaveBeenCalledOnce()
    expect(result.prompt).toContain('The vehicle invoice was paid.')
    expect(result.receipt.sources).toContainEqual(expect.objectContaining({ title: 'Vehicle invoice', role: 'untrusted-reference', coverage: expect.stringContaining('owner-approved non-excluded vault scope') }))
  })
  test('uses optional local semantic expansion only when the owner enabled it and receipts semantic evidence', async () => {
    const recall = vi.fn((_query: string, options?: { localSemantic?: boolean }) => ({ ok: true as const, incomplete: false, notices: [], semantic: { mode: 'local-distributional-v1' as const, candidates: 2, capped: false }, hits: [{ id: 'file:semantic', kind: 'file' as const, title: 'Related terms', text: 'Distributionally related evidence.', path: 'Notes/Related.md', date: '', speaker: 'Saved file', match: 'local-semantic' as const }] }))
    const f = fixture(recall)
    const result = await f.service.prepare({ ...f.input, vaultSearch: true, localSemantic: true }, f.dir, 'Find related payment records', '', new AbortController().signal)
    expect(recall).toHaveBeenCalledWith('find related payment records', { localSemantic: true })
    expect(result.receipt.retrieval).toMatchObject({ strategy: 'hybrid-lexical-local-distributional', localSemantic: 'local-distributional-v1', semanticMatches: 1 })
    expect(result.receipt.sources).toContainEqual(expect.objectContaining({ coverage: expect.stringContaining('local distributional semantic') }))
  })
  test('runs a bounded owner-sent second-pass search and receipts each exact query', async () => {
    const recall = vi.fn((query: string) => ({ ok: true as const, incomplete: false, notices: [], hits: [
      { id: `${query}:one`, kind: 'file' as const, title: `${query} first`, text: `${query} evidence one`, path: `Notes/${query}-1.md`, date: '', speaker: 'Saved file' },
      { id: `${query}:two`, kind: 'file' as const, title: `${query} second`, text: `${query} evidence two`, path: `Notes/${query}-2.md`, date: '', speaker: 'Saved file' },
      { id: `${query}:three`, kind: 'file' as const, title: `${query} third`, text: `${query} evidence three`, path: `Notes/${query}-3.md`, date: '', speaker: 'Saved file' },
    ] }))
    const f = fixture(recall), prompt = vaultFollowupDraft({ queries: ['launch notes', 'provider outage'], reason: 'Need exact dates', stage: { number: 2, total: 4, goal: 'Verify dates' } })
    const result = await f.service.prepare({ ...f.input, vaultSearch: true }, f.dir, prompt, '', new AbortController().signal)
    expect(recall.mock.calls.map(call => call[0])).toEqual(['launch notes', 'provider outage'])
    expect(result.receipt.retrieval).toEqual(expect.objectContaining({ mode: 'owner-confirmed-follow-up', queries: ['launch notes', 'provider outage'], excerptsFound: 4, excerptsIncluded: 4, stage: { number: 2, total: 4, goal: 'Verify dates', state: 'completed-bounded-stage' } }))
    expect(result.receipt.sources.filter(source => source.id.startsWith('vault:'))).toHaveLength(4)
  })
  test('a model-proposed follow-up cannot expand vault authority', async () => {
    const recall = vi.fn(() => ({ ok: true as const, incomplete: false, notices: [], hits: [] }))
    const f = fixture(recall), prompt = vaultFollowupDraft({ queries: ['private notes'], reason: '' })
    await expect(f.service.prepare(f.input, f.dir, prompt, '', new AbortController().signal)).rejects.toThrow(/not approved for this chat/)
    expect(recall).not.toHaveBeenCalled()
  })
  test('does not treat mentioning a folder as vault-search approval', async () => {
    const recall = vi.fn(() => ({ ok: true as const, incomplete: false, notices: [], hits: [] }))
    const f = fixture(recall)
    await f.service.prepare(f.input, f.dir, 'Search my vault folder', '', new AbortController().signal)
    expect(recall).not.toHaveBeenCalled()
  })
  test('applies an owner model capacity to native context and receipts every omission', async () => {
    const f = fixture()
    const history = [
      { id: 'u-old', role: 'user' as const, content: 'old question '.repeat(500) },
      { id: 'a-old', role: 'assistant' as const, content: 'old answer '.repeat(500) },
      { id: 'u-new', role: 'user' as const, content: 'recent question' },
      { id: 'a-new', role: 'assistant' as const, content: 'recent answer' },
    ]
    const result = await f.service.prepare({ ...f.input, history, contextProfile: { mode: 'manual', source: 'owner', capacityTokens: 2400, outputReserveTokens: 400 } }, f.dir, 'Current task', '', new AbortController().signal)
    expect(result.prompt).not.toContain('old question')
    expect(result.prompt).toContain('recent question')
    expect(result.receipt.modelContext).toMatchObject({ mode: 'manual', source: 'owner', capacityTokens: 2400, exact: false })
    expect(result.receipt.omitted?.map(item => item.id)).toEqual(['u-old', 'a-old'])
  })
  test('leaves an unknown Auto model uncapped', async () => {
    const f = fixture()
    const result = await f.service.prepare({ ...f.input, contextProfile: { mode: 'auto', source: 'unknown', capacityTokens: null, outputReserveTokens: 1024 } }, f.dir, 'Task', '', new AbortController().signal)
    expect(result.receipt.modelContext).toMatchObject({ source: 'unknown', capacityTokens: null })
    expect(result.receipt.omitted).toBeUndefined()
  })
  test('an unknown overflow retry removes one complete oldest group without inventing a capacity', async () => {
    const f = fixture()
    const history = [
      { id: 'u-old', role: 'user' as const, content: 'old question' },
      { id: 'a-old', role: 'assistant' as const, content: 'old answer' },
      { id: 'u-new', role: 'user' as const, content: 'recent question' },
      { id: 'a-new', role: 'assistant' as const, content: 'recent answer' },
    ]
    const profile = { mode: 'auto' as const, source: 'unknown' as const, capacityTokens: null, outputReserveTokens: 1024 }
    const result = await f.service.prepare({ ...f.input, history, contextProfile: profile }, f.dir, 'Task', '', new AbortController().signal, true)
    expect(result.prompt).not.toContain('old question')
    expect(result.prompt).toContain('recent question')
    expect(result.receipt.modelContext?.capacityTokens).toBeNull()
    expect(result.receipt.omitted).toEqual([
      { id: 'u-old', title: 'Stored user message', reason: 'provider-overflow' },
      { id: 'a-old', title: 'Stored assistant message', reason: 'provider-overflow' },
    ])
  })
  test('fresh sessions receive copied history; resumed ones do not repeat it', async () => {
    const f = fixture()
    expect((await f.prepare()).receipt.historyMessages).toBe(1)
    const resumed = await f.prepare('native-one')
    expect(resumed.receipt.historyMessages).toBe(0); expect(resumed.prompt).not.toContain('Earlier question')
  })
  test('a missing expected resume link refuses rather than silently starting fresh', async () => {
    const f = fixture()
    await expect(f.service.prepare({ ...f.input, continuationExpected: true }, f.dir, 'Task', '', new AbortController().signal)).rejects.toThrow(/resume link is missing/)
  })
  test('a reference path in project JSON is not permission to read it', async () => {
    const f = fixture(), file = join(f.dir, 'private.txt'); writeFileSync(file, 'PRIVATE ORIGINAL')
    f.service.write([{ ...f.project, references: [{ id: 'reference-one', path: file, label: 'private.txt', addedAt: new Date().toISOString(), includeInContext: true }] }])
    await expect(f.prepare()).rejects.toThrow(/Add reference/)
    expect(readFileSync(file, 'utf8')).toBe('PRIVATE ORIGINAL')
  })
  test('picker authorization alone does not include a reference', async () => {
    const f = fixture(), file = join(f.dir, 'source.txt'); writeFileSync(file, 'UNIQUE REFERENCE')
    f.service.attach(f.project.id, [file])
    const result = await f.prepare(); expect(result.prompt).not.toContain('UNIQUE REFERENCE')
    expect(result.receipt.sources.some(s => s.id.startsWith('reference:'))).toBe(false)
  })
  test('authorized and selected text is sent completely, with digest and coverage', async () => {
    const f = fixture(), file = join(f.dir, 'source.txt'); writeFileSync(file, 'বাংলা reference\nEND')
    f.service.attach(f.project.id, [file]); const projects = f.service.projects()
    f.service.write(projects.map(p => ({ ...p, references: p.references.map(r => ({ ...r, includeInContext: true })) })), projects)
    const result = await f.prepare()
    expect(result.prompt).toContain('বাংলা reference\\nEND')
    expect(result.receipt.sources.at(-1)).toMatchObject({ chars: 'বাংলা reference\nEND'.length, coverage: expect.stringContaining('Complete UTF-8 text'), digest: expect.stringMatching(/^[a-f0-9]{64}$/) })
  })
  test('a grant is project-bound, not portable to a sibling project', async () => {
    const f = fixture(), file = join(f.dir, 'source.txt'); writeFileSync(file, 'PRIVATE')
    const refs = f.service.attach(f.project.id, [file]), other = { ...newProject('Other'), references: refs.map(r => ({ ...r, includeInContext: true })) }
    f.service.write([...f.service.projects(), other])
    await expect(f.service.prepare({ chatId: 'other-chat', projectId: other.id }, f.dir, 'Task', '', new AbortController().signal)).rejects.toThrow(/Add reference/)
  })
  test('changed context invalidates an already-prepared dispatch', async () => {
    const f = fixture(), prepared = await f.prepare()
    f.service.write([{ ...f.project, instruction: 'New instruction' }])
    expect(() => prepared.validate()).toThrow(/changed/)
  })
  test('explicit empty override clears inherited goals, not project originals', async () => {
    const f = fixture()
    const result = await f.service.prepare({ ...f.input, overrides: { goal: '', style: 'Use a table' } }, f.dir, 'Task', '', new AbortController().signal)
    expect(result.prompt).not.toContain('Understand the evidence'); expect(result.prompt).toContain('Use a table')
    expect(f.service.projects()[0].goals).toEqual(['Understand the evidence'])
  })
  test('workspace preference and workspace authorization are separate', () => {
    const f = fixture(), other = root()
    expect(f.service.workspace({ ...f.input, overrides: { workspace: other } }, f.dir)).toBe(other)
    expect(f.service.workspaceGranted(f.input.chatId, other)).toBe(false)
    f.service.grantWorkspace(f.input.chatId, other)
    expect(f.service.workspaceGranted(f.input.chatId, other)).toBe(true)
    expect(f.service.workspaceGranted('different-chat', other)).toBe(false)
  })
  test('oversized reference refuses the entire send without clipping', async () => {
    const f = fixture(), file = join(f.dir, 'big.txt'); writeFileSync(file, 'x'.repeat(24_001))
    f.service.attach(f.project.id, [file]); const list = f.service.projects()
    f.service.write(list.map(p => ({ ...p, references: p.references.map(r => ({ ...r, includeInContext: true })) })))
    await expect(f.prepare()).rejects.toThrow(/Nothing was clipped/)
    expect(readFileSync(file)).toHaveLength(24_001)
  })
  test('stale project edits and corrupt storage never replace originals', () => {
    const f = fixture(), stale = f.service.projects()
    f.service.write([{ ...f.project, name: 'Changed' }], stale)
    expect(() => f.service.write(stale, stale)).toThrow(/another view/)
    const file = join(f.dir, 'projects.json'); writeFileSync(file, '{broken')
    expect(() => f.service.write([])).toThrow(); expect(readFileSync(file, 'utf8')).toBe('{broken')
  })
  test('long saved instructions are refused, never normalized down silently', () => {
    const f = fixture(), original = readFileSync(join(f.dir, 'projects.json'))
    expect(() => f.service.write([{ ...f.project, instruction: 'x'.repeat(4001) }])).toThrow(/shortened/)
    expect(readFileSync(join(f.dir, 'projects.json'))).toEqual(original)
  })
  test('cancellation after preparation still prevents dispatch', async () => {
    const f = fixture(), controller = new AbortController()
    const result = await f.service.prepare(f.input, f.dir, 'Task', '', controller.signal)
    controller.abort(); expect(() => result.validate()).toThrow(/canceled/)
  })
})
describe('native conversation routing and archive association', () => {
  test('different chats in one folder never reuse a native child or ID', () => {
    const memory = createSessionMemory(join(root(), 'sessions.json')), launches: string[][] = [], children: any[] = []
    const spawn = (_command: string, args: string[]) => {
      launches.push(args)
      const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { write: () => true }, exitCode: null, signalCode: null, killed: false, kill() { this.killed = true; this.emit('close', 0) } })
      children.push(child); return child
    }
    const socket = createEngineSocket(memory), base = { cwd: '/shared', settings: DEFAULT_ENGINE, spawnProcess: spawn as never, onEvent: () => {} }
    expect(socket.send('A', { ...base, chatId: 'chat-a' }).ok).toBe(true)
    children[0].stdout.emit('data', Buffer.from(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'native-a' }) + '\n' + JSON.stringify({ type: 'result', subtype: 'success', result: 'answer' }) + '\n'))
    expect(memory.load(sessionKey(DEFAULT_ENGINE.id, '/shared', 'chat-a'))).toBe('native-a')
    expect(socket.send('B', { ...base, chatId: 'chat-b' }).ok).toBe(true)
    expect(launches[1]).not.toContain('--resume'); expect(children[0].killed).toBe(true)
    children[1].stdout.emit('data', Buffer.from(JSON.stringify({ type: 'result', subtype: 'success', result: 'B answer' }) + '\n'))
    expect(socket.send('A again', { ...base, chatId: 'chat-a' }).ok).toBe(true)
    expect(launches[2].slice(-2)).toEqual(['--resume', 'native-a'])
    expect(memory.list()[0]).toMatchObject({ chatId: 'chat-a', sessionId: 'native-a', workspace: '/shared' })
    socket.fresh(); expect(memory.load(sessionKey('claude-code', '/shared', 'chat-a'))).toBe('')
  })
  test('new namespaced keys cannot collide with legacy paths or sibling engines', () => {
    const keys = [sessionKey('claude-code', '/one::two', 'a'), sessionKey('claude-code', '/one', 'two::a'), sessionKey('agy', '/one::two', 'a'), sessionKey('claude-code', '/one::two')]
    expect(new Set(keys).size).toBe(4)
  })
  test('full archive stores both the sent context and original user request, associated with the chat', () => {
    const archive = createTurnArchive(root()), receive = vi.fn()
    const receipt = { projectId: null, revision: 'a'.repeat(64), workspace: '/folder', sources: [], historyMessages: 0, characters: 50 }
    dispatchRecordedTurn(archive, { chatId: 'chat-a', prompt: 'CONTEXT\nTask', userPrompt: 'Task', context: receipt, engine: 'claude-code', model: '', workspace: '/folder', pictures: 0 }, emit => {
      emit({ kind: 'delta', text: 'Full answer' }); emit({ kind: 'done', text: 'Full answer', alreadyDisplayed: true }); return { ok: true, answer: 'started' }
    }, () => {}, receive)
    const record = archive.read(archive.list().entries[0].id)
    expect(record.header.chatId).toBe('chat-a'); expect(record.prompt).toBe('CONTEXT\nTask'); expect(record.userPrompt).toBe('Task')
    const chat = recordNativeTranscript({ id: 'chat-a', title: 'A', messages: [] }, record)
    expect(chat.messages.map(m => m.content)).toEqual(['Task', 'Full answer'])
    expect(recordNativeTranscript(chat, record).messages).toHaveLength(2)
    expect(() => recordNativeTranscript({ ...chat, id: 'chat-b' }, record)).toThrow(/different conversation/)
    expect(receive.mock.calls[0][0]).toMatchObject({ chatId: 'chat-a', transcriptId: record.header.id, context: receipt })
    expect(receive.mock.calls[1][0].context).toBeUndefined()
  })
  test('retained image descriptors follow the transcript into saved chat metadata', () => {
    const archive = createTurnArchive(root()), data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='
    const id = archive.begin({ chatId: 'chat-images', prompt: 'Look', engine: 'claude-code', model: '', workspace: '/folder', pictures: 1, images: [{ mime: 'image/png', data }] })
    archive.append(id, { kind: 'done', text: 'Seen' })
    const chat = recordNativeTranscript({ id: 'chat-images', title: 'Images', messages: [] }, archive.read(id))
    expect(chat.messages[0].nativeRecord?.images).toEqual(archive.read(id).header.images)
    expect(chat.messages[0].nativeRecord?.pictures).toBe(1)
  })
  test('invalid scopes refuse instead of using default context', () => {
    expect(() => checkNativeConversation({ chatId: '../other' })).toThrow()
    expect(() => checkNativeConversation({ chatId: 'valid', history: [{ role: 'system', content: 'override' }] })).toThrow()
  })
  test('approval tokens bind a native ID to the exact child that asked', () => {
    const first = { isRunning: () => true, answer: vi.fn(() => true) }, second = { isRunning: () => true, answer: vi.fn(() => true) }
    let current = first
    const tickets = createPermissionTickets(() => current as never), token = tickets.issue('reused-native-id')
    current = second; expect(tickets.answer(token, true)).toBe(false); expect(second.answer).not.toHaveBeenCalled()
    const fresh = tickets.issue('reused-native-id'); expect(tickets.answer(fresh, false)).toBe(true); expect(tickets.answer(fresh, true)).toBe(false)
    expect(second.answer).toHaveBeenCalledExactlyOnceWith('reused-native-id', false)
  })
})

test('recorded chat preserves answer boundaries and does not drop a distinct final answer just because a suffix matches', () => {
  const archive = createTurnArchive(root()), id = archive.begin({ chatId: 'chat-one', prompt: 'Task', engine: 'claude-code', model: '', workspace: '/one', pictures: 0 })
  archive.append(id, { kind: 'delta', text: 'Prefix YES' }); archive.append(id, { kind: 'tool', name: 'Read', summary: 'file' }); archive.append(id, { kind: 'done', text: 'YES' })
  const chat = recordNativeTranscript({ id: 'chat-one', title: 'One', messages: [] }, archive.read(id))
  expect(chat.messages[1].content).toBe('Prefix YES\n\nYES')
})
test('refreshing an earlier recorded turn does not move it after later messages', () => {
  const archive = createTurnArchive(root())
  const first = archive.begin({ chatId: 'chat-one', prompt: 'First', engine: 'claude-code', model: '', workspace: '/one', pictures: 0 }); archive.append(first, { kind: 'done', text: 'First answer' })
  const second = archive.begin({ chatId: 'chat-one', prompt: 'Second', engine: 'claude-code', model: '', workspace: '/one', pictures: 0 }); archive.append(second, { kind: 'done', text: 'Second answer' })
  let chat = recordNativeTranscript({ id: 'chat-one', title: 'One', messages: [] }, archive.read(first))
  chat = recordNativeTranscript(chat, archive.read(second)); chat = recordNativeTranscript(chat, archive.read(first))
  expect(chat.messages.map(m => m.content)).toEqual(['First', 'First answer', 'Second', 'Second answer'])
})
test('damaged optional native metadata cannot become a complete transcript', () => {
  const dir = root(), archive = createTurnArchive(dir), id = archive.begin({ chatId: 'chat-one', prompt: 'Task', engine: 'claude-code', model: '', workspace: '/one', pictures: 0 })
  archive.append(id, { kind: 'done', text: 'Answer' })
  const file = join(dir, id + '.ndjson'), bytes = readFileSync(file, 'utf8').replace('"kind":"done"', '"artifacts":{"not":"a list"},"kind":"done"')
  writeFileSync(file, bytes)
  expect(archive.read(id).state).toBe('interrupted'); expect(archive.raw(id).content).toBe(bytes)
})
