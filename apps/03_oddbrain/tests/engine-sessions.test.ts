import { EventEmitter } from 'node:events'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createEngineParser } from '../src/main/engine/stream'
import { engineArguments, startClaudeCodeSession } from '../src/main/engine/claudeCode'
import { createEngineSocket } from '../src/main/engine/socket'
import { DEFAULT_ENGINE, type EngineEvent } from '../src/shared/lib/engine'

/**
 * Sessions, usage and approval details — the wire's honest extras.
 *
 * A session id means a conversation survives an app restart (the engine's own
 * `--resume`). Usage means the card can say what a turn really cost. A
 * permission detail means the owner sees the before/after before allowing an
 * edit. Each of these was a promise made in the architecture doc; these tests
 * are where the promise is kept.
 */

/** The same fake child the main engine tests use: pipes without a process. */
function fakeEngine() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    stdin: { write(data: string): boolean }
    killed: boolean
    exitCode: number | null
    signalCode: null
    kill(): void
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  const written: string[] = []
  child.stdin = { write: (data) => (written.push(data), true) }
  child.killed = false
  child.exitCode = null
  child.signalCode = null
  child.kill = function kill() {
    this.killed = true
    this.emit('close', 0)
  }
  return { child, written }
}

function recorder() {
  const events: EngineEvent[] = []
  return {
    events,
    on: (event: EngineEvent) => events.push(event),
    last(kind: EngineEvent['kind']): EngineEvent {
      const found = events.filter((event) => event.kind === kind).at(-1)
      assert.ok(found, `expected a ${kind} event, got: ${JSON.stringify(events)}`)
      return found
    },
  }
}

test('the wire: an init with a session id opens a resumable session', () => {
  const parser = createEngineParser()
  const events = parser.feed(
    `${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-123', model: 'gemma4:cloud' })}\n`,
  )
  assert.deepEqual(events, [
    { kind: 'session', id: 's-123' },
    { kind: 'status', text: 'engine ready' },
  ])
  // No id — no session event, exactly as before.
  const plain = createEngineParser()
  assert.deepEqual(plain.feed(`${JSON.stringify({ type: 'system', subtype: 'init' })}\n`), [
    { kind: 'status', text: 'engine ready' },
  ])
})

test('the wire: an Edit permission carries the before/after, clipped to a decision size', () => {
  const parser = createEngineParser()
  const huge = 'x'.repeat(3000)
  const events = parser.feed(
    `${JSON.stringify({
      type: 'control_request',
      request_id: 'req-8',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Edit',
        input: { file_path: '/a.txt', old_string: 'old text', new_string: huge },
      },
    })}\n`,
  )
  const card = events[0] as Extract<EngineEvent, { kind: 'permission' }>
  assert.match(card.detail ?? '', /--- before ---/)
  assert.match(card.detail ?? '', /--- after ---/)
  assert.match(card.detail ?? '', /old text/)
  assert.ok((card.detail ?? '').length < 1400, 'the detail is clipped, not a log dump')
  assert.match(card.detail ?? '', /more characters/)
})

test('the wire: a result carries what the turn honestly cost', () => {
  const parser = createEngineParser()
  const events = parser.feed(
    `${JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'done',
      usage: { input_tokens: 1234, output_tokens: 567 },
      duration_ms: 4200,
      total_cost_usd: 0.0031,
    })}\n`,
  )
  assert.deepEqual(events, [
    {
      kind: 'done',
      text: 'done',
      usage: { inTokens: 1234, outTokens: 567, durationMs: 4200, costUsd: 0.0031 },
    },
  ])
  // A result without usage stays shaped exactly as before.
  const plain = createEngineParser()
  assert.deepEqual(plain.feed(`${JSON.stringify({ type: 'result', subtype: 'success', result: 'ok' })}\n`), [
    { kind: 'done', text: 'ok' },
  ])
})

test('the launch line: a resume id continues the engine session', () => {
  const args = engineArguments('gemma4:cloud', 'ask', 's-123')
  assert.deepEqual(args.slice(-2), ['--resume', 's-123'])
  assert.equal(engineArguments('gemma4:cloud').includes('--resume'), false)
})

