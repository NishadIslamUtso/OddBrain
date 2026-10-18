/**
 * The appearance mode for kit motion, as one tiny subscribed store.
 *
 * App.tsx owns the real appearance state (it persists and applies the tokens);
 * this mirror exists only so deep components (the mascot on an engine card)
 * can read the mode without prop-drilling through half the tree. App.tsx
 * pushes each change; mascots subscribe.
 *
 * The snapshot object is CACHED and rebuilt only when a value actually
 * changes — useSyncExternalStore requires a stable getSnapshot, and a fresh
 * object per call would loop React into the ground (proven live: the whole
 * window blanked once already; never again).
 */

import type { MotionModeName } from '@shared/lib/motionKit'

let mode: MotionModeName = 'system'
let osReduced = false
let snapshot: { mode: MotionModeName; osReduced: boolean } = { mode, osReduced }
const subscribers = new Set<() => void>()

function rebuild(): void {
  snapshot = { mode, osReduced }
  for (const notify of subscribers) notify()
}

export function getMotionMode(): { mode: MotionModeName; osReduced: boolean } {
  return snapshot
}

export function setMotionMode(next: MotionModeName): void {
  if (next === mode) return
  mode = next
  rebuild()
}

/** Called once from the OS listener App.tsx registers for reduced motion. */
export function setOsReducedMotion(reduced: boolean): void {
  if (reduced === osReduced) return
  osReduced = reduced
  rebuild()
}

export function subscribeMotionMode(notify: () => void): () => void {
  subscribers.add(notify)
  return () => subscribers.delete(notify)
}
