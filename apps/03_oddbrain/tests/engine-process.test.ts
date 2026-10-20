import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { EngineEvent } from '../src/shared/lib/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import {
  sanitizeEnvironment,
  stopArguments,
  startClaudeCodeSession,
  engineArguments,
} from '../src/main/engine/claudeCode'
import { createEngineParser } from '../src/main/engine/stream'

/**
 * Track C, landing 1 — the engine's process, hardened. Every defect here was
 * a way the old build could lie or crash: a machine credential sneaking into
 * the engine's environment, a deliberate stop reported as an error, an
 * orphaned engine on Windows, a dead pipe crashing a send, and a parser that
 * rescanned its whole buffer on every chunk.
 */

/** A fake engine command line, with a pid and a failing-stdin switch. */
function fakeEngine(options: { pid?: number; failWrites?: boolean } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    stdin: { write(data: string): boolean; on?(event: string, fn: () => void): unknown }
    pid?: number
    killed: boolean
    exitCode: number | null
    signalCode: null
    kill(): void
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = {
    write: (data: string) => {
      if (options.failWrites) throw new Error('EPIPE')
      return true
    },
  }
  if (options.pid !== undefined) child.pid = options.pid
  child.killed = false
  child.exitCode = null
  child.signalCode = null
  child.kill = function kill() {
    this.killed = true
  }
  return child
}

function spawnCapturing() {
  const calls: Array<{ command: string; args: string[]; env?: Record<string, string> }> = []
  let next: unknown = null
  const spawn = ((command: string, args: string[], options?: { env?: Record<string, string> }) => {
    calls.push({ command, args, env: options?.env })
    return next
  }) as unknown
  return {
    spawn,
    calls,
    /** Which fake child the NEXT spawn returns. */
    queue(child: unknown): void {
      next = child
    },
  }
}

function sessionOn(child: unknown, spawn: unknown, extra: Record<string, unknown> = {}) {
  const events: EngineEvent[] = []
  const session = startClaudeCodeSession({
    cwd: '.',
    settings: DEFAULT_ENGINE,
    onEvent: (event) => events.push(event),
    spawnProcess: spawn as typeof import('node:child_process').spawn,
    ...extra,
  })
  return { session, events }
}

test('the free gate: machine Anthropic credentials never reach the engine', () => {
  const machine = {
    PATH: '/usr/bin',
    ANTHROPIC_API_KEY: 'sk-machine-secret',
    ANTHROPIC_AUTH_TOKEN: 'machine-token',
    ANTHROPIC_BASE_URL: 'https://machine.example',
  }
  const clean = sanitizeEnvironment(machine)
  assert.equal(clean['ANTHROPIC_API_KEY'], undefined)
  assert.equal(clean['ANTHROPIC_AUTH_TOKEN'], undefined)
  assert.equal(clean['ANTHROPIC_BASE_URL'], undefined)
  assert.equal(clean['PATH'], '/usr/bin')

  // And the launch inherits exactly that: the chosen brain applied on top of
  // a sanitized environment, nothing else.
  const child = fakeEngine({ pid: 100 })
  const { spawn, calls, queue } = spawnCapturing()
  queue(child)
  sessionOn(child, spawn, { settings: { ...DEFAULT_ENGINE, model: 'qwen2.5-coder:3b', baseUrl: 'http://localhost:11434' } })
  const env = calls[0]?.env ?? {}
  assert.equal(env['ANTHROPIC_BASE_URL'], 'http://localhost:11434', 'a NAMED brain rides its door')
  assert.notEqual(env['ANTHROPIC_API_KEY'], 'sk-machine-secret')

  // With no brain chosen, the engine runs AS ITSELF: no door, no model, and
  // never the machine's own credentials. The owner's machine proved why —
  // an empty choice forced at a dead door retries forever.
  const child2 = fakeEngine({ pid: 101 })
  const second = spawnCapturing()
  second.queue(child2)
  sessionOn(child2, second.spawn, { settings: { ...DEFAULT_ENGINE, model: '', baseUrl: 'http://localhost:11434' } })
  assert.equal(second.calls[0]?.env?.['ANTHROPIC_BASE_URL'], undefined, 'no brain picked, no door forced')
})

