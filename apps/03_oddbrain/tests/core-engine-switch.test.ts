import { test, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { createEngineSocket } from '../src/main/engine/socket'
import { DEFAULT_ENGINE, type EngineEvent } from '../src/shared/lib/engine'
import type { ChildProcess, spawn } from 'node:child_process'

function fakeChild(pid: number): ChildProcess {
  const process = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter; stderr: EventEmitter; stdin: { write(data: string): boolean }
    killed: boolean; exitCode: null; signalCode: null; pid: number
    kill(): boolean
  }
  process.stdout = new EventEmitter()
  process.stderr = new EventEmitter()
  process.stdin = { write: () => true }
  process.pid = pid
  process.killed = false
  process.exitCode = null
  process.signalCode = null
  process.kill = () => { process.killed = true; process.emit('close', 0); return true }
  return process
}

test.each(['linux', 'win32'])('on %s, a busy worker refuses a gear change; after completion, late old events cannot finish new work', platform => {
  const children: ChildProcess[] = [], stopHelpers: ChildProcess[] = [], events: EngineEvent[] = []
  const spawnProcess = ((command: string, args: string[] = []) => {
    if (command === 'taskkill') {
      // Windows stops the process tree with a separate helper. Simulate what
      // the helper does to the named pid; it is not a third engine session.
      const pid = Number(args[args.indexOf('/pid') + 1])
      children.find(child => child.pid === pid)?.kill()
      const helper = fakeChild(-1)
      stopHelpers.push(helper)
      return helper
    }
    const child = fakeChild(2222 + children.length)
    children.push(child)
    return child
  }) as unknown as typeof spawn
  const socket = createEngineSocket()
  const options = { cwd: '.', settings: { ...DEFAULT_ENGINE }, onEvent: (event: EngineEvent) => events.push(event), spawnProcess, platform }
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
  expect(stopHelpers).toHaveLength(platform === 'win32' ? 1 : 0)
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
