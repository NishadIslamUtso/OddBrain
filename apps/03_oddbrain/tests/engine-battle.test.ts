// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import type { EngineEvent } from '../src/shared/lib/engine'
import { resetEngineForTests, engineStore } from '../src/renderer/src/state/engine'
import { runBattle, pickWinner, dismissBattle, battleState } from '../src/renderer/src/state/battle'

/**
 * Brain battles: one work order, two brains, the person picks — Arena's
 * trick, built where only a harness can. Sequential runs, blind until the
 * pick, a private local tally, and the composer's brain never silently
 * changes. Plus the honest bump counter and the ghost checkpoint (a file
 * the engine created from nothing can be restored to nothing).
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

type FakeApi = {
  listener: ((event: EngineEvent) => void) | null
  sent: Array<{ prompt: string; cwd: string; pictures: unknown }>
  modelNow: string
  switched: string[]
  recorded: Array<{ prompt: string; winner: string; loser: string; tie: boolean }>
}

function withFakeBattleEngine(): FakeApi {
  const fake: FakeApi = { listener: null, sent: [], modelNow: 'gemma4:cloud', switched: [], recorded: [] }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: fake.modelNow, baseUrl: '', workspace: '', approval: 'ask' },
      running: true,
      history: [],
    }),
    models: async () => ({ ok: true, models: [{ name: 'gemma4:cloud', cloud: true, sizeGB: null }, { name: 'qwen2.5-coder:3b', cloud: false, sizeGB: null }] }),
    setModel: async (model: string) => {
      fake.switched.push(model)
      fake.modelNow = model
      return { ok: true, answer: `brain set to ${model}` }
    },
    send: async (prompt: string, cwd: string, pictures?: unknown) => {
      fake.sent.push({ prompt, cwd, pictures })
      return { ok: true, answer: 'started' }
    },
    answer: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    onEvent: (listener: (event: EngineEvent) => void) => {
      fake.listener = listener
      return () => undefined
    },
    onPullEvent: () => () => undefined,
    battle: {
      record: async (entry: { prompt: string; winner: string; loser: string; tie: boolean }) => {
        fake.recorded.push(entry)
        return { ok: true, answer: `Recorded. ${entry.winner || 'A tie'} leads this prompt now.` }
      },
      ledger: async () => ({ ok: true, entries: [] }),
    },
    checkpoints: { list: async () => ({ ok: true, checkpoints: [] }), restore: async () => ({ ok: false, answer: '' }) },
    detect: async () => [],
    pick: async () => ({ ok: true, answer: '' }),
    pull: async () => ({ ok: false, answer: '' }),
    deleteModel: async () => ({ ok: false, answer: '' }),
    pickWorkspace: async () => ({ ok: true, answer: '' }),
    setApproval: async () => ({ ok: true, answer: '' }),
  }
  return fake
}

/** Answer the pending turn as a brain would, with its own words. */
function speak(fake: FakeApi, words: string): void {
  fake.listener?.({ kind: 'delta', text: words })
  fake.listener?.({ kind: 'done', text: words, usage: { inTokens: 10, outTokens: 8, durationMs: 900, costUsd: 0 } })
}

