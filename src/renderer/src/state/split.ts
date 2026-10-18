import { useSyncExternalStore } from 'react'
import { engineStore, registerLineHold, type EngineItem } from './engine'
import { parseSteps, SPLIT_ORDER, SOLE_VERDICT, splitSummary } from '@shared/lib/split'

/**
 * Split, orchestrated. Every send goes through the engine store's ONE path —
 * the same cards, the same throttle, the same honest usage lines — so a
 * split run is just several normal turns in order, with the app keeping the
 * checklist. No step hides from the owner, and a failure stops the run.
 */

export type SplitStep = {
  text: string
  state: 'pending' | 'running' | 'done' | 'failed'
  /** The answer's first words, so the checklist is a record, not a blank. */
  note: string
}

export type SplitState = {
  phase: 'idle' | 'draft' | 'splitting' | 'ready' | 'running' | 'finished'
  order: string
  steps: SplitStep[]
  at: number
  error: string
  summary: string
}

let state: SplitState = {
  phase: 'idle',
  order: '',
  steps: [],
  at: 0,
  error: '',
  summary: '',
}

const listeners = new Set<() => void>()

// While Split runs its steps, the line holds.
registerLineHold(() => {
  const { phase } = splitStateNow()
  return phase === 'running' || phase === 'splitting'
})
function splitStateNow(): { phase: string } {
  return state
}
let version = 0

const emit = (): void => {
  version += 1
  for (const listener of listeners) listener()
}

const patch = (part: Partial<SplitState>): void => {
  state = { ...state, ...part }
  emit()
}

const settle = async (capMs = 300_000): Promise<'done' | 'error' | 'timeout'> => {
  const store = engineStore()
  const deadline = Date.now() + capMs
  for (;;) {
    const turn = store.turn
    if (!turn) return 'error'
    if (turn.state === 'done') return 'done'
    if (turn.state === 'error') return 'error'
    if (Date.now() > deadline) return 'timeout'
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

const turnText = (): string => {
  const turn = engineStore().turn
  if (!turn) return ''
  // The story's WORDS only: a status line ("engine ready") is not the
  // engine's answer, and gluing it on would corrupt strict parsers.
  return turn.items
    .filter((item): item is Extract<EngineItem, { text: string }> => item.kind === 'text')
    .map(item => item.text)
    .join('\n')
}


/** Raise the split dialog for a draft. Nothing is sent here. */
export const stageSplit = (order: string): void => {
  if (state.phase === 'splitting' || state.phase === 'running') return
  if (!order.trim()) return
  patch({ phase: 'draft', order: order.trim(), error: '' })
}

export const dismissSplit = (): void => {
  if (state.phase === 'splitting' || state.phase === 'running') return
  state = { phase: 'idle', order: '', steps: [], at: 0, error: '', summary: '' }
  emit()
}

/** Step one: the engine breaks the order into steps. Nothing has run yet. */
export async function breakDown(): Promise<boolean> {
  if (state.phase !== 'draft' || !state.order) {
    patch({ error: 'Raise Split with a work order first.' })
    return false
  }
  const store = engineStore()
  if (store.turn?.state === 'running') {
    patch({ error: 'The engine is still on the last task. Wait for it, or press Stop.' })
    return false
  }
  patch({ phase: 'splitting', error: '' })
  const sent = await store.send(`${SPLIT_ORDER}${state.order}`)
  if (!sent.ok) {
    patch({ phase: 'draft', error: sent.answer })
    return false
  }
  const ended = await settle()
  if (ended !== 'done') {
    patch({ phase: 'draft', error: ended === 'timeout' ? 'The engine took too long to break the work down; nothing was changed.' : 'The engine could not break the work down; nothing was changed.' })
    return false
  }
  // The FINISHED block is the answer; the stitched stream is only a preview
  // of it. When the two disagree (a stream that lost its line breaks), the
  // finished block wins, and the stitched text is the fallback, never both.
  const parsed = ((): ReturnType<typeof parseSteps> => {
    const texts = (engineStore().turn?.items ?? [])
      .filter((item): item is Extract<EngineItem, { text: string }> => item.kind === 'text')
      .map(item => item.text)
    const last = texts.at(-1) ?? ''
    if (last.trim()) {
      const fromLast = parseSteps(last)
      if (fromLast.ok) return fromLast
    }
    return parseSteps(texts.join('\n'))
  })()
  if (!parsed.ok) {
    if (parsed.answer === SOLE_VERDICT) {
      patch({ phase: 'draft', error: 'The engine says this work needs no steps: run it whole with Send.' })
    } else {
      patch({ phase: 'draft', error: parsed.answer })
    }
    return false
  }
  patch({
    phase: 'ready',
    steps: parsed.steps.map(text => ({ text, state: 'pending' as const, note: '' })),
    at: Date.now(),
  })
  return true
}

/** Step two: run the steps in order, in this session, one turn each. */
export async function runSteps(): Promise<boolean> {
  if (state.phase !== 'ready') {
    patch({ error: 'Break the work down first; the steps come before the run.' })
    return false
  }
  const store = engineStore()
  if (store.turn?.state === 'running') {
    patch({ error: 'The engine is still on the last task. Wait for it, or press Stop.' })
    return false
  }
  patch({ phase: 'running', error: '' })
  for (let index = 0; index < state.steps.length; index++) {
    if (state.steps[index]?.state !== 'pending') continue
    state.steps[index]!.state = 'running'
    emit()
    const stepText = state.steps[index]!.text
    const sent = await store.send(`Step ${index + 1} of ${state.steps.length} from the plan you wrote. The step: ${stepText}`)
    if (!sent.ok) {
      state.steps[index]!.state = 'failed'
      state.steps[index]!.note = sent.answer.slice(0, 160)
      emit()
      patch({ phase: 'finished', summary: splitSummary(state.steps.length, index, 1), error: `Step ${index + 1}: ${sent.answer.slice(0, 160)}` })
      return false
    }
    const ended = await settle()
    if (ended !== 'done') {
      state.steps[index]!.state = 'failed'
      state.steps[index]!.note = ended === 'timeout' ? 'the engine took too long' : 'the engine hit an error'
      emit()
      patch({ phase: 'finished', summary: splitSummary(state.steps.length, index, 1), error: `Step ${index + 1}: ${state.steps[index]!.note}.` })
      return false
    }
    state.steps[index]!.state = 'done'
    state.steps[index]!.note = turnText().replace(/\s+/g, ' ').trim().slice(0, 140)
    emit()
  }
  const done = state.steps.filter(step => step.state === 'done').length
  patch({ phase: 'finished', error: '', summary: splitSummary(state.steps.length, done, 0) })
  return true
}

/** Run again from a failed step, after the owner has looked at why. */
export async function resumeFrom(index: number): Promise<boolean> {
  if (state.phase !== 'finished') return false
  const step = state.steps[index]
  if (!step || step.state !== 'failed') return false
  step.state = 'pending'
  patch({ phase: 'ready', error: '' })
  return runSteps()
}

export const clearSplitError = (): void => patch({ error: '' })

/** The state without React, for orchestration and tests. */
export const splitState = (): SplitState => state

export function useSplit(): SplitState {
  useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
  return state
}
