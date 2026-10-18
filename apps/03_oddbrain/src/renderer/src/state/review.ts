import { useSyncExternalStore } from 'react'
import { engineStore, type EngineItem } from './engine'
import { parseVerdict, REVIEW_ORDER, verdictLine, type ReviewVerdict } from '@shared/lib/review'

/**
 * The reviewer, orchestrated. One press: the review order goes through the
 * engine store's ONE path as a normal turn (visible, stoppable, cards wide
 * awake), the finished block is read, and the verdict is kept here so the
 * card can show it beside the work it judged. Report-only by construction:
 * the review's turn is a turn like any other, and nothing in this module
 * sends anything but the review.
 */

export type ReviewState = {
  running: boolean
  verdict: ReviewVerdict | null
  /** The verdict line for the card, kept until the next turn replaces it. */
  line: string
  error: string
}

let state: ReviewState = { running: false, verdict: null, line: '', error: '' }

const listeners = new Set<() => void>()
let version = 0

const emit = (): void => {
  version += 1
  for (const listener of listeners) listener()
}

const patch = (part: Partial<ReviewState>): void => {
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

/** Press Review on a finished turn: the engine reports on itself. */
export async function runReview(): Promise<boolean> {
  if (state.running) return false
  const store = engineStore()
  if (store.turn?.state === 'running') {
    patch({ error: 'Wait for the work to finish before asking for the review of it.' })
    return false
  }
  if (!store.turn) {
    patch({ error: 'There is no finished work here to review yet.' })
    return false
  }
  patch({ running: true, error: '' })
  const sent = await store.send(REVIEW_ORDER)
  if (!sent.ok) {
    patch({ running: false, error: sent.answer })
    return false
  }
  const ended = await settle()
  if (ended !== 'done') {
    patch({ running: false, error: ended === 'timeout' ? 'The review took too long; nothing was changed.' : 'The review could not run; nothing was changed.' })
    return false
  }
  // The finished block wins: the review's last words are the verdict.
  const texts = (store.turn?.items ?? [])
    .filter((item): item is Extract<EngineItem, { text: string }> => item.kind === 'text')
    .map(item => item.text)
  const last = texts.at(-1) ?? ''
  const verdict = parseVerdict(last)
  patch({ running: false, verdict, line: verdictLine(verdict), error: '' })
  return true
}

export const clearReviewError = (): void => patch({ error: '' })

/** The state without React, for orchestration and tests. */
export const reviewState = (): ReviewState => state

export function useReview(): ReviewState {
  useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
  return state
}

