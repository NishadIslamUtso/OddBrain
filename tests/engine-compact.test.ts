// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { spawn } from 'node:child_process'
import type { EngineEvent } from '../src/shared/lib/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import {
  BRIEF_ORDER,
  briefFileContent,
  briefWorthKeeping,
  buildSeededPrompt,
  compactFileName,
  countWords,
} from '../src/shared/lib/compact'
import { createEngineSocket } from '../src/main/engine/socket'
import { createCompactManager } from '../src/main/compact'
import { resetEngineForTests, engineStore } from '../src/renderer/src/state/engine'
import {
  cancelBrief,
  compactState,
  finishCompact,
  seedWrap,
  useCompact,
  writeBrief,
} from '../src/renderer/src/state/compact'

/**
 * Compaction: a long conversation becomes a brief, the session ends fresh,
 * the brief rides along. Two honest steps, both visible; any refusal leaves
 * the conversation exactly as it was. The brief is the ENGINE's own words;
 * the fresh start (stop + forget the resume id) is the app's — without the
 * forget, --resume would drag the whole long conversation right back in.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

/** Wait for the engine's current turn to close, the way a person would. */
const settleStore = async (): Promise<void> => {
  for (let i = 0; i < 200; i++) {
    const turn = engineStore().turn
    if (turn && turn.state !== 'running') return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

const BRIEF = 'ASKED: fix the loop. DECIDED: guard first. DONE: patched, test green. NEXT: push the branch.'

test('the seeded prompt carries the brief as context and the task as the task', () => {
  const seeded = buildSeededPrompt(BRIEF, 'now push it')
  assert.match(seeded, /\[Handoff brief from the previous conversation/)
  assert.match(seeded, /guard first/)
  assert.match(seeded, /\[The task\]\nnow push it/)
  assert.ok(seeded.indexOf('[The task]') > seeded.indexOf('guard first'), 'the task comes after the context')
  assert.equal(countWords(' one  two\nthree '), 3)
  assert.match(compactFileName(1700000000000), /^1700000000000-brief\.md$/)
  const file = briefFileContent(BRIEF, 'C:\\work', '2026-10-16T00:00:00Z')
  assert.match(file, /# Handoff brief/)
  assert.match(file, /Poured 2026-10-16T00:00:00Z/)
  assert.match(file, /Workspace: C:\\\\work|Workspace: C:.work/)
  assert.match(file, /NEXT: push/)
  assert.equal(briefWorthKeeping(BRIEF), true)
  assert.equal(briefWorthKeeping('ok'), false, 'a one-word brief carries nothing')
  assert.equal(briefWorthKeeping('   '), false)
  assert.match(BRIEF_ORDER, /ASKED, DECIDED, DONE, NEXT/)
})

test('fresh ends the session AND forgets its resume id, or --resume drags it all back', () => {
  const saved: Record<string, string> = {}
  const memory = {
    load: (cwd: string): string => saved[cwd] ?? '',
    save: (cwd: string, id: string): void => {
      saved[cwd] = id
    },
  }
  const spawnFactory = () => {
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
    const captured: string[] = []
    const spawnMock = ((_command: string, args: string[]) => {
      captured.push(...args)
      return child
    }) as unknown as typeof spawn
    return { child, captured, spawnMock }
  }

  const first = spawnFactory()
  const socket = createEngineSocket(memory)
  socket.send('the long conversation', { cwd: 'C:\\work', settings: DEFAULT_ENGINE, onEvent: () => undefined, spawnProcess: first.spawnMock })
  first.child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-long' })}\n`, 'utf8'))
  assert.equal(saved['claude-code::C:\\work'], 's-long')

  socket.fresh()
  assert.equal(saved['claude-code::C:\\work'], '', 'the resume id is forgotten, not merely the process stopped')

  const second = spawnFactory()
  socket.send('the next task', { cwd: 'C:\\work', settings: DEFAULT_ENGINE, onEvent: () => undefined, spawnProcess: second.spawnMock })
  assert.ok(!second.captured.includes('--resume'), 'a fresh start must not resume the long thread')
})

test('the brief folder: saved as plain markdown, refusals say why', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'compact-'))
  const manager = createCompactManager(dir)
  const empty = await manager.save({ brief: '   ' })
  assert.equal(empty.ok, false)
  const kept = await manager.save({ brief: BRIEF, workspace: 'C:\\work', at: '2026-10-16T15:00:00Z' })
  assert.ok(kept.ok)
  const files = await readdir(dir)
  assert.equal(files.length, 1)
  assert.match(files[0] ?? '', /-brief\.md$/)
  const text = await readFile(join(dir, files[0] ?? ''), 'utf8')
  assert.match(text, /Poured 2026-10-16T15:00:00Z/)
  assert.match(text, /DECIDED: guard first/)
  await rm(dir, { recursive: true, force: true })
})

type FakeApi = {
  listener: ((event: EngineEvent) => void) | null
  sent: Array<{ prompt: string; cwd: string }>
  saves: Array<{ brief: string; workspace: string }>
  freshed: number
  briefText: string
  failTurn: boolean
}

function withFakeCompactEngine(): FakeApi {
  const fake: FakeApi = { listener: null, sent: [], saves: [], freshed: 0, briefText: BRIEF, failTurn: false }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'gemma4:cloud', baseUrl: '', workspace: 'C:\\work', approval: 'ask' },
      running: true,
      history: [],
    }),
    models: async () => ({ ok: true, models: [{ name: 'gemma4:cloud', cloud: true, sizeGB: null }] }),
    setModel: async () => ({ ok: true, answer: 'brain set' }),
    send: async (prompt: string, cwd: string) => {
      fake.sent.push({ prompt, cwd })
      if (fake.failTurn) {
        setTimeout(() => fake.listener?.({ kind: 'error', text: 'the brain is not answering' } as EngineEvent), 15)
        return { ok: true, answer: 'started' }
      }
      setTimeout(() => {
        fake.listener?.({ kind: 'delta', text: fake.briefText } as EngineEvent)
        fake.listener?.({ kind: 'done', text: fake.briefText, usage: { inTokens: 90, outTokens: 60, durationMs: 400, costUsd: 0.0002 } } as EngineEvent)
      }, 15)
      return { ok: true, answer: 'started' }
    },
    answer: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    fresh: async () => {
      fake.freshed += 1
      return { ok: true, answer: 'fresh' }
    },
    compact: {
      save: async (input: { brief: string; workspace: string }) => {
        fake.saves.push({ brief: input.brief, workspace: input.workspace })
        return { ok: true, answer: 'Brief saved: C:\\briefs\\1-brief.md', file: '1-brief.md' }
      },
    },
    onEvent: (listener: (event: EngineEvent) => void) => {
      fake.listener = listener
      return () => undefined
    },
    onPullEvent: () => () => undefined,
    recipes: {
      list: async () => ({ ok: true, recipes: [], broken: [] }),
      save: async () => ({ ok: true, answer: 'saved' }),
      remove: async () => ({ ok: true, answer: 'removed' }),
    },
  }
  return fake
}

