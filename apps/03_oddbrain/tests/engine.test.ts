import { EventEmitter } from 'node:events'
import { sep as pathSep } from 'node:path'
import test from 'node:test'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { createEngineParser } from '../src/main/engine/stream'
import {
  brainEnvironment,
  engineArguments,
  enginePathPrepend,
  startClaudeCodeSession,
} from '../src/main/engine/claudeCode'
import { createEngineSocket } from '../src/main/engine/socket'
import { DEFAULT_ENGINE, normalizeEngine, toolSummary, type EngineEvent } from '../src/shared/lib/engine'

/**
 * The engine socket, end to end but without a real engine.
 *
 * What is worth testing is not JSON parsing for its own sake: it is that the
 * wire between the app and Claude Code behaves like the architecture doc says
 * — every sentence the engine speaks becomes something a person can read, a
 * permission question can always be answered, a broken or unknown sentence
 * never crashes anything, and a missing engine produces a sentence that tells
 * the person how to fix it.
 *
 * The launch-line, multi-turn, charset and flush tests exist because six
 * reviewers ran the REAL CLI and found exactly these broken while the fake
 * process tests stayed green. Each fix carries the test that would have
 * caught it.
 */

/** Collect events, with helpers for the common assertions. */
function recorder(): { events: EngineEvent[]; on(event: EngineEvent): void; last(kind: EngineEvent['kind']): EngineEvent } {
  const events: EngineEvent[] = []
  return {
    events,
    on: (event) => events.push(event),
    last: (kind) => {
      const found = events.filter((event) => event.kind === kind).at(-1)
      assert.ok(found, `expected a ${kind} event, got: ${JSON.stringify(events)}`)
      return found
    },
  }
}

/** A fake engine command line: a process that records how it was started and what we write to it. */
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

/** A spawn stub that hands back the fake child and remembers its arguments. */
function spawnCapturing(child: unknown): { spawn: unknown; args: string[]; command: string } {
  const captured = { args: [] as string[], command: '' }
  const spawn = ((command: string, args: string[]): unknown => {
    captured.command = command
    captured.args.push(...args)
    return child
  }) as unknown
  return { spawn, args: captured.args, command: captured.command }
}

test('the launch line pins the two permission flags — without them no card can ever appear', () => {
  const fake = fakeEngine()
  const { spawn, args } = spawnCapturing(fake.child)
  startClaudeCodeSession({
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: () => undefined,
    spawnProcess: spawn as typeof import('node:child_process').spawn,
  })
  // Proven against the real v2.1.300: manual mode is what makes the CLI ask
  // instead of deciding by itself, and the stdio prompt tool is what routes
  // the question to this process. Both must be on the launch line.
  assert.match(args.join(' '), /--permission-mode manual/)
  assert.match(args.join(' '), /--permission-prompt-tool stdio/)
  assert.match(args.join(' '), /--output-format stream-json/)
  assert.match(args.join(' '), /--input-format stream-json/)
  assert.match(args.join(' '), /--verbose/)
  assert.ok(!args.join(' ').includes('--model'), 'an empty model choice never becomes a flag')
  assert.match(engineArguments('gemma4:cloud').join(' '), /--model gemma4:cloud/, 'a named brain is passed verbatim')
})

test('the wire: init, words, a tool, and a result become readable events', () => {
  const parser = createEngineParser()
  const events = parser.feed(
    [
      JSON.stringify({ type: 'system', subtype: 'init', model: 'gemma4:cloud' }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'On it.' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'C:\\my notes\\a.md' } }] },
      }),
      JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'File edited.' }),
    ].join('\n') + '\n',
  )
  assert.deepEqual(events, [
    { kind: 'status', text: 'engine ready' },
    { kind: 'thinking', text: 'hidden' },
    { kind: 'text', text: 'On it.' },
    { kind: 'tool', name: 'Edit', summary: 'C:\\my notes\\a.md' },
    { kind: 'done', text: 'File edited.' },
  ])
})

