/**
 * The kit's scenes, alive in the app.
 *
 * Rules this component enforces (the owner's brief, §8):
 *  - the shipped SVGs play byte-exact — every instance namespaces its own copy;
 *  - a bounded number of scenes animate at once (six), the rest wait paused;
 *  - off-screen instances pause; Still mode and the OS reduced-motion
 *    preference stop everything, exported bytes untouched;
 *  - the word under a scene is flavour and never travels without the honest
 *    state name beside it (the callers keep that name).
 */

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { MOTIONS } from '@shared/lib/motionKitData'
import { durationScaleFor, motionPaused, pairingAt, type MotionPairing, type MotionModeName, type MotionRole } from '@shared/lib/motionKit'
import { prepareMotionSvg } from '@shared/lib/motionSvg'
import { getMotionMode, subscribeMotionMode } from './motionMode'

const RAW = import.meta.glob('../assets/motion/*.svg', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

/** Scene SVGs are split into small async chunks and cached after first use. */
const PRISTINE = new Map<string, string>()
const PENDING = new Map<string, Promise<string | null>>()

export function motionAsset(id: string): string | null {
  return PRISTINE.get(id) ?? null
}

function loadMotionAsset(id: string): Promise<string | null> {
  const cached = PRISTINE.get(id)
  if (cached) return Promise.resolve(cached)
  const pending = PENDING.get(id)
  if (pending) return pending

  const loader = RAW[`../assets/motion/${id}.svg`]
  if (!loader) return Promise.resolve(null)

  const request = loader()
    .then(svg => {
      PRISTINE.set(id, svg)
      PENDING.delete(id)
      return svg
    })
    .catch(() => {
      PENDING.delete(id)
      return null
    })
  PENDING.set(id, request)
  return request
}

/** How many scenes may animate at once on one screen (the brief's bound). */
export const INSTANCE_BUDGET = 6

let runningInstances = 0
const budgetSubscribers = new Set<() => void>()
function releaseBudgetSlot(): void {
  runningInstances = Math.max(0, runningInstances - 1)
  for (const notify of budgetSubscribers) notify()
}
function acquireBudgetSlot(): boolean {
  if (runningInstances >= INSTANCE_BUDGET) return false
  runningInstances += 1
  // A grant changes the budget picture as much as a release does: subscribers
  // that waited on a full board must hear "a seat opened" in both directions.
  for (const notify of budgetSubscribers) notify()
  return true
}

function motionDuration(id: string): number {
  return (MOTIONS.find((mo) => mo.id === id)?.duration ?? 3) * 1000 + 400
}

function useMotionEnvironment(): { mode: MotionModeName; osReduced: boolean; used: number } {
  const env = useSyncExternalStore(subscribeMotionMode, getMotionMode)
  const [used, setUsed] = useState(runningInstances)
  useEffect(() => {
    const notify = () => setUsed(runningInstances)
    budgetSubscribers.add(notify)
    return () => {
      budgetSubscribers.delete(notify)
    }
  }, [])
  return { mode: env.mode, osReduced: env.osReduced, used }
}

export type MascotProps = {
  /** An explicit scene id (e.g. the waiting loader). */
  motion?: string
  /** Or a role whose rotation decides the scene. */
  role?: MotionRole
  /** Pixel size; the brief's sizes: hero 158 · chat empty 104 · loader 24-64. */
  size: number
  /** Show the flavour word under the scene (callers keep the honest state nearby). */
  withWord?: boolean
  /** Rotation period while the role is live. */
  periodMs?: number
  /** Stable per mount position, so two mascots never show the same word. */
  seed?: number
  /** When false the rotation freezes on the current word (a finished turn). */
  active?: boolean
  className?: string
}

/** The mascot: one namespaced, budgeted, pausable scene — with its word. */
export function Mascot({ motion, role, size, withWord = false, periodMs = 5500, seed = 0, active = true, className }: MascotProps): React.JSX.Element {
  const reactId = useId()
  const uid = `i${reactId.replace(/[^a-z0-9-]/gi, '')}`
  const holder = useRef<HTMLSpanElement | null>(null)
  const [onScreen, setOnScreen] = useState(true)
  const { mode, osReduced, used } = useMotionEnvironment()
  const pausedByMode = motionPaused(mode, osReduced)

  // Off-screen instances pause (an IntersectionObserver, nothing polling).
  useEffect(() => {
    const node = holder.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      setOnScreen(entries.some((entry) => entry.isIntersecting))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // The word wheel: words turn over while active; Still freezes them.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!role || !active || pausedByMode) return
    const timer = window.setInterval(() => setTick((n) => n + 1), Math.max(1200, periodMs))
    return () => window.clearInterval(timer)
  }, [role, active, pausedByMode, periodMs])

  const current: MotionPairing | null = role ? pairingAt(role, tick, seed) : null
  const sceneId = motion ?? (current ? current.motionIds[0] : null)
  const [asset, setAsset] = useState<{ id: string | null; svg: string | null }>({ id: null, svg: null })
  useEffect(() => {
    if (!sceneId) {
      setAsset({ id: null, svg: null })
      return
    }
    const cached = motionAsset(sceneId)
    if (cached) {
      setAsset({ id: sceneId, svg: cached })
      return
    }
    let active = true
    setAsset({ id: sceneId, svg: null })
    void loadMotionAsset(sceneId).then(svg => {
      if (active) setAsset({ id: sceneId, svg })
    })
    return () => { active = false }
  }, [sceneId])
  const pristine = asset.id === sceneId ? asset.svg : sceneId ? motionAsset(sceneId) : null

  const overBudget = used >= INSTANCE_BUDGET
  const paused = pausedByMode || !onScreen || overBudget
  const svg = useMemo(() => {
    if (!pristine) return null
    return prepareMotionSvg(pristine, uid, durationScaleFor(mode, osReduced))
  }, [pristine, uid, mode, osReduced])

  // One-shots (the two `Special` scenes) stop after their single run.
  const isOneShot = sceneId === 'assemble' || sceneId === 'shades-drop'
  const [shotDone, setShotDone] = useState(false)
  useEffect(() => {
    setShotDone(false)
    if (!isOneShot || paused || !pristine) return
    const timer = window.setTimeout(() => setShotDone(true), motionDuration(sceneId ?? ''))
    return () => window.clearTimeout(timer)
  }, [isOneShot, paused, sceneId, pristine])

  // Budget accounting: a mounted, visible, animating instance holds a slot.
  const holdsSlot = !pausedByMode && onScreen && !overBudget && !shotDone
  useEffect(() => {
    if (!holdsSlot || !svg) return
    const got = acquireBudgetSlot()
    if (!got) return
    return () => releaseBudgetSlot()
  }, [holdsSlot, svg])

  const still = paused || shotDone
  return (
    <span ref={holder} className={`ob-mascot inline-flex flex-col items-center ${className ?? ''}`} style={{ width: size }}>
      {svg ? (
        <span
          className={`ob-scene block ${still ? 'ob-still' : ''}`}
          style={{ width: size, height: size }}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
      {withWord && current ? (
        <span className="mt-1 max-w-full truncate text-[11px] text-muted" aria-hidden="true">{current.word}</span>
      ) : null}
    </span>
  )
}
