import { useSyncExternalStore } from 'react'
import { getEngineApi } from '@/platform/bridge'
import { engineStore } from './engine'
import { registerLineHold } from './engine'

/**
 * Brain battles, the app's own.
 *
 * From Arena.ai's trick — one prompt, two models, the person picks — built
 * where only a harness can build it: no single engine can battle brains
 * against each other. The runs are sequential (the engine works one task at
 * a time), the pick is blind until it is made, and the tally is a private
 * local ledger: real counts for one person, never a public scoreboard.
 */

export type BattleSide = {
  model: string
  answer: string
  usage: string
  ms: number
  error: string
}

export type BattleState = {
  active: boolean
  prompt: string
  stage: string
  /** Identities hidden until the pick, so brand loyalty cannot vote. */
  blind: boolean
  a: BattleSide | null
  b: BattleSide | null
  picked: '' | 'a' | 'b' | 'tie'
  originalModel: string
  error: string
  saved: string
}

const initial: BattleState = {
  active: false,
  prompt: '',
  stage: '',
  blind: true,
  a: null,
  b: null,
  picked: '',
  originalModel: '',
  error: '',
  saved: '',
}

let state: BattleState = initial
let version = 0
const listeners = new Set<() => void>()

// While a battle drives its two sides, the line holds.
registerLineHold(() => state.active)

const emit = (): void => {
  version += 1
  for (const listener of listeners) listener()
}

const patch = (part: Partial<BattleState>): void => {
  state = { ...state, ...part }
  emit()
}

/** Wait for the engine's turn to end; return what it said and what it cost. */
async function settle(timeoutMs = 300_000): Promise<{ answer: string; usage: string; ms: number; error: string }> {
  const store = engineStore()
  const started = Date.now()
  for (;;) {
    const turn = store.turn
    if (!turn) throw new Error('The engine lost the thread of the battle.')
    if (turn.state === 'done' || turn.state === 'error') {
      const texts = turn.items.filter(item => item.kind === 'text')
      const answer = texts.map(item => item.text).join('\n').trim()
      const usage = turn.usage
        ? `${turn.usage.inTokens.toLocaleString()} in · ${turn.usage.outTokens.toLocaleString()} out`
        : ''
      return {
        answer,
        usage,
        ms: Date.now() - started,
        error: turn.state === 'error' ? (turn.items.filter(item => item.kind === 'error').at(-1)?.text ?? 'the turn failed') : '',
      }
    }
    if (Date.now() - started > timeoutMs) throw new Error('The battle ran past five minutes and was called off.')
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

/** Run one work order on two brains, in sequence, and hold both answers. */
export async function runBattle(prompt: string, opponent: string): Promise<void> {
  const store = engineStore()
  if (state.active) return
  if (!prompt.trim()) return
  if (prompt.length > 20_000) { patch({ error: 'The battle prompt exceeds 20,000 characters. Nothing was shortened or sent.' }); return }
  if (!opponent.trim()) {
    patch({ error: 'Name the second brain first.' })
    return
  }
  const originalModel = store.settings.model
  patch({
    active: true,
    prompt: prompt.trim(),
    stage: 'First brain, at work…',
    a: null,
    b: null,
    picked: '',
    originalModel,
    error: '',
    saved: '',
    blind: true,
  })
  try {
    const first = await (async () => {
      const sent = await store.send(prompt.trim())
      if (!sent.ok) throw new Error(sent.answer)
      const done = await settle()
      return { model: store.settings.model, ...done }
    })()
    patch({ a: first, stage: 'Second brain, same question…' })
    const switched = await getEngineApi().setModel(opponent.trim())
    if (!switched.ok) throw new Error(switched.answer)
    const second = await (async () => {
      const sent = await store.send(prompt.trim())
      if (!sent.ok) throw new Error(sent.answer)
      const done = await settle()
      return { model: opponent.trim(), ...done }
    })()
    patch({ b: second, stage: '' })
  } catch (failure) {
    patch({ active: false, stage: '', error: (failure as Error).message })
    // Never leave the owner's choice switched by a fight they did not see.
    if (state.originalModel) void getEngineApi().setModel(state.originalModel)
    return
  }
  // The battle never silently changes which brain the composer uses next.
  const restored = await getEngineApi().setModel(state.originalModel)
  patch({ active: false, stage: '', error: restored.ok ? '' : 'The original brain could not be restored; switch it in the composer.' })
}

/** The pick. Blind ends here: the names show, and the tally is recorded. */
export async function pickWinner(pick: 'a' | 'b' | 'tie'): Promise<void> {
  if (!state.a || !state.b || state.picked) return
  patch({ picked: pick, blind: false })
  const answer = await getEngineApi().battle.record({
    prompt: state.prompt,
    winner: pick === 'tie' ? '' : pick === 'a' ? state.a.model : state.b.model,
    loser: pick === 'tie' ? '' : pick === 'a' ? state.b.model : state.a.model,
    tie: pick === 'tie',
    blind: true,
  })
  patch({ saved: answer.ok ? 'The private tally has it.' : answer.answer })
}

/** Hold the prompt the owner wants fought over, before the fight begins. */
export const stageBattlePrompt = (prompt: string): void => {
  if (!state.active) patch({ prompt: prompt.trim(), error: prompt.length > 20_000 ? 'The battle prompt exceeds 20,000 characters. Nothing was shortened or sent.' : '' })
}

/** Close the card. The tally keeps what was recorded. */
export const dismissBattle = (): void => {
  state = { ...initial }
  emit()
}

/** The state without React, for orchestration code and tests. */
export const battleState = (): BattleState => state

export function useBattle(): BattleState {
  useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
  return state
}