test('the wire: a second turn that says the same words is not shown twice', () => {
  // Two battle sides often answer alike. The dedup buffer must start fresh
  // for each finished message, or the second turn's stream piles onto the
  // stale buffer and the finished text escapes the "already shown" check.
  const parser = createEngineParser()
  const turn = () =>
    [
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Same words.' } } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Same words.' }] } }),
      JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Same words.' }),
    ].join('\n') + '\n'
  const events = parser.feed(turn() + turn())
  assert.deepEqual(events, [
    { kind: 'delta', text: 'Same words.' },
    { kind: 'done', text: 'Same words.' },
    { kind: 'delta', text: 'Same words.' },
    { kind: 'done', text: 'Same words.' },
  ])
})

test('the wire: a permission request becomes a card, thinking is folded, not lost', () => {
  const parser = createEngineParser()
  const events = parser.feed(
    [
      JSON.stringify({
        type: 'control_request',
        request_id: 'req-7',
        request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'npm test' } },
      }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hmm' }] } }),
    ].join('\n') + '\n',
  )
  assert.deepEqual(events, [
    { kind: 'permission', requestId: 'req-7', tool: 'Bash', summary: 'npm test', detail: 'npm test' },
    { kind: 'thinking', text: 'hmm' },
  ])
})

test('the wire: self-denials, retries and failed tools are news, not silence', () => {
  const parser = createEngineParser()
  const events = parser.feed(
    [
      JSON.stringify({ type: 'system', subtype: 'permission_denied' }),
      JSON.stringify({ type: 'system', subtype: 'api_retry', attempt: 3 }),
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', is_error: true, content: 'bash: nope: command not found' }] },
      }),
    ].join('\n') + '\n',
  )
  assert.equal(events.length, 3)
  assert.match(events[0].text, /denied/)
  // the third retry names the actual fix instead of counting forever
  assert.match(events[1].text, /run `claude` once in a terminal and sign in/)
  assert.match(events[2].text, /command not found/)
})

test('the wire: split lines survive, a broken line is skipped, nothing crashes', () => {
  const parser = createEngineParser()
  const first = JSON.stringify({ type: 'system', subtype: 'init' })
  const second = JSON.stringify({ type: 'result', subtype: 'success', result: 'ok' })
  // A stray non-JSON line on its own is skipped and costs nothing.
  assert.deepEqual(parser.feed('total rubbish not json\n'), [])
  // A sentence chopped in half is reassembled from whatever chunks arrive.
  assert.deepEqual(parser.feed(first.slice(0, 12)), [])
  assert.deepEqual(parser.feed(first.slice(12) + '\n'), [{ kind: 'status', text: 'engine ready' }])
  assert.deepEqual(parser.feed(second.slice(0, 12)), [])
  assert.deepEqual(parser.feed(second.slice(12) + '\n'), [{ kind: 'done', text: 'ok' }])
})

test('the wire: a final line without its newline is flushed when the engine closes', () => {
  const parser = createEngineParser()
  const last = JSON.stringify({ type: 'result', subtype: 'success', result: 'final words' })
  // The engine said the goodbye but died before the newline.
  assert.deepEqual(parser.feed(last), [])
  assert.deepEqual(parser.flush(), [{ kind: 'done', text: 'final words' }])
  assert.deepEqual(parser.flush(), [], 'a second flush hands back nothing')
})

test('the adapter: a Bangla character split across data chunks arrives intact', () => {
  const fake = fakeEngine()
  const rec = recorder()
  const session = startClaudeCodeSession({
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: rec.on,
    spawnProcess: (() => fake.child) as unknown as typeof import('node:child_process').spawn,
  })
  const word = 'বাংলা'
  const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: word }] } }) + '\n'
  const bytes = Buffer.from(line, 'utf8')
  // Cut inside the first Bangla character (byte 0 is ASCII, byte 1 is not).
  const cut = 15
  fake.child.stdout.emit('data', bytes.subarray(0, cut))
  fake.child.stdout.emit('data', bytes.subarray(cut))
  const text = rec.last('text') as Extract<EngineEvent, { kind: 'text' }>
  assert.equal(text.text, word)
  session.stop()
})

