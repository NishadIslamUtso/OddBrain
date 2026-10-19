import { describe, expect, test } from 'vitest'
import { spawn } from 'node:child_process'
import { agyArguments, agyErrorSentence, agyModeArguments, agyUserLine, startAgySession } from '../src/main/engine/agy'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import type { EngineEvent } from '../src/shared/lib/engine'

/**
 * agy's wire contract, pinned from the REAL binary (v1.4.0, official
 * installer, run in the build sandbox on 2026-10-17): stream-json in and out,
 * a `result` envelope carrying status/response/error/usage/conversation_id,
 * exit 0 even on error, `--conversation` to resume. The fixtures below are
 * the lines the real binary actually emitted.
 */

const settings = (over: Partial<typeof DEFAULT_ENGINE> = {}): typeof DEFAULT_ENGINE => ({
  ...DEFAULT_ENGINE,
  id: 'agy',
  model: 'gemini-3-pro',
  ...over,
})

type Run = {
  events: EngineEvent[]
  closed: number | null
  closedFire: () => void
  stdin: string[]
  args: string[]
  child: import('node:child_process').ChildProcess
}

/** Drive the adapter against a scripted child (the documented seam). */
function drive(lines: string[], stderr = ''): Run {
  const events: EngineEvent[] = []
  let closed: number | null = null
  let closedFire = (): void => {}
  const stdin: string[] = []
  const captured: { args: string[]; child?: import('node:child_process').ChildProcess } = { args: [] }
  const fake: typeof spawn = ((_command: string, args: string[]) => {
    captured.args = args as string[]
    const { EventEmitter } = require('node:events') as typeof import('node:events')
    const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess
    captured.child = child
    const stdout = new EventEmitter()
    const stderrBus = new EventEmitter()
    ;(child as unknown as { stdout: unknown; stderr: unknown; stdin: unknown }).stdout = stdout
    ;(child as unknown as { stderr: unknown }).stderr = stderrBus
    ;(child as unknown as { stdin: unknown }).stdin = { write: (line: string) => { stdin.push(line); return true } }
    ;(child as unknown as { exitCode: number | null }).exitCode = null
    setTimeout(() => {
      for (const line of lines) stdout.emit('data', Buffer.from(line))
      if (stderr) stderrBus.emit('data', Buffer.from(stderr))
      ;(child as unknown as { exitCode: number | null }).exitCode = 0
      child.emit('close', 0)
      closed = 0
      closedFire()
    }, 5) as unknown as number
    return child
  }) as unknown as typeof spawn
  const session = startAgySession({
    cwd: '/tmp',
    settings: settings(),
    onEvent: (event) => events.push(event),
    spawnProcess: fake,
  })
  session.send('hello')
  return {
    events,
    get closed() { return closed },
    closedFire: () => closedFire(),
    stdin,
    get args() { return captured.args },
    get child() { return captured.child as import('node:child_process').ChildProcess },
  }
}

const wait = (ms = 30): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

describe('agy: engine #2 on its own verified wire', () => {
  test('the launch line is its own documented flags, stream-json both ways', () => {
    const args = agyArguments(settings())
    expect(args).toEqual(['--input-format', 'stream-json', '--output-format', 'stream-json', '--model', 'gemini-3-pro'])
    // the throttle maps to agy's own knobs, not Claude Code's
    expect(agyModeArguments('ask')).toEqual([])
    expect(agyModeArguments('edits')).toEqual(['--mode', 'accept-edits'])
    expect(agyModeArguments('plan')).toEqual(['--mode', 'plan'])
    expect(agyModeArguments('full')).toEqual(['--dangerously-skip-permissions'])
    // Legacy Extended must not silently become high effort. The default model omits --model.
    expect(agyArguments(settings({ thinking: 'extended' as never }))).not.toContain('--effort')
    expect(agyArguments(settings({ approval: 'full', thinking: 'extended' as never }))).toEqual([
      '--input-format', 'stream-json', '--output-format', 'stream-json', '--model', 'gemini-3-pro',
      '--dangerously-skip-permissions',
    ])
  })

  test('resume rides --conversation, the verified flag, with the id the result carried', () => {
    expect(agyArguments(settings(), 'conv-77')).toEqual([
      '--input-format', 'stream-json', '--output-format', 'stream-json', '--model', 'gemini-3-pro',
      '--conversation', 'conv-77',
    ])
  })

  test('a turn goes in as one NDJSON user message; pictures are refused honestly', () => {
    expect(agyUserLine('say done')).toBe(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'say done' } })}\n`)
    const run = drive([])
    expect(run.stdin).toHaveLength(1)
    const ok = run.child.stdin.write as unknown as (line: string) => boolean
    expect(ok).toBeTruthy()
    // the picture refusal is the adapter's own honest answer, not a silent drop
    const refused = startAgySession({
      cwd: '/tmp',
      settings: settings(),
      onEvent: () => undefined,
      spawnProcess: ((_c: string, _a: string[]) => {
        const { EventEmitter } = require('node:events')
        const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess
        ;(child as unknown as { stdout: unknown; stderr: unknown; stdin: unknown }).stdout = new EventEmitter()
        ;(child as unknown as { stderr: unknown }).stderr = new EventEmitter()
        ;(child as unknown as { stdin: unknown }).stdin = { write: () => true }
        ;(child as unknown as { exitCode: number | null }).exitCode = null
        return child
      }) as unknown as typeof spawn,
    })
    expect(refused.send('a picture prompt', [{ mime: 'image/png', data: 'AAAA' }])).toBe(false)
    void ok
  })

  test('the REAL error envelope maps to an honest error event (observed line, verbatim)', async () => {
    const observed = '{"event":"result","result":{"conversation_id":"","status":"ERROR","response":"","error":"authentication failed or timed out","duration_seconds":0,"num_turns":0,"usage":{"input_tokens":0,"output_tokens":0,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":0}}}'
    const run = drive([observed], "Error: authentication required. Run 'agy' to log in, then retry.\n")
    await wait()
    const error = run.events.find(event => event.kind === 'error')
    expect(error && error.kind === 'error' && /signed in/.test(error.text)).toBe(true)
  })

  test('a success result maps to done + usage + a resumable session id', async () => {
    const line = '{"event":"result","result":{"conversation_id":"c-9","status":"COMPLETED","response":"Done, cleanly.","error":"","duration_seconds":1.2,"num_turns":2,"usage":{"input_tokens":40,"output_tokens":9,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":49}}}'
    const run = drive([line])
    await wait()
    const done = run.events.find(event => event.kind === 'done')
    expect(done && done.kind === 'done' && done.text === 'Done, cleanly.').toBe(true)
    expect(done && done.kind === 'done' && done.usage).toEqual({ inTokens: 40, outTokens: 9, durationMs: 1200, costUsd: null })
    expect(run.events.some(event => event.kind === 'session' && event.id === 'c-9')).toBe(true)
    expect(run.events.some(event => event.kind === 'closed')).toBe(true)
  })

  test('unknown event lines pass by silently; a dead binary still explains itself', async () => {
    const run = drive(['{"event":"stream_delta","bytes":"zzz"}', 'not json at all'])
    await wait()
    expect(run.events.some(event => event.kind === 'text')).toBe(false)
    const error = run.events.find(event => event.kind === 'error')
    expect(error && error.kind === 'error' && /closed without an answer/.test(error.text)).toBe(true)
  })

  test('the auth sentence tells the owner the exact next step', () => {
    expect(agyErrorSentence('authentication failed or timed out', '')).toMatch(/terminal/)
    expect(agyErrorSentence('quota exhausted', '')).toBe('quota exhausted')
  })
})
