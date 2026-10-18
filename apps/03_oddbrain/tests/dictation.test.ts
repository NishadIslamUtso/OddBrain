import test from 'node:test'
import assert from 'node:assert/strict'
import { createDictationService, type DictationChild, type DictationEvent } from '../src/main/dictation'

/**
 * Offline dictation: Windows' own recognizer is spawned per session, phrases
 * stream back as lines, stops are honest, and a machine without the engine
 * gets the real reason instead of a dead microphone.
 */

type Listener = (...args: never[]) => void

function fakeChild() {
  const handlers: Record<string, Listener[]> = { data: [], error: [], close: [] }
  const child: DictationChild & { killed: boolean; spawnedWith?: { command: string; args: string[] } } = {
    stdout: { on: (_event, listener) => { handlers.data.push(listener as Listener); return child } },
    stderr: { on: () => child },
    on: (event, listener) => { handlers[event].push(listener as Listener); return child },
    kill: () => { child.killed = true; return true },
    killed: false,
  }
  return {
    child,
    emitData(chunk: string): void { for (const listener of handlers.data) listener(chunk as never) },
    emitClose(code: number | null): void { for (const listener of handlers.close) listener(code as never) },
    emitError(message: string): void { for (const listener of handlers.error) listener(new Error(message) as never) },
  }
}

test('phrases stream in as whole lines, even when a chunk splits one', () => {
  const fake = fakeChild()
  const service = createDictationService({
    platform: 'win32',
    spawnImpl: (command, args) => {
      fake.child.spawnedWith = { command, args }
      return fake.child
    },
  })
  const heard: DictationEvent[] = []
  const start = service.start(event => heard.push(event))
  assert.equal(start.ok, true)
  assert.match(start.answer, /Listening/)
  assert.equal(fake.child.spawnedWith?.command, 'powershell.exe')
  fake.emitData('open the ')
  fake.emitData('vault now\r\nand then list')
  fake.emitData(' the people\r\n')
  const words = heard.filter(e => e.kind === 'text')
  assert.deepEqual(words.map(e => (e as { value: string }).value), ['open the vault now', 'and then list the people'])

  const stopped = service.stop()
  assert.equal(stopped.ok, true)
  assert.equal(fake.child.killed, true, 'stop kills the recognizer we spawned')
})

test('a second start while listening does not spawn a second recognizer', () => {
  const fake = fakeChild()
  let spawns = 0
  const service = createDictationService({
    platform: 'win32',
    spawnImpl: () => { spawns += 1; return fake.child },
  })
  service.start(() => undefined)
  const again = service.start(() => undefined)
  assert.equal(again.ok, true)
  assert.match(again.answer, /Already/)
  assert.equal(spawns, 1)
})

test('off Windows, start refuses with the honest reason — no fake listening', () => {
  const service = createDictationService({ platform: 'linux' })
  const heard: DictationEvent[] = []
  const start = service.start(event => heard.push(event))
  assert.equal(start.ok, false)
  assert.match(start.answer, /Windows/)
  assert.equal(heard.length, 0)
  assert.equal(service.stop().ok, false)
})

test('a recognizer that dies by itself reports why, once', () => {
  const fake = fakeChild()
  const service = createDictationService({ platform: 'win32', spawnImpl: () => fake.child })
  const heard: DictationEvent[] = []
  service.start(event => heard.push(event))
  fake.emitClose(1)
  const stops = heard.filter(e => e.kind === 'stopped')
  assert.equal(stops.length, 1)
  const reason = (stops[0] as { reason?: string }).reason ?? ''
  assert.match(reason, /exited \(1\)/)
  assert.match(reason, /speech engine/)
  // The service forgot the dead child — stop now says it plainly.
  assert.equal(service.stop().ok, false)
})

test('spawn refusing synchronously answers with the failure, never a lie', () => {
  const service = createDictationService({
    platform: 'win32',
    spawnImpl: () => { throw new Error('ENOENT: powershell.exe not found') },
  })
  const start = service.start(() => undefined)
  assert.equal(start.ok, false)
  assert.match(start.answer, /ENOENT/)
  assert.match(start.answer, /Nothing was recorded/)
})