test('a session: the task goes down the wire, the events come back up', () => {
  const fake = fakeEngine()
  const rec = recorder()
  const session = startClaudeCodeSession({
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: rec.on,
    spawnProcess: (() => fake.child) as unknown as typeof import('node:child_process').spawn,
  })
  assert.equal(session.send('write hello2.txt'), true)
  assert.match(fake.written[0] ?? '', /"type":"user"/)
  assert.match(fake.written[0] ?? '', /hello2\.txt/)
  // The engine answers through stdout, in two pieces, like a real pipe.
  const line = JSON.stringify({ type: 'result', subtype: 'success', result: 'wrote it' }) + '\n'
  fake.child.stdout.emit('data', Buffer.from(line.slice(0, 20), 'utf8'))
  fake.child.stdout.emit('data', Buffer.from(line.slice(20), 'utf8'))
  assert.equal(rec.last('done').text, 'wrote it')
  session.stop()
})

test('a session: a permission card can be allowed, and the answer is on the wire', () => {
  const fake = fakeEngine()
  const rec = recorder()
  const session = startClaudeCodeSession({
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: rec.on,
    spawnProcess: (() => fake.child) as unknown as typeof import('node:child_process').spawn,
  })
  fake.child.stdout.emit(
    'data',
    Buffer.from(
      JSON.stringify({
        type: 'control_request',
        request_id: 'req-9',
        request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: '/x.txt' } },
      }) + '\n',
      'utf8',
    ),
  )
  const card = rec.last('permission') as Extract<EngineEvent, { kind: 'permission' }>
  session.answer(card.requestId, true)
  assert.match(fake.written[0] ?? '', /"behavior":"allow"/)
  assert.match(fake.written[0] ?? '', /req-9/)
})

test('a session: a denial carries a message — the real CLI rejects a bare deny', () => {
  const fake = fakeEngine()
  const rec = recorder()
  const session = startClaudeCodeSession({
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: rec.on,
    spawnProcess: (() => fake.child) as unknown as typeof import('node:child_process').spawn,
  })
  fake.child.stdout.emit(
    'data',
    Buffer.from(
      JSON.stringify({
        type: 'control_request',
        request_id: 'req-10',
        request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'rm -rf /' } },
      }) + '\n',
      'utf8',
    ),
  )
  const card = rec.last('permission') as Extract<EngineEvent, { kind: 'permission' }>
  session.answer(card.requestId, false)
  const deny = JSON.parse(fake.written[0] ?? '{}')
  assert.equal(deny.response.response.behavior, 'deny')
  assert.equal(typeof deny.response.response.message, 'string')
  assert.ok((deny.response.response.message as string).length > 0)
})

test('a session: closing always announces itself — the window must never wait forever', () => {
  const fake = fakeEngine()
  const rec = recorder()
  let closedCode: number | null | undefined
  const session = startClaudeCodeSession({
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: rec.on,
    onClose: (code) => {
      closedCode = code
    },
    spawnProcess: (() => fake.child) as unknown as typeof import('node:child_process').spawn,
  })
  session.stop()
  assert.equal(closedCode, 0)
  assert.deepEqual(rec.events.at(-1), { kind: 'closed' })
})

test('a session: a missing engine becomes a sentence, not a crash', async () => {
  const rec = recorder()
  const child = new EventEmitter()
  const spawnBroken = (): unknown => {
    // Node reports a command it cannot find asynchronously, through 'error'.
    queueMicrotask(() => child.emit('error', new Error('spawn claude ENOENT')))
    return child
  }
  const session = startClaudeCodeSession({
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: rec.on,
    spawnProcess: spawnBroken as unknown as typeof import('node:child_process').spawn,
  })
  await new Promise((resolve) => setImmediate(resolve))
  const error = rec.last('error') as Extract<EngineEvent, { kind: 'error' }>
  assert.match(error.text, /not found/i)
  assert.match(error.text, /npm install -g @anthropic-ai\/claude-code/)
  assert.equal(session.send('anything'), false)
})

