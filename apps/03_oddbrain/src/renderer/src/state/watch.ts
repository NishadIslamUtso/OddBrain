import { useSyncExternalStore } from 'react'
import { getEngineApi } from '@/platform/bridge'
import { engineStore, subscribeEngine } from './engine'
import {
  shouldWatchFire,
  watchOrder,
  watchDebounceMs,
  WATCH_COOLDOWN_MS,
  type WatchFireDecision,
} from '@shared/lib/watchMode'

/**
 * Watch mode, orchestrated. The watcher in main REPORTS changes; this side
 * makes the one decision — fire or wait — and when it fires, the run is an
 * ordinary turn through the engine store's ONE send path. Files the engine
 * wrote during a run are suppressed for one cooldown, so the watcher can
 * never chase its own tail.
 */

export type WatchState = {
  active: boolean
  folder: string
  order: string
  runs: number
  lastFired: string
  error: string
}

let state: WatchState = {
  active: false,
  folder: '',
  order: '',
  runs: 0,
  lastFired: '',
  error: '',
}

const listeners = new Set<() => void>()
let version = 0

const emit = (): void => {
  version += 1
  for (const listener of listeners) listener()
}

const patch = (part: Partial<WatchState>): void => {
  state = { ...state, ...part }
  emit()
}

let lastEventAt = 0
let lastFireAt = 0
let cooldownUntil = 0
let suppressed: string[] = []
let suppressedAt: number | undefined
let gathered = new Set<string>()
let quiet: ReturnType<typeof setTimeout> | null = null
let harvestDue = false
let subscribed = false

/**
 * The engine's writes are harvested when its turn CLOSES — not when the send
 * is acknowledged. Capturing at send time read the PREVIOUS turn's paths; the
 * fix watches the store: running → anything-else means the writes are final.
 */
const harvestWhenClosed = (): void => {
  if (subscribed) return
  subscribed = true
  let wasRunning = false
  subscribeEngine(() => {
    const running = engineStore().turn?.state === 'running'
    if (wasRunning && !running && harvestDue) {
      harvestDue = false
      suppressed = toolPathsOfLastTurn()
      suppressedAt = Date.now()
    }
    wasRunning = running
  })
}

/**
 * Files to stop watching for one window: what the engine's last run WROTE.
 * Only the write tools count — a file the engine merely READ is the person's
 * to change, and suppressing it hid real edits for a cooldown. (Bash commands
 * name no path we can trust, so they are not suppressed; the cooldown, the
 * gap and the busy-gate hold the line.)
 */
const WATCH_SUPPRESSED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const toolPathsOfLastTurn = (): string[] => {
  const turn = engineStore().turn
  if (!turn) return []
  return turn.items
    .filter(item => item.kind === 'tool' && WATCH_SUPPRESSED_TOOLS.has((item as { name?: string }).name ?? ''))
    .map(item => ((item as { summary?: string }).summary ?? '').trim())
    .filter(Boolean)
}

const maybeFire = (names: string[]): void => {
  // Gather, then wait for quiet: a change fires after a few seconds in
  // which nothing else happened — not on the first heartbeat of a burst.
  lastEventAt = Date.now()
  for (const name of names) gathered.add(name)
  if (quiet) clearTimeout(quiet)
  const fireWhenQuiet = (): void => {
    quiet = null
    if (!state.active) return
    // A timer can wake before the wall clock crosses the requested boundary.
    // Keep the gathered batch until quiet is real; otherwise a 1ms-early wake
    // discards a legitimate change forever. No extra run, changed filters or
    // bypass of the busy/cooldown gates.
    const remaining = watchDebounceMs() - (Date.now() - lastEventAt)
    if (remaining > 0) {
      quiet = setTimeout(fireWhenQuiet, remaining + 1)
      return
    }
    const batch = [...gathered]
    gathered = new Set()
    const store = engineStore()
    const decision: WatchFireDecision = shouldWatchFire({
      names: batch,
      suppressed,
      suppressedAt,
      now: Date.now(),
      lastEventAt,
      lastFireAt,
      cooldownUntil,
      busy: store.turn?.state === 'running',
    })
    if (!decision.fire) return
    const prompt = watchOrder(decision.names, state.order)
    lastFireAt = Date.now()
    cooldownUntil = lastFireAt + WATCH_COOLDOWN_MS
    void (async () => {
      harvestWhenClosed()
      const sent = await store.send(prompt)
      if (sent.ok) {
        // Whatever the engine writes in THIS turn is ignored for one cooldown,
        // harvested the moment the turn closes (see harvestWhenClosed).
        harvestDue = true
      }
      patch({ runs: state.runs + 1, lastFired: decision.names.join(', ') })
    })()
  }
  quiet = setTimeout(fireWhenQuiet, watchDebounceMs())
}

/** Start watching a folder; the order is saved and said back in full. */
export async function startWatching(folder: string, order: string): Promise<boolean> {
  if (!order.trim()) {
    patch({ error: 'The order is what runs on a change; write it first.' })
    return false
  }
  if (!folder.trim()) {
    patch({ error: 'Set the engine\u2019s working folder first, in the bay above; that is the folder it watches.' })
    return false
  }
  const answer = await getEngineApi().watch.start(folder)
  if (!answer.ok) {
    patch({ error: answer.answer })
    return false
  }
  patch({ active: true, folder, order: order.trim(), error: '', runs: 0, lastFired: '' })
  void getEngineApi().watch.onEvent((tick) => maybeFire(tick.names))
  return true
}

export async function stopWatching(): Promise<void> {
  const answer = await getEngineApi().watch.stop()
  patch({ active: false, folder: '', error: answer.ok ? '' : answer.answer })
}

export const watchState = (): WatchState => state

export function useWatch(): WatchState {
  useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
  return state
}