test('compaction end to end: the brief turn, the shown brief, the save, the fresh, the seed', async () => {
  const fake = withFakeCompactEngine()
  resetEngineForTests()
  const store = engineStore()
  // A conversation must exist before anything can be poured.
  await store.send('the real work of the morning')
  await settleStore()
  assert.equal(compactState().phase, 'idle')

  const poured = await writeBrief()
  assert.ok(poured)
  assert.equal(fake.sent[1]?.prompt, BRIEF_ORDER, 'the brief order is sent word for word')
  assert.equal(fake.saves.length, 0, 'nothing is saved before the owner has seen the brief')
  assert.equal(fake.freshed, 0, 'no session has ended yet')
  assert.equal(compactState().phase, 'ready')
  assert.match(compactState().brief, /NEXT: push/)
  assert.equal(compactState().words > 5, true)

  const done = await finishCompact()
  assert.ok(done)
  assert.equal(fake.saves.length, 1, 'the receipt is kept')
  assert.equal(fake.saves[0]?.workspace, 'C:\\work')
  assert.equal(fake.freshed, 1, 'the session ended and its resume id was forgotten')

  // The very next send rides with the brief — and only that send.
  const seeded = seedWrap('now push it')
  assert.match(seeded, /\[Handoff brief from the previous conversation/)
  assert.match(seeded, /\[The task\]\nnow push it/)
  assert.equal(seedWrap('another task'), 'another task', 'the seed rides exactly once')
  assert.match(compactState().notice, /rides along|rode along/)
})

test('a failed brief turn changes nothing: no save, no fresh, the session stands', async () => {
  const fake = withFakeCompactEngine()
  fake.failTurn = true
  resetEngineForTests()
  const store = engineStore()
  await store.send('work in progress')
  await settleStore()
  const poured = await writeBrief()
  assert.equal(poured, false)
  assert.match(compactState().error, /could not write the brief|nothing was changed/i)
  assert.equal(fake.saves.length, 0)
  const done = await finishCompact()
  assert.equal(done, false, 'compaction cannot end a session whose brief never existed')
  assert.equal(fake.freshed, 0)
})

test('a too-small brief is refused before anything ends', async () => {
  const fake = withFakeCompactEngine()
  fake.briefText = 'ok.'
  resetEngineForTests()
  const store = engineStore()
  await store.send('some work')
  await settleStore()
  const poured = await writeBrief()
  assert.equal(poured, false)
  assert.match(compactState().error, /said too little|Nothing was changed/i)
  assert.equal(fake.freshed, 0)
})

test('no conversation, no compaction: the honest gate', async () => {
  withFakeCompactEngine()
  resetEngineForTests()
  resetEngineForTests()
  const poured = await writeBrief()
  assert.equal(poured, false)
  assert.match(compactState().error, /Nothing has been said/)
  cancelBrief()
  void useCompact
})