test('the engine PATH: Windows gets its npm folders prepended, other systems get nothing', () => {
  // The owner hit "'claude' is not recognized" inside the installed app —
  // a packaged app does not inherit PowerShell's PATH. These folders are
  // where npm and the native installer put claude on Windows.
  assert.equal(enginePathPrepend('linux', {}), '')
  assert.equal(enginePathPrepend('darwin', {}), '')
  const windowsPath = enginePathPrepend('win32', { APPDATA: 'C:\\Users\\x\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\x' })
  // Built with the same path.join the code uses, so the separators are
  // correct on whichever platform runs the test.
  const expected = ['C:\\Users\\x\\AppData\\Roaming', 'npm'].join(pathSep) + ';' + ['C:\\Users\\x', '.local', 'bin'].join(pathSep)
  assert.equal(windowsPath, expected)
  assert.equal(enginePathPrepend('win32', {}), '', 'empty variables contribute nothing, never a bare separator')
})

test('the brain wiring: the Ollama door is set explicitly, no door means no override', () => {
  assert.deepEqual(brainEnvironment('http://localhost:11434'), {
    ANTHROPIC_BASE_URL: 'http://localhost:11434',
    ANTHROPIC_AUTH_TOKEN: 'ollama',
    ANTHROPIC_API_KEY: '',
  })
  assert.deepEqual(brainEnvironment(''), {})
})

test('a key from Models rides the ENGINE: its env points the engine at the provider', () => {
  // The engine is launched AT the provider with the key in its own environment;
  // the app itself still calls no provider. The local door is not touched at all.
  const env = brainEnvironment('http://localhost:11434', 'sk-ant-test')
  assert.deepEqual(env, {
    ANTHROPIC_BASE_URL: 'https://api.anthropic.com/v1',
    ANTHROPIC_API_KEY: 'sk-ant-test',
  })
  assert.equal('ANTHROPIC_AUTH_TOKEN' in env, false)
})

test('the launch arguments are a pure function of the model', () => {
  assert.deepEqual(engineArguments('qwen2.5-coder:3b').slice(-2), ['--model', 'qwen2.5-coder:3b'])
  assert.equal(engineArguments('').includes('--model'), false)
})

test('the throttle maps to the engine\u2019s own official modes, ask unchanged', () => {
  // The default stays exactly what always ran: manual (the CLI's alias for ask-first).
  assert.equal(engineArguments('m').includes('manual'), true)
  assert.equal(engineArguments('m', 'ask').includes('manual'), true)
  assert.equal(engineArguments('m', 'edits').includes('acceptEdits'), true)
  assert.equal(engineArguments('m', 'full').includes('bypassPermissions'), true)
  // Only the mode value moves; the wire sentence and prompt tool stay pinned.
  for (const mode of ['ask', 'edits', 'full'] as const) {
    const args = engineArguments('m', mode)
    assert.equal(args.includes('--permission-prompt-tool'), true)
    assert.equal(args.includes('stream-json'), true)
  }
})

test('the socket: one task at a time, but the next task reuses the living engine', () => {
  const fake = fakeEngine()
  const rec = recorder()
  const socket = createEngineSocket()
  const input = {
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: rec.on,
    spawnProcess: (() => fake.child) as unknown as typeof import('node:child_process').spawn,
  }
  const first = socket.send('first task', input)
  assert.equal(first.ok, true)
  assert.equal(socket.turnBusy(), true)
  // While it works, a second task is refused politely.
  const during = socket.send('second task', input)
  assert.equal(during.ok, false)
  assert.match(during.answer, /already working/)
  // The engine finishes — same process, ready for more (the real CLI does
  // exactly this; the old code refused the second task forever).
  const line = JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }) + '\n'
  fake.child.stdout.emit('data', Buffer.from(line, 'utf8'))
  assert.equal(socket.turnBusy(), false)
  const second = socket.send('second task', input)
  assert.equal(second.ok, true, 'a finished task must not block the next one')
  assert.equal(fake.written.filter((line_) => line_.includes('"type":"user"')).length, 2)
  socket.stop()
})

test('the socket: a stop frees the turn even before any event arrives', () => {
  const fake = fakeEngine()
  const rec = recorder()
  const socket = createEngineSocket()
  socket.send('x', {
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: rec.on,
    spawnProcess: (() => fake.child) as unknown as typeof import('node:child_process').spawn,
  })
  socket.stop()
  assert.equal(socket.turnBusy(), false)
  assert.equal(socket.running(), false)
})

