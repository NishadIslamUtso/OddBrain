/**
 * Watch mode: keep an eye on a folder; when its files change, send a saved
 * work order. The toolbrain/morphllm idea (run the check on every change),
 * made the app's: the runs are ordinary engine turns — same cards, same
 * Stop — and the watcher cannot chase its own tail, because the files the
 * engine itself just touched are suppressed for one cooldown. Deleting is
 * not change enough to spend a run on; the note says so up front.
 */

import { REPO_MAP_IGNORES } from './repoMap'

export const WATCH_DEBOUNCE_MS = 5_000

/**
 * The debounce is a product value, but two modules must agree on it and tests
 * must not wait five real seconds for quiet. One read, one seam.
 */
export const watchDebounceMs = (): number =>
  (globalThis as { __obWatchDebounceMs?: number }).__obWatchDebounceMs ?? WATCH_DEBOUNCE_MS
export const WATCH_MIN_GAP_MS = 15_000
export const WATCH_COOLDOWN_MS = 15_000
export const WATCH_MAX_NAMES = 5

export type WatchFireInput = {
  /** Watch-event file names, already rooted at the watched folder. */
  names: string[]
  /** Files to ignore once: the engine touched these during the last run. */
  suppressed: string[]
  /**
   * When the suppression was harvested. The note promises ONE cooldown of
   * ignoring, not forever: past it, an engine-written file is the person's
   * file again, and an edit to it fires. Absent (old callers) means live.
   */
  suppressedAt?: number
  now: number
  lastEventAt: number
  lastFireAt: number
  /** Set when a run finishes: its cooldown holds until this moment. */
  cooldownUntil: number
  busy: boolean
}

export type WatchFireDecision = { fire: false; why: string } | { fire: true; names: string[] }

/** A name worth watching: not hidden, not in an ignored folder, not deep junk. */
export function watchableName(name: string): boolean {
  if (!name) return false
  const parts = name.split(/[\\/]/)
  if (parts.some(part => REPO_MAP_IGNORES.has(part))) return false
  if (parts.some(part => part.startsWith('.'))) return false
  return true
}

/**
 * The one decision the watcher gets right or wrong: fire, or say why not.
 * Debounce waits for quiet; the gap and the engine-touched cooldown keep it
 * from chasing its own tail; a busy engine never gets a second task quietly.
 */
export function shouldWatchFire(input: WatchFireInput): WatchFireDecision {
  if (input.busy) return { fire: false, why: 'busy' }
  if (input.now < input.cooldownUntil) return { fire: false, why: 'cooldown' }
  if (input.now - input.lastEventAt < watchDebounceMs()) return { fire: false, why: 'debounce' }
  if (input.lastFireAt > 0 && input.now - input.lastFireAt < WATCH_MIN_GAP_MS) return { fire: false, why: 'gap' }
  const suppressionLive = input.suppressedAt === undefined || input.now - input.suppressedAt < WATCH_COOLDOWN_MS
  const names = input.names
    .filter(name => watchableName(name))
    .filter(name => !(suppressionLive && input.suppressed.some(hidden => samePath(name, hidden))))
  if (!names.length) return { fire: false, why: 'nothing-watchable' }
  return { fire: true, names: names.slice(0, WATCH_MAX_NAMES) }
}


/**
 * True when a watched name and a suppressed path name the same file. The
 * engine's tool lines carry absolute paths; fs.watch reports folder-relative
 * names; both are normalized (`\\`→`/`) and matched as a path suffix on
 * segments — `notes.md` matches `C:/vault/notes.md` and `sub/x.md` matches
 * `C:/vault/sub/x.md`, but `notes.md` never matches `my-notes.md`.
 */
export function samePath(watchName: string, toolPath: string): boolean {
  const norm = (value: string): string[] => value.replace(/\\/g, '/').split('/').filter(part => part.length > 0 && part !== '.')
  const nameParts = norm(watchName)
  const toolParts = norm(toolPath)
  if (!nameParts.length || nameParts.length > toolParts.length) return false
  const tail = toolParts.slice(-nameParts.length)
  return nameParts.every((part, index) => part === tail[index])
}

/** The one-time order the watcher sends. Plain, checkable, no loops of its own. */
export function watchOrder(names: string[], order: string): string {
  const list = names.join(', ')
  return `${order.trim()}\n\n(The watcher sent this because these files changed: ${list}. Deal with the change the order describes; do not edit those files just because they changed.)`
}

/** The note under the form, so the deletion rule is never a surprise. */
export const WATCH_NOTE =
  'Changes fire the order after a few seconds of quiet; deletions do not fire it. Files the engine itself wrote are ignored for one cooldown, so the watcher never chases its own tail. Stop is always one press away.'
