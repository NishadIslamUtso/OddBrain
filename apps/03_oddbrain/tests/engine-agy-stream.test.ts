import { describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { spawn } from 'node:child_process'
import { createAgyParser } from '../src/main/engine/agyStream'
import { startAgySession } from '../src/main/engine/agy'
import { DEFAULT_ENGINE, type EngineEvent } from '../src/shared/lib/engine'

// Synthetic protocol regressions; these are not native signed-in acceptance.
const step = (index: number, text: string, extra = {}) => ({ event: 'step_update', step_update: { conversation_id: 'c-1', step_index: index, step_type: 'agent_response', state: 'ACTIVE', text_delta: text, ...extra } })
const result = (extra = {}) => ({ event: 'result', result: { conversation_id: 'c-1', status: 'SUCCESS', response: 'Hello', num_turns: 1, duration_seconds: 2, usage: { input_tokens: 40, output_tokens: 10 }, ...extra } })
const tool = (state: string, extra = {}) => step(2, '', { step_type: 'tool', state, tool_name: 'run_command', tool_info: { parameters: { CommandLine: 'git status' }, ...extra } })

function session() {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: Object.assign(new EventEmitter(), { write: vi.fn(() => true) }), exitCode: null, kill: vi.fn() })
  const events: EngineEvent[] = []
  const spawnProcess = vi.fn(() => child) as unknown as typeof spawn
  const handle = startAgySession({ cwd: process.cwd(), settings: { ...DEFAULT_ENGINE, id: 'agy' }, spawnProcess, onEvent: event => events.push(event) })
  const emit = (value: unknown) => child.stdout.emit('data', Buffer.from(JSON.stringify(value) + '\n'))
  return { child, events, handle, emit, spawnProcess }
}

describe('agy stream parser', () => {
  test('includes DONE deltas and does not repeat final text after tool activity', () => {
    const parser = createAgyParser(); parser.beginTurn()
    expect(parser.event(step(0, 'Working.'))).toContainEqual({ kind: 'delta', text: 'Working.' })
    expect(parser.event(tool('ACTIVE'))).toContainEqual({ kind: 'tool', name: 'run_command', summary: 'git status' })
    expect(parser.event(tool('DONE', { output: 'clean' }))).toContainEqual({ kind: 'status', text: 'run_command output:\nclean' })
    expect(parser.event(tool('DONE', { output: 'clean' }))).toEqual([])
    parser.event(step(3, 'Hel'))
    expect(parser.event(step(3, 'lo', { state: 'DONE' }))).toEqual([{ kind: 'delta', text: 'lo' }])
    expect(parser.event(result()).at(-1)).toMatchObject({ kind: 'done', text: 'Hello', alreadyDisplayed: true })
    expect(parser.pending()).toBe(false)
  })
  test('adds only a missing result suffix; plain result-only responses still display', () => {
    const parser = createAgyParser(); parser.beginTurn(); parser.event(step(0, 'Hel'))
    expect(parser.event(result())).toContainEqual({ kind: 'delta', text: 'lo' })
    parser.beginTurn()
    expect(parser.event(result({ response: 'Next' })).at(-1)).toMatchObject({ kind: 'done', text: 'Next', alreadyDisplayed: false })
  })
  test.each(['ERROR', 'CANCELED', 'INTERRUPTED', 'WAITING', 'RUNNING', 'INVALID', 'COMPLETED'])('never claims success for %s, retaining partial output', status => {
    const parser = createAgyParser(); parser.beginTurn()
    const events = parser.event(result({ status, response: 'Partial work' }))
    expect(events).toContainEqual({ kind: 'text', text: 'Partial work' })
    expect(events.some(e => e.kind === 'done')).toBe(false)
    expect(events.at(-1)).toMatchObject({ kind: 'error' })
    expect(parser.shouldStop()).toBe(!['ERROR', 'CANCELED', 'INTERRUPTED'].includes(status))
  })
  test('accounts for cumulative counters only once per turn, never invents price', () => {
    const parser = createAgyParser(); parser.beginTurn()
    expect(parser.event(result()).at(-1)).toMatchObject({ usage: { inTokens: 40, outTokens: 10, durationMs: 2000, costUsd: null } })
    parser.beginTurn()
    expect(parser.event(result({ num_turns: 2, duration_seconds: 3.5, usage: { input_tokens: 55, output_tokens: 19 } })).at(-1)).toMatchObject({ usage: { inTokens: 15, outTokens: 9, durationMs: 1500, costUsd: null } })
  })
  test('omits unknown first-resume usage, then uses observed differences; counter resets are not negative usage', () => {
    const parser = createAgyParser('c-1'); parser.beginTurn()
    const events = parser.event(result({ num_turns: 5 }))
    expect(events.at(-1)).not.toHaveProperty('usage')
    expect(events.some(e => e.kind === 'status' && e.text.includes('not added'))).toBe(true)
    parser.beginTurn()
    expect(parser.event(result({ num_turns: 6, duration_seconds: 3, usage: { input_tokens: 50, output_tokens: 12 } })).at(-1)).toMatchObject({ usage: { inTokens: 10, outTokens: 2 } })
    parser.beginTurn()
    expect(parser.event(result({ num_turns: 7, usage: { input_tokens: 1, output_tokens: 1 } })).at(-1)).not.toHaveProperty('usage')
  })
  test('native permissions and denials are notices, never invented approval cards or thinking', () => {
    const parser = createAgyParser()
    expect(parser.event({ event: 'init', conversation_id: 'c-1', init: { permission_mode: 'default' } })).toContainEqual({ kind: 'status', text: expect.stringContaining('No interactive approval cards') })
    parser.beginTurn()
    expect(parser.event(step(0, '', { thinking_delta: 'not a documented field' }))).toEqual([])
    const events = parser.event(result({ denied_actions: [{ action: 'run_command', display_name: 'rm file' }] }))
    expect(events).toContainEqual({ kind: 'status', text: expect.stringContaining('OddBrain did not approve') })
    expect(events.some(e => e.kind === 'permission' || e.kind === 'thinking')).toBe(false)
  })
  test('does not silently switch conversations on resume or later step output', () => {
    const parser = createAgyParser('c-other'); parser.beginTurn()
    expect(() => parser.event(result())).toThrow('different conversation')
    const normal = createAgyParser(); normal.beginTurn(); normal.event(step(0, 'Hi'))
    expect(() => normal.event(step(1, 'Wrong', { conversation_id: 'c-other' }))).toThrow('different conversation')
  })
  test('ignores completed-turn step replays and bounds output without silently truncating replies', () => {
    const parser = createAgyParser(); parser.beginTurn(); parser.event(step(4, 'Hello')); parser.event(result()); parser.beginTurn()
    expect(parser.event(step(4, 'Hello'))).toEqual([])
    expect(() => parser.event(step(5, 'x'.repeat(8_000_001)))).toThrow('exceeded')
    const clipped = createAgyParser(); clipped.beginTurn()
    expect(clipped.event(tool('DONE', { output: 'x'.repeat(6000), error: { message: 'failed' } }))).toContainEqual({ kind: 'status', text: expect.stringContaining('1000 more characters not shown') })
  })
})