test('the adapter: a session input puts the resume id on the launch line', () => {
  const fake = fakeEngine()
  const captured: string[] = []
  const session = startClaudeCodeSession({
    cwd: '.',
    settings: DEFAULT_ENGINE,
    resumeId: 's-77',
    onEvent: () => undefined,
    spawnProcess: ((_command: string, args: string[]) => {
      captured.push(...args)
      return fake.child
    }) as unknown as typeof import('node:child_process').spawn,
  })
  assert.deepEqual(captured.slice(-2), ['--resume', 's-77'])
  session.stop()
})

test('the socket remembers sessions per workspace, so a closed app does not lose the thread', () => {
  const saved: Record<string, string> = {}
  const memory = {
    load: (cwd: string): string => saved[cwd] ?? '',
    save: (cwd: string, id: string): void => {
      saved[cwd] = id
    },
  }

  // Task one: a fresh start. The engine announces its session; the memory keeps it.
  const fakeOne = fakeEngine()
  const recOne = recorder()
  const captured: string[] = []
  const spawnOne = ((_command: string, args: string[]) => {
    captured.push(...args)
    return fakeOne.child
  }) as unknown as typeof import('node:child_process').spawn
  const socket = createEngineSocket(memory)
  socket.send('first task', { cwd: 'C:\\work', settings: DEFAULT_ENGINE, onEvent: recOne.on, spawnProcess: spawnOne })
  const initLine = `${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-42' })}\n`
  fakeOne.child.stdout.emit('data', Buffer.from(initLine, 'utf8'))
  assert.equal(saved['claude-code::C:\\work'], 's-42', 'the session id is remembered per engine AND workspace')

  // The app "restarts": the engine process closes, a new socket is built,
  // and the memory is all that survives.
  fakeOne.child.kill()
  const fakeTwo = fakeEngine()
  const recTwo = recorder()
  const spawnTwo = ((_command: string, args: string[]) => {
    captured.push(...args)
    return fakeTwo.child
  }) as unknown as typeof import('node:child_process').spawn
  const socketTwo = createEngineSocket(memory)
  socketTwo.send('second task', {
    cwd: 'C:\\work',
    settings: DEFAULT_ENGINE,
    onEvent: recTwo.on,
    spawnProcess: spawnTwo,
  })
  assert.deepEqual(captured.slice(-2), ['--resume', 's-42'], 'the new launch continues the old conversation')
})

test('the socket: a living engine is continued in place, never resumed from file', () => {
  const memory = { load: (): string => 'stale-id', save: () => undefined }
  const fake = fakeEngine()
  const rec = recorder()
  const captured: string[] = []
  const spawn = ((_command: string, args: string[]) => {
    captured.push(...args)
    return fake.child
  }) as unknown as typeof import('node:child_process').spawn
  const socket = createEngineSocket(memory)
  const input = { cwd: '.', settings: DEFAULT_ENGINE, onEvent: rec.on, spawnProcess: spawn }
  socket.send('first', input)
  fake.child.stdout.emit(
    'data',
    Buffer.from(`${JSON.stringify({ type: 'result', subtype: 'success', result: 'ok' })}\n`, 'utf8'),
  )
  captured.length = 0
  socket.send('second', input)
  assert.equal(captured.length, 0, 'no relaunch happened at all')
})

test('the socket: a changed gear relaunches the living engine — the flags must match the UI', () => {
  const memory = { load: (): string => '', save: () => undefined }
  const fakeOne = fakeEngine()
  const fakeTwo = fakeEngine()
  const rec = recorder()
  const launches: string[][] = []
  const spawn = ((_command: string, args: string[]) => {
    launches.push(args)
    return launches.length === 1 ? fakeOne.child : fakeTwo.child
  }) as unknown as typeof import('node:child_process').spawn
  const socket = createEngineSocket(memory)
  socket.send('first', { cwd: '.', settings: DEFAULT_ENGINE, onEvent: rec.on, spawnProcess: spawn })
  fakeOne.child.stdout.emit(
    'data',
    Buffer.from(`${JSON.stringify({ type: 'result', subtype: 'success', result: 'ok' })}\n`, 'utf8'),
  )
  // Same folder, same engine — but the approval gear changed. The launch
  // flags fix the gear for the life of the process, so reuse would silently
  // run under the OLD permission mode while the UI shows the new one.
  const regear = { ...DEFAULT_ENGINE, approval: 'full' as const }
  const answer = socket.send('second', { cwd: '.', settings: regear, onEvent: rec.on, spawnProcess: spawn })
  assert.equal(answer.ok, true, answer.answer)
  assert.equal(launches.length, 2, 'the gear change forced an honest relaunch')
  assert.match(launches[1].join(' '), /--permission-mode bypassPermissions/, 'the new gear is on the launch line')
  // And the OLD process is gone, not left running underneath.
  assert.equal(fakeOne.child.killed, true, 'the stale process was set aside')
})

