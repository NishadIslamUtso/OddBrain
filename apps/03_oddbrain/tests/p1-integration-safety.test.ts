import { afterEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionMemory } from '../src/main/engine/sessionMemory'
import { createCheckpointReviewGate } from '../src/main/engine/checkpointReviewGate'
import { takeCheckpoint } from '../src/main/engine/checkpoints'
import { createEngineParser, EngineReadError } from '../src/main/engine/stream'
import { startClaudeCodeSession } from '../src/main/engine/claudeCode'
import { engineCommandRefusal } from '../src/shared/lib/engineCommandPolicy'
import { DEFAULT_ENGINE, type EngineEvent } from '../src/shared/lib/engine'
import { readAuthStatus } from '../src/main/engine/authStatus'

const roots: string[] = []
function directory() { const root = mkdtempSync(join(tmpdir(), 'oddbrain-p1-')); roots.push(root); return root }
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
const wire = (value: unknown) => JSON.stringify(value) + '\n'
function engine() {
  const events: EngineEvent[] = [], sent: string[] = []
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { write: (text: string) => { sent.push(text); return true } }),
    exitCode: null as number | null, signalCode: null, killed: false,
    kill() { this.killed = true; this.emit('close', null); return true },
  })
  const session = startClaudeCodeSession({ cwd: '.', settings: DEFAULT_ENGINE, onEvent: event => events.push(event), spawnProcess: (() => child) as never })
  const emit = (value: unknown) => child.stdout.emit('data', Buffer.from(wire(value)))
  const permission = () => emit({ type: 'control_request', request_id: 'permission-1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'pwd' } } })
  return { child, session, events, sent, emit, permission }
}

describe('retained native identities', () => {
  test('preserves full IDs and older rows rather than a twenty-entry window', () => {
    const memory = createSessionMemory(join(directory(), 'sessions.json'))
    for (let i = 0; i < 25; i++) memory.save(`claude-code::/workspace/${i}`, 'session-' + String(i).padStart(90, '0'))
    expect(memory.list('claude-code')).toHaveLength(25)
    expect(memory.load('claude-code::/workspace/0')).toHaveLength(98)
  })
  test('keeps engine namespaces distinct and retains unassigned legacy entries', () => {
    const file = join(directory(), 'sessions.json'); writeFileSync(file, JSON.stringify({ '/old': 'legacy-id' }))
    const memory = createSessionMemory(file)
    memory.save('agy::/বাংলা', 'agy-id'); memory.save('claude-code::/বাংলা', 'claude-id')
    expect(memory.list('agy').map(row => row.sessionId)).toEqual(['agy-id'])
    expect(JSON.parse(readFileSync(file, 'utf8'))['/old']).toBe('legacy-id')
    memory.save('agy::/বাংলা', '')
    expect(memory.load('claude-code::/বাংলা')).toBe('claude-id')
  })
  test('damaged indexes refuse reads and writes without replacement', () => {
    const file = join(directory(), 'sessions.json'); writeFileSync(file, '{broken')
    const memory = createSessionMemory(file)
    expect(() => memory.load('agy::/one')).toThrow()
    expect(() => memory.save('agy::/one', 'new')).toThrow()
    expect(readFileSync(file, 'utf8')).toBe('{broken')
  })
  test('invalid identities do not evict valid data', () => {
    const file = join(directory(), 'sessions.json'), memory = createSessionMemory(file)
    memory.save('agy::/one', 'valid-id'); const before = readFileSync(file)
    expect(() => memory.save('agy::/one', 'bad\nidentity')).toThrow()
    expect(() => memory.save('agy::/one', 'a'.repeat(1025))).toThrow()
    expect(readFileSync(file)).toEqual(before)
  })
  test('linked session files are refused', () => {
    const root = directory(), target = directory(), original = join(target, 'sessions.json'), linked = join(root, 'linked'), file = join(linked, 'sessions.json')
    writeFileSync(original, '{}'); symlinkSync(target, linked, 'junction')
    expect(() => createSessionMemory(file).save('agy::/one', 'new')).toThrow(/symlink/)
    expect(readFileSync(original, 'utf8')).toBe('{}')
  })
})

describe('Claude lifecycle and approval acknowledgement', () => {
  test('unknown result status is an error and the process is not reused', () => {
    const e = engine(); expect(e.session.send('task')).toBe(true)
    e.emit({ type: 'result', subtype: 'future-status', result: 'partial answer' })
    expect(e.events.some(event => event.kind === 'done')).toBe(false)
    expect(e.events.some(event => event.kind === 'error')).toBe(true)
    expect(e.child.killed).toBe(true); expect(e.session.send('next')).toBe(false)
  })
  test('preserves complete preceding events when a later line is malformed', () => {
    const e = engine(); e.session.send('task')
    e.child.stdout.emit('data', Buffer.from(wire({ type: 'assistant', message: { content: [{ type: 'text', text: 'retained prefix' }] } }) + '{broken\n'))
    expect(e.events).toContainEqual({ kind: 'text', text: 'retained prefix' })
    expect(e.events.some(event => event.kind === 'error')).toBe(true)
    expect(e.session.send('next')).toBe(false)
  })
  test('unbounded trailing output explicitly refuses without dropping preceding records', () => {
    const parser = createEngineParser()
    try {
      parser.feed(wire({ type: 'system', subtype: 'init', session_id: 'retained-id' }) + 'x'.repeat(8_000_001))
      expect.unreachable('Expected a bounded-output refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(EngineReadError)
      expect((error as EngineReadError).prefix).toContainEqual({ kind: 'session', id: 'retained-id' })
    }
  })
  test('approvals outside a dispatched task are refused', () => {
    const e = engine(); e.permission()
    expect(e.session.answer('permission-1', true)).toBe(false)
    expect(e.sent).toEqual([]); expect(e.child.killed).toBe(true)
  })
  test('duplicate answered requests fail closed instead of producing a second card', () => {
    const e = engine(); e.session.send('task'); e.permission()
    expect(e.session.answer('permission-1', false)).toBe(true); e.permission()
    expect(e.events.filter(event => event.kind === 'permission')).toHaveLength(1)
    expect(e.session.answer('permission-1', true)).toBe(false)
    expect(e.sent.filter(line => line.includes('control_response'))).toHaveLength(1)
  })
  test('a synchronous permission write failure returns false, not an approval', () => {
    const e = engine(); e.session.send('task'); e.permission()
    e.child.stdin.write = () => { throw Error('closed pipe') }
    expect(e.session.answer('permission-1', true)).toBe(false)
    expect(e.events.some(event => event.kind === 'error')).toBe(true)
    expect(e.child.killed).toBe(true)
  })
  test('stop invalidates the outstanding approval', () => {
    const e = engine(); e.session.send('task'); e.permission(); e.session.stop()
    expect(e.session.answer('permission-1', true)).toBe(false)
    expect(e.sent.filter(line => line.includes('control_response'))).toHaveLength(0)
  })
  test('early close reports uncertainty without disclosing stderr', () => {
    const e = engine(); e.session.send('task'); e.child.stderr.emit('data', Buffer.from('secret-token'))
    e.child.emit('close', 1)
    expect(e.events.some(event => event.kind === 'error')).toBe(true)
    expect(JSON.stringify(e.events)).not.toContain('secret-token')
  })
  test('native slash commands are not model tasks; prose mentioning them is allowed', () => {
    const e = engine(); expect(e.session.send('/mcp')).toBe(false)
    expect(e.sent).toEqual([]); expect(engineCommandRefusal('Explain /mcp')).toBeNull()
    expect(e.session.send('Explain /mcp')).toBe(true); e.session.stop()
  })
  test('read-only auth refuses Windows shell shims before invoking a runner', async () => {
    const runner = vi.fn()
    expect((await readAuthStatus('claude-code', { command: 'C:\\App\\claude.cmd', runner })).ok).toBe(false)
    expect(runner).not.toHaveBeenCalled()
  })
})

describe('sender-scoped reviewed checkpoint restoration', () => {
  async function fixture() {
    const root = directory(), file = join(root, 'draft.txt'), copies = join(root, 'copies')
    writeFileSync(file, 'original')
    const checkpoint = await takeCheckpoint(copies, file)
    writeFileSync(file, 'edited')
    return { file, copies, copy: checkpoint!.copy }
  }
  test('a review token from another owner is refused', async () => {
    const f = await fixture(), owner = createCheckpointReviewGate(f.copies, () => 'scope'), other = createCheckpointReviewGate(f.copies, () => 'scope')
    const review = await owner.preview(f.copy, f.file)
    expect(other.decide(review.token, 'allow').ok).toBe(false)
    expect(readFileSync(f.file, 'utf8')).toBe('edited')
    expect(owner.decide(review.token, 'deny').ok).toBe(true)
  })
  test('revoked authority consumes the token without changing the file', async () => {
    const f = await fixture(); let scope = 'first'
    const gate = createCheckpointReviewGate(f.copies, () => scope), review = await gate.preview(f.copy, f.file)
    scope = 'second'; expect(gate.decide(review.token, 'allow').ok).toBe(false)
    scope = 'first'; expect(gate.decide(review.token, 'allow').ok).toBe(false)
    expect(readFileSync(f.file, 'utf8')).toBe('edited')
  })
  test('a policy change during asynchronous preview refuses that review', async () => {
    const f = await fixture(); let scope = 'first'
    const gate = createCheckpointReviewGate(f.copies, () => scope), pending = gate.preview(f.copy, f.file)
    scope = 'second'; await expect(pending).rejects.toThrow(/changed/)
    expect(readFileSync(f.file, 'utf8')).toBe('edited')
  })
  test('allow applies only once and retains displaced content for recovery', async () => {
    const f = await fixture(), gate = createCheckpointReviewGate(f.copies, () => 'scope'), review = await gate.preview(f.copy, f.file)
    const result = gate.decide(review.token, 'allow')
    expect(result.ok).toBe(true); expect(readFileSync(f.file, 'utf8')).toBe('original')
    expect(readFileSync(result.recoveryPath!, 'utf8')).toBe('edited')
    expect(gate.decide(review.token, 'allow').ok).toBe(false)
  })
  test('post-preview edits are left untouched', async () => {
    const f = await fixture(), gate = createCheckpointReviewGate(f.copies, () => 'scope'), review = await gate.preview(f.copy, f.file)
    writeFileSync(f.file, 'new owner edit')
    expect(gate.decide(review.token, 'allow').ok).toBe(false)
    expect(readFileSync(f.file, 'utf8')).toBe('new owner edit')
  })
})

describe('session board persistence', () => {
  test('retains full native IDs and history beyond the previous forty-card window', async () => {
    const { createSessionBoardStore } = await import('../src/main/engine/sessionBoardStore')
    const file = join(directory(), 'board.json'), store = createSessionBoardStore(file)
    const board = { continuing: {}, done: Array.from({ length: 60 }, (_, i) => ({ workspace: `/folder/${i}`, sessionId: 'id-' + 'x'.repeat(300) + i, endedAt: 'today' })) }
    store.save(board, store.read())
    expect(store.read()).toEqual(board)
  })
  test('a stale view cannot replace newer linked files', async () => {
    const { createSessionBoardStore } = await import('../src/main/engine/sessionBoardStore')
    const file = join(directory(), 'board.json'), store = createSessionBoardStore(file), old = store.read()
    const next = { continuing: { '/one': { files: ['/one/a.txt'] } }, done: [] }
    store.save(next, old)
    expect(() => store.save({ continuing: {}, done: [] }, old)).toThrow(/another view/)
    expect(store.read()).toEqual(next)
  })
  test('damaged board is not treated as empty and cannot be overwritten', async () => {
    const { createSessionBoardStore } = await import('../src/main/engine/sessionBoardStore')
    const file = join(directory(), 'board.json'); writeFileSync(file, '{broken')
    const store = createSessionBoardStore(file), empty = { continuing: {}, done: [] }
    expect(() => store.read()).toThrow(); expect(() => store.save(empty, empty)).toThrow()
    expect(readFileSync(file, 'utf8')).toBe('{broken')
  })
  test('a second completed thread in one folder preserves both original IDs', async () => {
    const { markDone, normalizeBoard } = await import('../src/shared/lib/sessionsBoard')
    const first = markDone({ continuing: {}, done: [] }, '/one', 'first', 'today')
    const next = markDone(first, '/one', 'second', 'today')
    expect(normalizeBoard(next).done.map(card => card.sessionId)).toEqual(['second', 'first'])
  })
})