describe('agy transport lifecycle', () => {
  test('uses no shell; sends one native user event and refuses concurrent sends', () => {
    const run = session(); expect(run.handle.send('Hi')).toBe(true)
    expect(run.child.stdin.write).toHaveBeenCalledWith('{"event":"user","message":{"content":"Hi"}}\n')
    expect(run.handle.send('Too early')).toBe(false)
    expect((run.spawnProcess as any).mock.calls[0][2].shell).toBe(false)
  })
  test('preserves a split multibyte character and a final line without newline', () => {
    const run = session(); run.handle.send('Hi')
    const bytes = Buffer.from(JSON.stringify(result({ response: 'বাংলা' })))
    for (const value of bytes) run.child.stdout.emit('data', Buffer.from([value]))
    run.child.emit('close', 0)
    expect(run.events).toContainEqual(expect.objectContaining({ kind: 'done', text: 'বাংলা' }))
  })
  test('reports a later-turn crash even when an earlier turn succeeded', () => {
    const run = session(); run.handle.send('First'); run.emit(result()); run.handle.send('Second'); run.child.emit('close', 1)
    expect(run.events.filter(e => e.kind === 'done')).toHaveLength(1)
    expect(run.events).toContainEqual({ kind: 'error', text: expect.stringContaining('current message') })
  })
  test('idle closes and deliberate stop are not fabricated task failures', () => {
    const idle = session(); idle.child.emit('close', 0)
    expect(idle.events).toEqual([{ kind: 'closed' }])
    const run = session(); run.handle.send('Hi'); run.handle.stop(); run.child.emit('close', null)
    expect(run.child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(run.events.some(e => e.kind === 'error')).toBe(false)
    expect(run.handle.send('Again')).toBe(false)
  })
  test('unresolved native status stops the child rather than accepting another turn', () => {
    const run = session(); run.handle.send('Hi'); run.emit(result({ status: 'WAITING' }))
    expect(run.child.kill).toHaveBeenCalledWith('SIGKILL'); expect(run.handle.isRunning()).toBe(false)
    expect(run.handle.send('Next')).toBe(false)
  })
  test('images and permission answers never leak into an unsupported wire format', () => {
    const run = session()
    expect(run.handle.send('Image', [{ mime: 'image/png', data: 'AAAA' }])).toBe(false)
    expect(run.handle.refusal?.()).toMatch(/text only/)
    run.handle.answer('approval', true)
    expect(run.child.stdin.write).not.toHaveBeenCalled()
    expect(run.handle.send('Text')).toBe(true)
  })
  test('broken pipes report one error, stop the child and cannot accept more work', () => {
    const run = session(); run.handle.send('Hi'); run.child.stdin.emit('error', Error('EPIPE')); run.child.emit('close', 1)
    expect(run.events.filter(e => e.kind === 'error')).toHaveLength(1)
    expect(run.child.kill).toHaveBeenCalled(); expect(run.handle.isRunning()).toBe(false)
  })
})