/** Wait until the battle reaches a stage, so the runner is waiting on us. */
async function untilStage(stage: string, cap = 4000): Promise<void> {
  const started = Date.now()
  while (battleState().stage !== stage && Date.now() - started < cap) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

test('a battle: two brains in sequence, blind pick, private tally, brain restored', async () => {
  const fake = withFakeBattleEngine()
  resetEngineForTests()
  const store = engineStore()
  await store.init()
  dismissBattle()

  const running = runBattle('Which note app is honest?', 'qwen2.5-coder:3b')
  await untilStage('First brain, at work…')
  speak(fake, 'The one that shows its numbers.')
  await untilStage('Second brain, same question…')
  speak(fake, 'The one that keeps its promises.')
  await running

  assert.equal(fake.sent.length, 2, 'the same work order went twice')
  assert.equal(fake.sent[0].prompt, fake.sent[1].prompt)
  assert.deepEqual(fake.switched, ['qwen2.5-coder:3b', 'gemma4:cloud'], 'switch to the challenger, back to the owner\u2019s brain')

  const state = battleState()
  assert.ok(state.a && state.b)
  assert.equal(state.a.answer, 'The one that shows its numbers.')
  assert.equal(state.b.answer, 'The one that keeps its promises.')
  assert.equal(state.a.usage.includes('10 in'), true, 'the engine\u2019s own usage rides with each answer')
  assert.equal(state.blind, true, 'blind until the pick')
  assert.equal(state.picked, '')

  // The pick lifts the blindfold and writes the private tally.
  await pickWinner('b')
  const after = battleState()
  assert.equal(after.picked, 'b')
  assert.equal(after.blind, false, 'the pick reveals the names')
  assert.match(after.saved, /private tally|Recorded/)
  assert.equal(fake.recorded.length, 1)
  assert.equal(fake.recorded[0].winner, 'qwen2.5-coder:3b')
  assert.equal(fake.recorded[0].loser, 'gemma4:cloud')
  assert.equal(fake.recorded[0].blind, true, 'the vote was blind when cast')
}, { timeout: 20000 })

test('a failed second run names it and still restores the owner\u2019s brain', async () => {
  const fake = withFakeBattleEngine()
  resetEngineForTests()
  const store = engineStore()
  await store.init()
  dismissBattle()

  const running = runBattle('prompt two', 'qwen2.5-coder:3b')
  await untilStage('First brain, at work…')
  speak(fake, 'first answer')
  await untilStage('Second brain, same question…')
  fake.listener?.({ kind: 'error', text: 'the door refused' })
  await running

  const state = battleState()
  assert.match(state.b?.error ?? '', /door refused/, 'the failure rides on the failing side')
  assert.deepEqual(fake.switched, ['qwen2.5-coder:3b', 'gemma4:cloud'], 'the owner\u2019s brain came back even in defeat')
}, { timeout: 20000 })

test('a tie records without a winner', async () => {
  const fake = withFakeBattleEngine()
  resetEngineForTests()
  const store = engineStore()
  await store.init()
  dismissBattle()

  const running = runBattle('prompt three', 'qwen2.5-coder:3b')
  await untilStage('First brain, at work…')
  speak(fake, 'one')
  await untilStage('Second brain, same question…')
  speak(fake, 'two')
  await running
  await pickWinner('tie')
  const state = battleState()
  assert.equal(state.picked, 'tie')
  assert.equal(fake.recorded[0]?.tie, true)
  assert.equal(fake.recorded[0]?.winner, '')
}, { timeout: 20000 })

test('the battle card is wired where a person can reach it, blind by design', () => {
  const composer = read('../src/renderer/src/components/Composer.tsx')
    })

test('the honest bump counter counts tool failures and retries', async () => {
  const fake = withFakeBattleEngine()
  resetEngineForTests()
  const store = engineStore()
  await store.send('work that bumps')
  fake.listener?.({ kind: 'status', text: 'a tool call failed: permission denied on ./x' })
  fake.listener?.({ kind: 'status', text: 'api retry, attempt 2' })
  fake.listener?.({ kind: 'status', text: 'engine ready' })
  const turn = store.turn
  assert.ok(turn)
  assert.equal(turn.bumps, 2, 'two bumps; the ready line does not count')
  fake.listener?.({ kind: 'done', text: 'fine now' })
})

test('a ghost checkpoint restores to nothing: the engine-created file is deleted', async () => {
  const { takeCheckpoint, restoreCheckpoint } = await import('../src/main/engine/checkpoints')
  const dir = await mkdtemp(join(tmpdir(), 'ghost-'))
  const target = join(dir, 'created-by-engine.md')
  // The checkpoint taken BEFORE the file exists is a ghost.
  const ghost = await takeCheckpoint(dir, target, 1729075200000)
  assert.ok(ghost)
  assert.equal(ghost?.existed, false)
  assert.equal(ghost?.copy, '')
  // The engine creates it.
  await writeFile(target, 'the engine made me')
  // Restore the ghost: the created file goes away.
  const answer = await restoreCheckpoint(dir, '')
  assert.equal(answer.ok, true, answer.answer)
  await assert.rejects(() => access(target), 'the created file is gone, as if the engine never wrote it')
  // A real checkpoint is untouched by a ghost restore with nothing left.
  const real = join(dir, 'real.md')
  await writeFile(real, 'old words')
  const kept = await takeCheckpoint(dir, real, 1729075200001)
  assert.equal(kept?.existed, true)
  const again = await restoreCheckpoint(dir, '')
  // The ghost's record was used up by the first restore, so the second one
  // honestly reports that there is nothing left to remove.
  assert.equal(again.ok, false)
  assert.match(again.answer, /No record says/)
  assert.equal(await readFile(real, 'utf8'), 'old words', 'the real file stood untouched')
  await rm(dir, { recursive: true, force: true })
})
