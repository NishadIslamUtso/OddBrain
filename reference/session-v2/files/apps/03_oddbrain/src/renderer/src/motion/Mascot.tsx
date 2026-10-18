import { useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { SCENES as MOTIONS } from '../ui/sceneCatalog'
import { durationScaleFor, motionPaused, pairingAt, type MotionPairing, type MotionRole } from '@shared/lib/motionKit'
import { prepareMotionSvg } from '@shared/lib/motionSvg'
import { getMotionMode, subscribeMotionMode } from './motionMode'
import { useLook } from '../ui/LookContext'
import { MotionOverride } from '../ui/MotionContext'

const RAW = import.meta.glob('../assets/motion/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const PRISTINE: Record<string, string> = {}
for (const [path, svg] of Object.entries(RAW)) {
  const id = path.split('/').at(-1)?.replace(/\.svg$/, '') ?? ''
  if (id) PRISTINE[id] = svg
}
export function motionAsset(id: string): string | null { return PRISTINE[id] ?? null }
export const INSTANCE_BUDGET = 6
const slots = new Set<string>()
const waiting = new Set<() => void>()
let noticeQueued = false
function budgetChanged(): void {
  if (noticeQueued) return
  noticeQueued = true
  queueMicrotask(() => { noticeQueued = false; for (const notify of [...waiting]) if (waiting.has(notify)) notify() })
}
/** A slot belongs to its instance, so reaching six never pauses the sixth
 * owner and releases/reacquires it forever. Waiters only acquire free slots. */
function useSlot(uid: string, enabled: boolean): boolean {
  const [owned, setOwned] = useState(false)
  useEffect(() => {
    if (!enabled) { setOwned(false); return }
    let held = false
    const acquire = (): void => {
      if (held || slots.size >= INSTANCE_BUDGET) return
      slots.add(uid); held = true; setOwned(true); budgetChanged()
    }
    waiting.add(acquire); acquire()
    return () => { waiting.delete(acquire); if (held) { slots.delete(uid); budgetChanged() } }
  }, [uid, enabled])
  return enabled && owned
}
export function scenePairing(role: MotionRole, tick: number, roles: Partial<Record<MotionRole, string>>, seed = 0): MotionPairing {
  const assigned = roles[role]
  const scene = assigned && assigned !== 'auto' ? MOTIONS.find(m => m.id === assigned) : undefined
  if (!scene) return pairingAt(role, tick, seed)
  return { word: scene.words.length ? scene.words[Math.abs(tick + seed) % scene.words.length] : scene.defaultWord, motionIds: [scene.id] }
}
export type MascotProps = {
  motion?: string; role?: MotionRole; size: number; withWord?: boolean
  periodMs?: number; seed?: number; active?: boolean; className?: string
  /** Thumbnail/static preview, independent of the global preference. */
  static?: boolean
}
export function Mascot({ motion, role, size, withWord = false, periodMs = 5500, seed = 0, active = true, className, static: forceStatic = false }: MascotProps): React.JSX.Element {
  const id = useId(), uid = `i${id.replace(/[^a-z0-9-]/gi, '')}`
  const holder = useRef<HTMLSpanElement | null>(null)
  const [onScreen, setOnScreen] = useState(true)
  const env = useSyncExternalStore(subscribeMotionMode, getMotionMode)
  const override = useContext(MotionOverride), mode = override ?? env.mode, look = useLook()
  const staticPose = forceStatic || env.mode === 'still' || motionPaused(mode, env.osReduced)
  const frozen = staticPose || look.paused || env.paused
  useEffect(() => {
    const node = holder.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => setOnScreen(entries.some(entry => entry.isIntersecting)))
    observer.observe(node); return () => observer.disconnect()
  }, [])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!role || !active || frozen || !onScreen) return
    const timer = window.setInterval(() => setTick(n => n + 1), Math.max(1200, periodMs))
    return () => window.clearInterval(timer)
  }, [role, active, frozen, onScreen, periodMs])
  const pairing = role ? scenePairing(role, tick, look.roles, seed) : null
  const sceneId = motion ?? pairing?.motionIds[0] ?? null
  const pristine = sceneId ? PRISTINE[sceneId] : null
  const scale = durationScaleFor(mode, env.osReduced) / look.speed
  const svg = useMemo(() => pristine ? prepareMotionSvg(pristine, uid, scale) : null, [pristine, uid, scale])
  const oneShot = sceneId === 'assemble' || sceneId === 'shades-drop'
  const [shotDone, setShotDone] = useState(false)
  useEffect(() => setShotDone(false), [sceneId])
  const ownsSlot = useSlot(uid, !!svg && onScreen && !frozen && !shotDone)
  useEffect(() => {
    if (!oneShot || !ownsSlot) return
    const timer = window.setTimeout(() => setShotDone(true), ((MOTIONS.find(m => m.id === sceneId)?.duration ?? 3) * 1000 + 400) * scale)
    return () => window.clearTimeout(timer)
  }, [oneShot, ownsSlot, sceneId, scale])
  const scene = MOTIONS.find(m => m.id === sceneId)
  const word = motion ? scene?.defaultWord : pairing?.word
  return <span ref={holder} className={`ob-mascot inline-flex flex-col items-center ${className ?? ''}`} style={{ width: size }} data-motion={sceneId ?? ''}>
    {svg ? <span className={`ob-scene block ${staticPose ? 'ob-static' : look.paused || env.paused || !ownsSlot || shotDone ? 'ob-still' : ''}`} style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
    {withWord && word ? <span className="mt-1 max-w-full truncate text-[11px] text-muted" aria-hidden="true">{word}</span> : null}
  </span>
}