test('the Windows stop takes the whole tree: taskkill /pid <pid> /T /F', () => {
  const child = fakeEngine({ pid: 4242 })
  const { spawn, calls, queue } = spawnCapturing()
  queue(child)
  const { session } = sessionOn(child, spawn, { platform: 'win32' })
  session.stop()
  const kill = calls.at(-1)
  assert.equal(kill?.command, 'taskkill')
  assert.deepEqual(kill?.args, ['/pid', '4242', '/T', '/F'])
  assert.equal(child.killed, false, 'the shell is left to the tree-kill, not double-killed')
})

test('elsewhere a stop is a plain signal', () => {
  const child = fakeEngine({ pid: 7 })
  const { spawn, calls, queue } = spawnCapturing()
  queue(child)
  const { session } = sessionOn(child, spawn, { platform: 'linux' })
  session.stop()
  assert.equal(child.killed, true)
  assert.equal(calls.length, 1, 'no taskkill off Windows')
})

test('a deliberate stop is quiet; a real crash still says why', () => {
  const stopped = fakeEngine({ pid: 5 })
  const first = spawnCapturing()
  first.queue(stopped)
  const mine = sessionOn(stopped, first.spawn)
  mine.session.stop()
  stopped.stderr.emit('data', Buffer.from('killed mid-sentence'))
  stopped.emit('close', null)
  assert.equal(mine.events.some((event) => event.kind === 'error'), false, 'no error card over a stop')
  assert.equal(mine.events.at(-1)?.kind, 'closed')

  const crashed = fakeEngine({ pid: 6 })
  const second = spawnCapturing()
  second.queue(crashed)
  const its = sessionOn(crashed, second.spawn)
  crashed.stderr.emit('data', Buffer.from('boom: the brain refused'))
  crashed.emit('close', 1)
  const error = its.events.find((event) => event.kind === 'error')
  assert.match(error && 'text' in error ? error.text : '', /exit 1/); assert.ok(!JSON.stringify(its.events).includes('boom'), 'raw stderr is not exposed')
})

test('a dead pipe does not crash a send', () => {
  const child = fakeEngine({ pid: 8, failWrites: true })
  const { spawn, queue } = spawnCapturing()
  queue(child)
  const { session } = sessionOn(child, spawn)
  assert.equal(session.send('hello'), false, 'not delivered — and no exception')
  assert.doesNotThrow(() => session.answer('req-1', true))
})

test('the parser rescans only the new tail at a chunk boundary', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'On it — the engine\u2019s own words.' }] },
  })
  const whole = createEngineParser().feed(`${line}\n`).length
  assert.equal(whole, 1)
  // Split at EVERY boundary: each split parses exactly once, never twice.
  for (let cut = 1; cut < line.length; cut++) {
    const parser = createEngineParser()
    const events = [...parser.feed(line.slice(0, cut)), ...parser.feed(`${line.slice(cut)}\n`)]
    assert.equal(events.length, 1, `split at ${cut} parsed exactly once`)
  }
})

test('the tree-kill line is pinned', () => {
  assert.deepEqual(stopArguments(987654), ['/pid', '987654', '/T', '/F'])
})


test('the launch line asks for the stream, not just finished sentences', () => {
  assert.match(engineArguments('m').join(' '), /--include-partial-messages/)
})

test('the stream: words arrive as they form, and the finished message is not printed twice', () => {
  const parser = createEngineParser()
  const events = [
    ...parser.feed(`${JSON.stringify({ type: 'stream_event', event: { type: 'message_start' } })}\n`),
    ...parser.feed(`${JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } } })}\n`),
    ...parser.feed(`${JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo.' } } })}\n`),
  ]
  assert.deepEqual(events, [{ kind: 'delta', text: 'Hel' }, { kind: 'delta', text: 'lo.' }])

  // The finished message says exactly what the stream already showed: kept
  // for the record, not shown twice.
  const done = parser.feed(
    `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello.' }] } })}\n`
  )
  assert.deepEqual(done, [])

  // A different tool-heavy message still comes through whole.
  const next = parser.feed(
    `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.md' } }] } })}\n`
  )
  assert.deepEqual(next.map((event) => event.kind), ['tool'])
})

test('the stream: an assistant text that differs from what was streamed still shows', () => {
  const parser = createEngineParser()
  parser.feed(`${JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } } })}\n`)
  const events = parser.feed(
    `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'the whole truth, differently put' }] } })}\n`
  )
  assert.deepEqual(events, [{ kind: 'text', text: 'the whole truth, differently put' }])
})