test('the socket: a changed launch flag relaunches the engine with the new flags', async () => {
  const { EventEmitter } = await import('node:events')
  type FakeChild = import('node:child_process').ChildProcess & {
    stdout: import('node:events').EventEmitter
    stderr: import('node:events').EventEmitter
    stdin: { write(data: string): boolean }
    pid: number; killed: boolean; exitCode: number | null; signalCode: null
    kill(): void
  }
  const makeChild = (): FakeChild => {
    const child = new EventEmitter() as unknown as FakeChild
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = { write: () => true }
    child.pid = 5555
    child.killed = false
    child.exitCode = null
    child.signalCode = null
    child.kill = () => { child.killed = true }
    return child
  }
  const children: FakeChild[] = []
  let spawnCount = 0
  const fake = (() => {
    spawnCount += 1
    const child = makeChild()
    children.push(child)
    return child
  }) as unknown as typeof import('node:child_process').spawn
  const rec = recorder()
  const socket = createEngineSocket()
  // The stop rules are the engine's dialect, not the CI host's (a Windows
  // host tree-kills through the fake and the kill count lies); this test is
  // about launch flags, so every session speaks POSIX.
  const base = { cwd: '.', platform: 'linux', onEvent: rec.on, spawnProcess: fake }

  // Same engine, same model, only the THINKING budget changed: the running
  // process was launched without the new flag — a silent gear mismatch — so
  // the honest move is a relaunch, not reuse.
  const first = socket.send('a', { ...base, settings: { ...DEFAULT_ENGINE, thinking: 'default' } })
  assert.equal(first.ok, true)
  const line = JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }) + '\n'
  children[0].stdout.emit('data', Buffer.from(line, 'utf8'))

  const second = socket.send('b', { ...base, settings: { ...DEFAULT_ENGINE, thinking: 'extended' } })
  assert.equal(second.ok, true, second.answer)
  assert.equal(children[0].killed, true, 'the process launched with the old thinking flag is set aside')
  assert.equal(spawnCount, 2, 'a fresh start carries the new launch flag')
  children[1].stdout.emit('data', Buffer.from(line, 'utf8'))

  // And an UNCHANGED gear still reuses: the fix must not turn every send into a relaunch.
  const third = socket.send('c', { ...base, settings: { ...DEFAULT_ENGINE, thinking: 'extended' } })

  assert.equal(third.ok, true)
  assert.equal(spawnCount, 2, 'same launch flags, same process')
  socket.stop()
})

