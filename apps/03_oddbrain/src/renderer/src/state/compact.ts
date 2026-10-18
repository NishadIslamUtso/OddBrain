import { useSyncExternalStore } from 'react'
import { getEngineApi } from '@/platform/bridge'
import { engineStore, registerLineHold, type EngineItem } from './engine'
import { BRIEF_ORDER, briefWorthKeeping, buildSeededPrompt, countWords, type CompactPhase } from '@shared/lib/compact'

/**
 * Compaction, orchestrated.
 *
 * Two honest steps, both visible: the engine writes the brief (a normal turn
 * on the same wire, same cards), the owner reads it, and only then does the
 * session end and the brief become the seed the next task rides with. If any
 * step refuses, the conversation is exactly as it was — nothing is lost by a
 * compaction that did not happen.
 */

export type CompactState = {
  phase: CompactPhase
  /** The engine's own words, shown in full before anything ends. */
  brief: string
  words: number
  error: string
  notice: string
}

let state: CompactState = {
  phase: 'idle',
  brief: '',
  words: 0,
  error: '',
  notice: '',
}

const listeners = new Set<() => void>()

// While compaction drives its two steps, the line holds.
registerLineHold(() => state.phase === 'briefing' || state.phase === 'ending')
let version = 0

const emit = (): void => {
  version += 1
  for (const listener of listeners) listener()
}

const patch = (part: Partial<CompactState>): void => {
  state = { ...state, ...part }
  emit()
}

/** The seed, taken exactly once: the next send rides with the brief. */
let seed: string | null = null

export const peekSeed = (): string | null => seed

export const takeSeed = (): string | null => {
  const taken = seed
  seed = null
  if (taken) patch({ notice: 'The brief rode along with that task. The engine is light again.', phase: 'idle' })
  return taken
}

/** Wait for the engine's current turn to finish, without spinning hot. */
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



/** Step one: the engine pours the conversation into a brief. Nothing ends yet. */
export async function writeBrief(): Promise<boolean> {
  if (state.phase === 'briefing' || state.phase === 'ending') return false
  const store = engineStore()
  if (store.turn?.state === 'running') {
    patch({ error: 'The engine is still on the last task. Wait for it, or press Stop.' })
    return false
  }
  if (!store.turn) {
    patch({ error: 'Nothing has been said in this conversation yet; there is nothing to pour.' })
    return false
  }
  patch({ phase: 'briefing', error: '', notice: '', brief: '', words: 0 })
  const sent = await store.send(BRIEF_ORDER)
  if (!sent.ok) {
    patch({ phase: 'idle', error: sent.answer })
    return false
  }
  const ended = await settle()
  if (ended !== 'done') {
    patch({ phase: 'idle', error: ended === 'timeout' ? 'The engine took too long to write the brief; nothing was changed.' : 'The engine could not write the brief; nothing was changed.' })
    return false
  }
  // The FINISHED block is the brief; the stitched stream is only its
  // preview. Prefer the block, fall back to the join, never keep both.
  const texts = (store.turn?.items ?? [])
    .filter((item): item is Extract<EngineItem, { text: string }> => item.kind === 'text')
    .map(item => item.text)
  const last = texts.at(-1) ?? ''
  const brief = briefWorthKeeping(last) ? last : texts.join('\n')
  if (!briefWorthKeeping(brief)) {
    patch({ phase: 'idle', error: 'The engine said too little to carry the work. Nothing was changed; try again after more has happened.' })
    return false
  }
  patch({ phase: 'ready', brief, words: countWords(brief) })
  return true
}

/** Step two: keep the receipt, end the session, arm the seed. */
export async function finishCompact(): Promise<boolean> {
  if (state.phase !== 'ready' || !state.brief) {
    patch({ error: 'Write the brief first; compaction ends a session only after its brief exists.' })
    return false
  }
  patch({ phase: 'ending', error: '' })
  const store = engineStore()
  const saved = await getEngineApi().compact.save({
    brief: state.brief,
    workspace: store.settings.workspace,
    at: new Date().toISOString(),
  })
  if (!saved.ok) {
    patch({ phase: 'ready', error: saved.answer })
    return false
  }
  const fresh = await getEngineApi().fresh()
  if (!fresh.ok) {
    patch({ phase: 'ready', error: fresh.answer })
    return false
  }
  // The socket ended the session; the store's own honest bookkeeping follows.
  await store.stop()
  seed = state.brief
  patch({ phase: 'seeded', notice: `Compacted: the conversation became a ${state.words}-word brief (saved beside this app's files). It rides along with your next message.` })
  return true
}

/** Cancel a poured-but-not-applied brief: the session was never touched. */
export const cancelBrief = (): void => {
  if (state.phase === 'ready') patch({ phase: 'idle', brief: '', words: 0, error: '' })
}

export const clearCompactNotice = (): void => patch({ notice: '', error: '' })

/** The state without React, for orchestration and tests. */
export const compactState = (): CompactState => state

/** The wrap App.tsx uses on every send: the seed rides exactly once. */
export const seedWrap = (task: string): string => {
  const taken = takeSeed()
  return taken ? buildSeededPrompt(taken, task) : task
}

export function useCompact(): CompactState {
  useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
  return state
}

/** Consume only after the actual work order was accepted/queued. A refusal
 * must not silently lose context, nor consume a newer replacement brief. */
export function consumeSeed(expected: string | null): boolean {
  if (!expected || seed !== expected) return false
  takeSeed(); return true
}
export const discardSeed = (): void => { seed = null; patch({ phase: 'idle', notice: 'The brief was left out. The saved receipt and original conversation were not deleted.' }) }