test('the socket: the resume memory is keyed per engine, never shared', () => {
  const saved: Record<string, string> = {}
  const memory = { load: (k: string): string => saved[k] ?? '', save: (k: string, id: string): void => { saved[k] = id } }
  const fake = fakeEngine()
  const rec = recorder()
  const spawn = (() => fake.child) as unknown as typeof import('node:child_process').spawn
  const socket = createEngineSocket(memory)
  socket.send('claude task', { cwd: 'C:\\work', settings: DEFAULT_ENGINE, onEvent: rec.on, spawnProcess: spawn })
  fake.child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-cl' })}\n`, 'utf8'))
  assert.ok(saved['claude-code::C:\\work'], 'claude-code has its own key')
  assert.equal(Object.keys(saved).some(k => !k.startsWith('claude-code::')), false, 'no plain-workspace key exists to hand another engine')
})

test('the socket: agy refusing pictures is a REFUSAL, not a start', async () => {
  const { AGY_PICTURES_ANSWER } = await import('../src/main/engine/agy')
  const memory = { load: (): string => '', save: () => undefined }
  const fake = fakeEngine()
  const rec = recorder()
  const spawn = (() => fake.child) as unknown as typeof import('node:child_process').spawn
  const socket = createEngineSocket(memory)
  const answer = socket.send(
    'look at this',
    {
      cwd: '.',
      settings: { ...DEFAULT_ENGINE, id: 'agy' },
      onEvent: rec.on,
      spawnProcess: spawn,
      images: [{ mime: 'image/png', data: 'aGk=' }],
    },
  )
  assert.equal(answer.ok, false, 'nothing was sent, so nothing started')
  assert.equal(answer.answer, AGY_PICTURES_ANSWER, 'the honest reason is what the person sees')
})


test('failed fresh-session removal blocks dispatch and retries the same identity', () => {
  const fake = fakeEngine(), writes: string[] = []; let fail = true
  const socket = createEngineSocket({ load: () => 'old-native-id', save: (key) => { writes.push(key); if (fail) throw Error('disk unavailable') } })
  const input = { cwd: '/work', settings: DEFAULT_ENGINE, onEvent: () => {}, spawnProcess: (() => fake.child) as never }
  assert.equal(socket.send('first', input).ok, true)
  assert.throws(() => socket.fresh(), /disk unavailable/)
  assert.equal(socket.send('must not silently resume', input).ok, false)
  fail = false; socket.fresh()
  assert.deepEqual(writes, ['claude-code::/work', 'claude-code::/work'])
})

test('a failed new session-ID save keeps the full observed ID and stops instead of silently losing continuity', () => {
  const fake = fakeEngine(), rec = recorder()
  const socket = createEngineSocket({ load: () => '', save: () => { throw Error('read-only index') } })
  assert.equal(socket.send('Task', { cwd: '/work', settings: DEFAULT_ENGINE, onEvent: rec.on, spawnProcess: (() => fake.child) as never }).ok, true)
  const id = 'native-' + 'a'.repeat(120)
  fake.child.stdout.emit('data', Buffer.from(JSON.stringify({ type: 'system', subtype: 'init', session_id: id }) + '\n'))
  assert.ok(rec.events.some(event => event.kind === 'session' && event.id === id))
  assert.ok(rec.events.some(event => event.kind === 'error' && /work may have started/.test(event.text)))
  assert.equal(fake.child.killed, true); assert.equal(socket.turnBusy(), false)
})
