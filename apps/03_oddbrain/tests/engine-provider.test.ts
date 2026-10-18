// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

/**
 * Clearing one provider's key must not stop an engine that was launched with
 * ANOTHER's. The socket knows which provider's key the live process carries;
 * the clear-key door asks before it stops.
 */
test('the socket knows which provider\u2019s key the live session launched with', async () => {
  const { createEngineSocket: makeSocket } = await import('../src/main/engine/socket')
  const { DEFAULT_ENGINE } = await import('../src/shared/lib/engine')
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
    child.pid = 9999
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
  const events: unknown[] = []
  const socket = makeSocket()
  const base = { cwd: '.', platform: 'linux', onEvent: (event: unknown) => events.push(event), spawnProcess: fake }

  assert.equal(socket.usedAuthProvider(), null, 'nothing launched yet, no provider')

  const first = socket.send('a', { ...base, settings: { ...DEFAULT_ENGINE }, auth: { provider: 'anthropic' as const, apiKey: 'sk-1' } })
  assert.ok(first.ok)
  assert.equal(socket.usedAuthProvider(), 'anthropic')

  // The line that clear-key consults: only the MATCHING provider stops.
  assert.equal(socket.usedAuthProvider() === 'gemini', false, 'a gemini key clearance must not stop an anthropic session')

  const done = JSON.stringify({ type: 'result', subtype: 'success', result: 'ok' }) + '\n'
  children[0]!.stdout.emit('data', Buffer.from(done, 'utf8'))
  const second = socket.send('b', { ...base, settings: { ...DEFAULT_ENGINE } })
  assert.ok(second.ok)
  assert.equal(socket.usedAuthProvider(), null, 'a keyless launch carries no provider')
  socket.stop()
})