test('the socket: swapping the brain mid-conversation resumes the same session under the new model', async () => {
  const { EventEmitter } = await import('node:events')
  type FakeChild = import('node:child_process').ChildProcess & {
    stdout: import('node:events').EventEmitter
    stderr: import('node:events').EventEmitter
    stdin: { write(data: string): boolean }
    pid: number; killed: boolean; exitCode: number | null; signalCode: null
    kill(): void
  }
  const started: Array<{ command: string; args: string[] }> = []
  const makeChild = (): FakeChild => {
    const child = new EventEmitter() as unknown as FakeChild
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = { write: () => true }
    child.pid = 8888
    child.killed = false
    child.exitCode = null
    child.signalCode = null
    child.kill = () => { child.killed = true }
    return child
  }
  const children: FakeChild[] = []
  const fake = ((_command: string, args: string[]) => {
    const child = makeChild()
    children.push(child)
    started.push({ command: 'claude', args: [...args] })
    return child
  }) as unknown as typeof import('node:child_process').spawn
  const rec = recorder()
  // The app passes its disk-backed memory; the test passes the same contract
  // in RAM. (The default socket ships a no-op memory on purpose — a test
  // without a memory must not fake a resume.)
  const remembered = new Map<string, string>()
  const socket = createEngineSocket({ load: key => remembered.get(key) ?? '', save: (key, id) => void remembered.set(key, id) })
  const base = { cwd: '.', platform: 'linux', onEvent: rec.on, spawnProcess: fake }

  // Turn one on brain A. The engine reports its session id; the socket
  // remembers it for THIS engine+folder.
  const first = socket.send('what is in this folder?', { ...base, settings: { ...DEFAULT_ENGINE, model: 'brain-a' } })
  assert.ok(first.ok)
  const sessionLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-77' }) + '\n'
  children[0]!.stdout.emit('data', Buffer.from(sessionLine, 'utf8'))
  const doneLine = JSON.stringify({ type: 'result', subtype: 'success', result: 'ok' }) + '\n'
  children[0]!.stdout.emit('data', Buffer.from(doneLine, 'utf8'))
  assert.ok(remembered.size === 1, 'the session id was remembered for this engine+folder')

  // Mid-conversation, the person picks brain B: an honest relaunch, and the
  // resume id rides along so the conversation's memory is not lost.
  const second = socket.send('now continue', { ...base, settings: { ...DEFAULT_ENGINE, model: 'brain-b' } })
  assert.ok(second.ok, second.answer)
  assert.equal(children.length, 2, 'a brain swap relaunches')
  assert.equal(children[0]!.killed, true, 'the old brain is set aside')
  // THE contract: the fresh process is launched with the NEW model AND the
  // SAME session id — the conversation's memory survives the swap.
  const swapArgs = started[1]!.args
  assert.ok(swapArgs.includes('--model') && swapArgs.includes('brain-b'), `the swap launches brain-b: ${swapArgs.join(' ')}`)
  assert.ok(swapArgs.includes('--resume') && swapArgs.includes('sess-77'), `the swap resumes the conversation: ${swapArgs.join(' ')}`)
  children[1]!.stdout.emit('data', Buffer.from(doneLine, 'utf8'))
  const third = socket.send('and again', { ...base, settings: { ...DEFAULT_ENGINE, model: 'brain-b' } })
  assert.ok(third.ok, third.answer)
  assert.equal(children.length, 2, 'the new brain, unchanged, is reused')
  socket.stop()
})

test('the socket: a rotated or cleared cloud key reaches the next turn', async () => {
  const { EventEmitter } = await import('node:events')
  type FakeChild = import('node:child_process').ChildProcess & {
    stdout: import('node:events').EventEmitter
    stderr: import('node:events').EventEmitter
    stdin: { write(data: string): boolean }
    pid: number; killed: boolean; exitCode: number | null; signalCode: null
    kill(): void
  }
  const makeChild = (): FakeChild => {
    const child = new EventEmitter() as unknown as FakeChild
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = { write: () => true }
    child.pid = 7777
    child.killed = false
    child.exitCode = null
    child.signalCode = null
    child.kill = () => { child.killed = true }
    return child
  }
  const children: FakeChild[] = []
  const fake = (() => {
    const child = makeChild()
    children.push(child)
    return child
  }) as unknown as typeof import('node:child_process').spawn
  const rec = recorder()
  const socket = createEngineSocket()
  const base = { cwd: '.', platform: 'linux', onEvent: rec.on, spawnProcess: fake }

  // The key's VALUE is launch gear: arriving, rotating and reusing behave
  // exactly like any other flag change — the old process never keeps billing
  // under a secret the UI no longer shows.
  const done = JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }) + '\n'
  const first = socket.send('a', { ...base, settings: { ...DEFAULT_ENGINE }, auth: { provider: 'anthropic' as const, apiKey: 'sk-old' } })
  assert.ok(first.ok)
  assert.equal(children.length, 1)
  children[0].stdout.emit('data', Buffer.from(done, 'utf8'))
  const second = socket.send('b', { ...base, settings: { ...DEFAULT_ENGINE }, auth: { provider: 'anthropic' as const, apiKey: 'sk-new' } })
  assert.ok(second.ok)
  assert.equal(children.length, 2, 'a rotated key relaunches')
  assert.equal(children[0].killed, true, 'the old credential is set aside')
  children[1].stdout.emit('data', Buffer.from(done, 'utf8'))
  const third = socket.send('c', { ...base, settings: { ...DEFAULT_ENGINE }, auth: { provider: 'anthropic' as const, apiKey: 'sk-new' } })
  assert.ok(third.ok)
  assert.equal(children.length, 2, 'the same key reuses the living process')
  assert.equal(children[1].killed, false)
  socket.stop()
})

