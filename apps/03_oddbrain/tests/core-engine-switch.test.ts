import { test, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { createEngineSocket } from '../src/main/engine/socket'
import { DEFAULT_ENGINE, type EngineEvent } from '../src/shared/lib/engine'
import type { ChildProcess, spawn } from 'node:child_process'

function fakeChild(): ChildProcess {
  const process = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter; stderr: EventEmitter; stdin: { write(data: string): boolean }
    killed: boolean; exitCode: null; signalCode: null; pid: number
    kill(): boolean
  }
  process.stdout = new EventEmitter()
  process.stderr = new EventEmitter()
  process.stdin = { write: () => true }
  process.pid = 2222
  process.killed = false
  process.exitCode = null
  process.signalCode = null
  process.kill = () => { process.killed = true; process.emit('close', 0); return true }
  return process
}

test('a busy worker refuses a gear change; after completion, late old events cannot finish new work', () => {
  const children: ChildProcess[] = [], events: EngineEvent[] = []
  const spawnProcess = (() => { const child = fakeChild(); children.push(child); return child }) as unknown as typeof spawn
  const socket = createEngineSocket()
  const options = { cwd: '.', settings: { ...DEFAULT_ENGINE }, onEvent: (event: EngineEvent) => events.push(event), spawnProcess }
  expect(socket.send('first', options).ok).toBe(true)
  expect(socket.turnBusy()).toBe(true)
  expect(socket.send('same gear while busy', options).ok).toBe(false)
  expect(children).toHaveLength(1)

  const changed = { ...options, settings: { ...DEFAULT_ENGINE, model: 'qwen2.5-coder:3b' } }
  expect(socket.send('new gear too soon', changed).ok).toBe(false)
  expect(children).toHaveLength(1)
  expect(children[0].killed).toBe(false)
  children[0].stdout?.emit('data', Buffer.from(JSON.stringify({ type: 'result', subtype: 'success', result: 'first result' }) + '\n'))
  expect(socket.turnBusy()).toBe(false)
  expect(socket.send('new gear after completion', changed).ok).toBe(true)
  expect(children).toHaveLength(2)
  expect(children[0].killed).toBe(true)
  expect(socket.turnBusy()).toBe(true)
  const before = events.length
  children[0].stdout?.emit('data', Buffer.from(JSON.stringify({ type: 'result', subtype: 'success', result: 'old result' }) + '\n'))
  expect(events).toHaveLength(before)
  expect(socket.turnBusy()).toBe(true)
  children[1].stdout?.emit('data', Buffer.from(JSON.stringify({ type: 'result', subtype: 'success', result: 'new result' }) + '\n'))
  expect(events.some(event => event.kind === 'done' && event.text === 'new result')).toBe(true)
  expect(socket.turnBusy()).toBe(false)
  socket.stop()
})
