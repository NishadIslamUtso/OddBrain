// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { spawn } from 'node:child_process'
import type { EngineEvent, EngineUsage } from '../src/shared/lib/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import { formatTotals, turnCopyText } from '../src/shared/lib/turnCopy'
import { clipForJournal, createJournalManager, JOURNAL_CAP } from '../src/main/journal'
import { startClaudeCodeSession } from '../src/main/engine/claudeCode'
import { normalizeEngine } from '../src/shared/lib/engine'
import { resetEngineForTests, engineStore, registerLineHold } from '../src/renderer/src/state/engine'

/**
 * The finale batch, five small honed pieces:
 *  - copy/edit: the turn as text, the order back in the composer
 *  - extended thinking: the engine's own MAX_THINKING_TOKENS, set at launch
 *  - context visibility: the window's honest totals, on the card
 *  - the line: work orders parked while the engine works, run in order
 *  - the journal: finished turns kept as a record a reopened window can read
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

// ---------- copy/edit ----------

test('the turn copies as the order plus the words; totals format honestly', () => {
  const text = turnCopyText('Fix the loop.', [
    { kind: 'status', text: 'engine ready' },
    { kind: 'text', text: 'Patched the guard.' },
    { kind: 'tool', name: 'Edit', summary: 'loop.ts' },
    { kind: 'text', text: 'Test green.' },
  ])
  assert.match(text, /^Work order: Fix the loop\./)
  assert.match(text, /Patched the guard\.\n\nTest green\./)
  assert.doesNotMatch(text, /engine ready|loop\.ts/, 'statuses and tool rows are not the engine\u2019s words')
  const empty = turnCopyText('x', [])
  assert.match(empty, /said nothing/)
  assert.equal(formatTotals({ turns: 0, inTokens: 0, outTokens: 0, costUsd: 0 }), '0 turns this window · 0 in · 0 out')
  assert.equal(formatTotals({ turns: 1, inTokens: 12, outTokens: 34, costUsd: 0.0001 }), '1 turn this window · 12 in · 34 out · $0.0001')
})

// ---------- extended thinking ----------

function fakeEngineChild() {
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
  child.stdin = { write: () => true }
  child.killed = false
  child.exitCode = null
  child.signalCode = null
  child.kill = function kill() {
    this.killed = true
    this.emit('close', 0)
  }
  return child
}

test('extended thinking sets the engine\u2019s own env at launch; default sets nothing', () => {
  const seen: Array<Record<string, string | undefined>> = []
  const makeSpawn = () =>
    ((_command: string, _args: string[], options?: { env?: Record<string, string> }) => {
      seen.push(options?.env)
      const child = fakeEngineChild()
      setTimeout(() => child.emit('close', 0), 5)
      return child
    }) as unknown as typeof spawn
  const extended = startClaudeCodeSession({
    cwd: '.', settings: { ...DEFAULT_ENGINE, thinking: 'extended' }, onEvent: () => undefined, spawnProcess: makeSpawn(),
  })
  extended.stop()
  assert.equal(seen[0]?.MAX_THINKING_TOKENS, '31999')
  const plain = startClaudeCodeSession({
    cwd: '.', settings: { ...DEFAULT_ENGINE }, onEvent: () => undefined, spawnProcess: makeSpawn(),
  })
  plain.stop()
  assert.equal(seen[1]?.MAX_THINKING_TOKENS, undefined, 'default thinking leaves the engine alone')
  assert.equal(normalizeEngine({ ...DEFAULT_ENGINE, thinking: 'extended' }).thinking, 'extended')
  assert.equal(normalizeEngine({ ...DEFAULT_ENGINE, thinking: 'wild' as never }).thinking, 'default')
})

// ---------- context totals ----------

type CoreFake = {
  listener: ((event: EngineEvent) => void) | null
  sent: string[]
  sentPictures: unknown[]
  journalKept: Array<{ prompt: string; answer: string }>
  thinking: string | null
  usage: EngineUsage | null
  busyHold: boolean
}

function withCoreFake(): CoreFake {
  const fake: CoreFake = { listener: null, sent: [], sentPictures: [], journalKept: [], thinking: null, usage: { inTokens: 100, outTokens: 50, durationMs: 300, costUsd: 0.002 }, busyHold: false }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'gemma4:cloud', baseUrl: '', workspace: 'C:\\work', approval: 'ask', thinking: fake.thinking ?? 'default' },
      running: true,
      history: [],
    }),
    models: async () => ({ ok: true, models: [] }),
    setModel: async () => ({ ok: true, answer: 'brain set' }),
    setApproval: async () => ({ ok: true, answer: 'mode' }),
    setThinking: async (mode: string) => {
      fake.thinking = mode
      return { ok: true, answer: mode }
    },
    send: async (prompt: string, _cwd?: string, pictures?: unknown) => {
      fake.sent.push(prompt)
      fake.sentPictures.push(pictures)
      if (!fake.busyHold) {
        setTimeout(() => {
          if (fake.usage) fake.listener?.({ kind: 'delta', text: 'the answer' } as EngineEvent)
          fake.listener?.(
            fake.usage
              ? ({ kind: 'done', text: 'the answer', usage: fake.usage } as EngineEvent)
              : ({ kind: 'error', text: 'it broke' } as EngineEvent),
          )
        }, 15)
      }
      return { ok: true, answer: 'started' }
    },
    answer: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    onEvent: (listener: (event: EngineEvent) => void) => {
      fake.listener = listener
      return () => undefined
    },
    onPullEvent: () => () => undefined,
    journal: {
      list: async () => ({ ok: true, entries: [] }),
      append: async (entry: { prompt: string; answer: string }) => {
        fake.journalKept.push(entry)
        return { ok: true, answer: 'Kept.' }
      },
      clear: async () => ({ ok: true, answer: 'cleared' }),
    },
  }
  return fake
}

const settleStore = async (): Promise<void> => {
  for (let i = 0; i < 200; i++) {
    const turn = engineStore().turn
    if (turn && turn.state !== 'running') return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

test('the totals accumulate across turns, honestly scoped to the window', async () => {
  withCoreFake()
  resetEngineForTests()
  const store = engineStore()
  await store.send('first task')
  await settleStore()
  assert.equal(store.totals.turns, 1)
  assert.equal(store.totals.inTokens, 100)
  await store.send('second task')
  await settleStore()
  assert.equal(store.totals.turns, 2)
  assert.equal(store.totals.inTokens, 200)
  assert.equal(store.totals.outTokens, 100)
  assert.ok(store.totals.costUsd > 0.003)
})

// ---------- the line ----------

test('the line: busy sends park, drain in order when the engine frees, holds stop the drain', async () => {
  const fake = withCoreFake()
  fake.busyHold = true // sends start but never finish until we let them
  resetEngineForTests()
  const store = engineStore()
  await store.send('the running task')
  const one = store.enqueue('parked one')
  const queuedPictures = [{ mime: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p5sAAAAASUVORK5CYII=' }]
  const two = store.enqueue('parked two', queuedPictures)
  assert.equal(store.line.length, 2)
  assert.equal(fake.sent.length, 1, 'parked work orders are not sent while the engine works')
  store.removeFromLine(one.id)
  assert.equal(store.line.length, 1)
  assert.equal(store.line[0]?.prompt, 'parked two')
  // Hold: a sequencer is driving; the line must not jump in between its steps.
  const release = registerLineHold(() => true)
  fake.busyHold = false
  fake.listener?.({ kind: 'done', text: 'the answer', usage: { inTokens: 10, outTokens: 5, durationMs: 10, costUsd: 0.0001 } } as EngineEvent)
  await new Promise(resolve => setTimeout(resolve, 800))
  assert.equal(fake.sent.length, 1, 'the held line does not drain between a sequencer\u2019s steps')
  release()
  // Nudge the drain the way a closing turn would.
  const turn = engineStore().turn
  assert.ok(turn)
  // Drain re-runs on the next close; simulate by ending the (already done) turn's successor:
  await store.send('a fresh task')
  await settleStore()
  await new Promise(resolve => setTimeout(resolve, 800))
  assert.equal(fake.sent.length, 3, 'the parked order ran after the engine freed up')
  assert.match(fake.sent[2] ?? '', /parked two/)
  assert.deepEqual(fake.sentPictures[2], queuedPictures, 'pictures survive the busy queue and ride with their work order')
  assert.equal(store.line.length, 0)
})

// ---------- the journal ----------

test('the journal: kept, listed newest-first, capped, cleared, damaged means empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'journal-'))
  const file = join(dir, 'engine-journal.json')
  const manager = createJournalManager(file)
  const empty = await manager.append({ prompt: '   ' })
  assert.equal(empty.ok, false)
  for (let index = 0; index < JOURNAL_CAP + 5; index++) {
    await manager.append({ prompt: `task ${index}`, answer: `done ${index}`, usage: '10 in · 5 out', workspace: 'C:\\work' })
  }
  const listed = await manager.list()
  assert.equal(listed.entries.length, JOURNAL_CAP, 'the cap holds')
  assert.match(listed.entries[0]?.prompt ?? '', /task 6[0-9]/, 'newest first; the oldest fell off')
  const long = 'x'.repeat(1000)
  const kept = await manager.append({ prompt: long, answer: long })
  assert.ok(kept.ok, kept.answer)
  const reread = JSON.parse(await readFile(file, 'utf8')) as Array<{ prompt: string }>
  assert.ok((reread.at(-1)?.prompt.length ?? 0) < 500, 'long lines are clipped, not refused')
  await writeFile(file, '{broken', 'utf8')
  const after = await manager.list()
  assert.deepEqual(after.entries, [], 'a damaged file is an empty record, never a crash')
  const cleared = await manager.clear()
  assert.ok(cleared.ok)
  const final = await manager.list()
  assert.deepEqual(final.entries, [])
  await rm(dir, { recursive: true, force: true })
})

test('a finished turn is journaled once, with the engine\u2019s own words and usage', async () => {
  const fake = withCoreFake()
  resetEngineForTests()
  const store = engineStore()
  await store.send('the task of record')
  await settleStore()
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(fake.journalKept.length, 1, 'recorded once, whichever event closed the turn')
  assert.equal(fake.journalKept[0]?.prompt, 'the task of record')
  assert.match(fake.journalKept[0]?.answer ?? '', /the answer/)
  // A second closing event for the same turn adds nothing.
  const turn = store.turn
  assert.ok(turn)
  store.ingest({ kind: 'closed' } as EngineEvent)
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(fake.journalKept.length, 1)
})

// ---------- wiring ----------