test('the socket: agy routes to its own adapter and an engine switch starts fresh', async () => {
  const { EventEmitter } = await import('node:events')
  type FakeChild = import('node:child_process').ChildProcess & {
    stdout: import('node:events').EventEmitter
    stderr: import('node:events').EventEmitter
    stdin: { write(data: string): boolean }
    pid: number; killed: boolean; exitCode: number | null; signalCode: null
    kill(): void
  }
  const makeChild = (): FakeChild => {
    const child = new EventEmitter() as unknown as FakeChild
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = { write: () => true }
    child.pid = 4321
    child.killed = false
    child.exitCode = null
    child.signalCode = null
    child.kill = () => { child.killed = true }
    return child
  }
  const started: Array<{ command: string; args: string[] }> = []
  const children: FakeChild[] = []
  const fake = ((command: string, args: string[]) => {
    started.push({ command, args: args as string[] })
    const child = makeChild()
    children.push(child)
    return child
  }) as unknown as typeof spawn

  const rec = recorder()
  const socket = createEngineSocket()
  socket.send('x', {
    cwd: '.',
    // Each session stops by ITS OWN pinned dialect: the switch calls the old
    // session's stop, so the agy session pins POSIX too.
    platform: 'linux',
    settings: { ...DEFAULT_ENGINE, id: 'agy', model: 'gemini-3-pro' },
    onEvent: rec.on,
    spawnProcess: fake,
  })
  assert.equal(started[0].command, 'agy', 'the agy adapter spawns the agy binary')
  assert.deepEqual(started[0].args.slice(0, 4), ['--input-format', 'stream-json', '--output-format', 'stream-json'])
  assert.ok(started[0].args.includes('gemini-3-pro'))

  // an engine switch sets the old process aside and starts the chosen engine
  socket.send('y', {
    cwd: '.',
    // The stop rules are the engine's dialect, not the CI host's: a POSIX
    // stop is a plain signal, so the switch test pins the platform.
    platform: 'linux',
    settings: { ...DEFAULT_ENGINE, id: 'claude-code', model: 'm' },
    onEvent: rec.on,
    spawnProcess: fake,
  })
  assert.equal(started[1].command, 'claude', 'the claude adapter spawns claude')
  assert.equal(children[0].killed, true, 'the old engine is not asked to speak the other wire')
})

test('engine settings: a damaged file falls back to the defaults that work', () => {
  assert.deepEqual(normalizeEngine(undefined), DEFAULT_ENGINE)
  assert.deepEqual(normalizeEngine({ id: 'skynet', model: 42 }), DEFAULT_ENGINE)
  const picked = normalizeEngine({ id: 'claude-code', model: ' qwen2.5-coder:3b ', baseUrl: '' })
  assert.equal(picked.model, 'qwen2.5-coder:3b')
  assert.equal(picked.baseUrl, DEFAULT_ENGINE.baseUrl)
})

test('engine settings: a model name can never carry shell meaning', () => {
  // The model reaches a command line, so anything shell-shaped falls back to
  // the safe default instead of travelling further.
  assert.equal(normalizeEngine({ model: 'gemma4:cloud & del /q *' }).model, '')
  assert.equal(normalizeEngine({ model: 'x"; calc' }).model, DEFAULT_ENGINE.model)
  assert.equal(normalizeEngine({ model: 'gemma4:cloud' }).model, '', 'the app\u2019s own invented default migrates to the honest empty choice')
  // The throttle: anything unknown falls back to ask; the real modes persist.
  assert.equal(normalizeEngine({ approval: 'yolo' }).approval, 'ask')
  assert.equal(normalizeEngine({ approval: 'full' }).approval, 'full')
  assert.equal(normalizeEngine({}).approval, 'ask')
})

test('tool summaries speak about the thing, not the JSON', () => {
  assert.equal(toolSummary('Bash', { command: 'npm test', timeout: 3000 }), 'npm test')
  assert.equal(toolSummary('Read', { file_path: '/vault/today.md', limit: 10 }), '/vault/today.md')
  assert.equal(toolSummary('Whatever', { a: 1 }).length <= 160, true)
})
