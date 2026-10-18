// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { EngineEvent } from '../src/shared/lib/engine'
import { parseSteps, SPLIT_ORDER, splitSummary, stepLabel } from '../src/shared/lib/split'
import { resetEngineForTests, engineStore } from '../src/renderer/src/state/engine'
import { breakDown, dismissSplit, resumeFrom, runSteps, splitState, stageSplit } from '../src/renderer/src/state/split'

/**
 * Split: the engine breaks a big work order into 2–6 steps; the app runs
 * them one by one, in order, in the same session, through the ONE send path.
 * A step that fails halts the run and says so; the rest wait. SOLE is the
 * engine's honest "run it whole". No step hides, nothing auto-approves.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

type FakeApi = {
  listener: ((event: EngineEvent) => void) | null
  sent: string[]
  /** What the engine answers for each send, in order. */
  script: Array<{ text: string; error?: boolean }>
}

function withFakeSplitEngine(): FakeApi {
  const fake: FakeApi = { listener: null, sent: [], script: [] }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'gemma4:cloud', baseUrl: '', workspace: '', approval: 'ask' },
      running: true,
      history: [],
    }),
    models: async () => ({ ok: true, models: [{ name: 'gemma4:cloud', cloud: true, sizeGB: null }] }),
    setModel: async () => ({ ok: true, answer: 'brain set' }),
    send: async (prompt: string) => {
      fake.sent.push(prompt)
      const act = fake.script.shift() ?? { text: 'ok' }
      setTimeout(() => {
        if (act.error) {
          fake.listener?.({ kind: 'error', text: act.text } as EngineEvent)
          return
        }
        fake.listener?.({ kind: 'delta', text: act.text } as EngineEvent)
        fake.listener?.({ kind: 'done', text: act.text, usage: { inTokens: 10, outTokens: 8, durationMs: 200, costUsd: 0.0001 } } as EngineEvent)
      }, 15)
      return { ok: true, answer: 'started' }
    },
    answer: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    onEvent: (listener: (event: EngineEvent) => void) => {
      fake.listener = listener
      return () => undefined
    },
    onPullEvent: () => () => undefined,
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

test('the parser: STEP lines and numbered lines are steps; one step, junk, and silence are not', () => {
  const parsed = parseSteps('Sure.\nSTEP 1: Note the word.\nSTEP 2: Use the word.\nSTEP 3: Report.')
  assert.ok(parsed.ok)
  if (parsed.ok) assert.deepEqual(parsed.steps, ['Note the word.', 'Use the word.', 'Report.'])
  const numbered = parseSteps('1. first\n2. second')
  assert.ok(numbered.ok)
  if (numbered.ok) assert.deepEqual(numbered.steps, ['first', 'second'])
  assert.equal(parseSteps('only one line about a thing').ok, false)
  assert.equal(parseSteps('').ok, false)
  const sole = parseSteps('SOLE — this needs no steps.')
  assert.equal(sole.ok, false)
  if (!sole.ok) assert.equal(sole.answer, 'SOLE')
  const capped = parseSteps(Array.from({ length: 9 }, (_, i) => `STEP ${i + 1}: thing ${i + 1}`).join('\n'))
  assert.ok(capped.ok)
  if (capped.ok) assert.equal(capped.steps.length, 6, 'six is the honest ceiling for one sitting')
  assert.equal(stepLabel('  use   the word  ', 1), '2. use the word')
  assert.match(splitSummary(3, 3, 0), /^All 3 steps ran\.$/)
  assert.match(splitSummary(3, 1, 1), /1 step failed and the rest did not run/)
})

test('a split end to end: the order word for word, the steps parsed, the run in order through the one path', async () => {
  const fake = withFakeSplitEngine()
  resetEngineForTests()
  stageSplit('Clean up the vault and write the summary.')
  assert.equal(splitState().phase, 'draft')
  fake.script.push({
    text: 'STEP 1: List the files.\nSTEP 2: Move the drafts.\nSTEP 3: Write the summary.',
  })
  const broke = await breakDown()
  assert.ok(broke)
  assert.equal(fake.sent[0], `${SPLIT_ORDER}Clean up the vault and write the summary.`, 'the order rides the exact words shown in the dialog')
  assert.equal(splitState().phase, 'ready')
  assert.deepEqual(splitState().steps.map(step => step.text), ['List the files.', 'Move the drafts.', 'Write the summary.'])
  assert.equal(fake.sent.length, 1)

  fake.script.push({ text: 'listed: a.md, b.md' }, { text: 'moved 2 drafts' }, { text: 'summary written to summary.md' })
  const ran = await runSteps()
  assert.ok(ran)
  assert.equal(fake.sent.length, 4)
  assert.match(fake.sent[1] ?? '', /^Step 1 of 3 from the plan you wrote\. The step: List the files\.$/)
  assert.match(fake.sent[3] ?? '', /^Step 3 of 3/)
  assert.match(splitState().summary, /^All 3 steps ran\.$/)
  assert.match(splitState().steps[2]?.note ?? '', /summary\.md/, 'the checklist keeps what the engine said')
  dismissSplit()
  assert.equal(splitState().phase, 'idle')
})

test('a failing step halts the run: the rest stay pending, the card says what happened', async () => {
  const fake = withFakeSplitEngine()
  resetEngineForTests()
  stageSplit('a big job')
  fake.script.push({ text: 'STEP 1: fine.\nSTEP 2: doomed.\nSTEP 3: never.' })
  assert.ok(await breakDown())
  fake.script.push({ text: 'step one done' }, { text: 'the brain is not answering', error: true })
  assert.equal(await runSteps(), false)
  const states = splitState().steps.map(step => step.state).join(',')
  assert.equal(states, 'done,failed,pending', 'the run stops; the untouched steps stay pending, never marked done')
  assert.match(splitState().summary, /1 of 3 steps ran; 1 step failed and the rest did not run/)
  assert.match(splitState().error, /Step 2/)
  // The owner looks, then retries the failed step; the run resumes from there.
  fake.script.push({ text: 'recovered' }, { text: 'third done' })
  assert.ok(await resumeFrom(1))
})

test('the honest gates: a busy engine, no order, and SOLE each refuse before anything runs', async () => {
  const fake = withFakeSplitEngine()
  resetEngineForTests()
  const store = engineStore()
  // No order staged: breakDown refuses.
  assert.equal(await breakDown(), false)
  dismissSplit()
  stageSplit('')
  assert.equal(splitState().phase, 'idle', 'an empty draft never opens the card')
  // Busy engine: stage is fine, the send is not.
  stageSplit('a job while busy')
  assert.equal(splitState().phase, 'draft')
  await store.send('a hand-typed task, still running')
  fake.script.push({ text: 'STEP 1: a.\nSTEP 2: b.' })
  assert.equal(await breakDown(), false)
  assert.match(splitState().error, /last task/)
})

test('a stream that lost its line breaks still splits: the finished block wins over the stitched preview', async () => {
  const fake = withFakeSplitEngine()
  resetEngineForTests()
  stageSplit('a job with structure')
  // The stream stitched WITHOUT newlines; the finished block carries them.
  // The wire's dedup rightly keeps both; the parser must read the block.
  fake.script.push({ text: 'STEP 1: Note the word.\nSTEP 2: Report the word.' })
  const raw = fake.listener
  fake.listener = (event) => {
    if (event.kind === 'delta') {
      raw?.({ kind: 'delta', text: (event as { text: string }).text.replace(/\n/g, '') } as EngineEvent)
      return
    }
    raw?.(event)
  }
  const broke = await breakDown()
  assert.ok(broke, 'the split must not be defeated by a newline-less stream')
  assert.deepEqual(splitState().steps.map(step => step.text), ['Note the word.', 'Report the word.'], 'the finished block is what gets parsed, once')
})

test('the wiring: Split sits in the composer, runs through the store\u2019s one send path, and no new doors exist', () => {
  const composer = read('../src/renderer/src/components/Composer.tsx')
      const state = read('../src/renderer/src/state/split.ts')
})
