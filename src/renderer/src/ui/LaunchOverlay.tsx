import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { prepareMotionSvg } from '@shared/lib/motionSvg'
import BrainMark from '../components/BrainMark'
import { motionAsset } from '../motion/Mascot'
import { getMotionMode, subscribeMotionMode } from '../motion/motionMode'
import { bridge, isDemo } from '../platform/bridge'
import { useLook } from './LookContext'
import wordmark from '../assets/wordmark.svg?raw'

let ticket: Promise<boolean> | null = null
let shownHere = false
function claim(): Promise<boolean> {
  // Shared promise survives React StrictMode's setup/cleanup/setup. Only an
  // effect still mounted may consume it, so StrictMode never steals the show.
  if (!ticket) ticket = isDemo ? Promise.resolve(true) : bridge.app.claimLaunch?.().catch(() => false) ?? Promise.resolve(false)
  return ticket
}
export const replayOpening = (): void => { window.dispatchEvent(new Event('oddbrain:replay-opening')) }
export function launchSvg(raw: string, uid: string, width: number, height: number): string {
  const side = Math.min(height <= 700 ? 640 : 740, Math.min(width, height) * (height <= 700 ? .74 : .76)), scale = side / 740
  const x = Math.max(1, (width / 2 + 400 * scale) / (670 * scale)), y = Math.max(1, (height / 2 + 400 * scale) / (650 * scale))
  const flight = raw.replace(/translate\((-?\d+)px,(-?\d+)px\)/g, (all, xx: string, yy: string) => {
    const a = Number(xx), b = Number(yy)
    return Math.abs(a) < 300 && Math.abs(b) < 300 ? all : `translate(${Math.round(Math.abs(a) >= 300 ? a * x : a)}px,${Math.round(Math.abs(b) >= 300 ? b * y : b)}px)`
  })
  return prepareMotionSvg(flight, uid, .55)
}
export default function LaunchOverlay() {
  const look = useLook(), env = useSyncExternalStore(subscribeMotionMode, getMotionMode)
  const frozen = look.paused || env.osReduced || env.mode === 'still'
  const [phase, setPhase] = useState<'checking' | 'playing' | 'fading' | 'idle'>(shownHere ? 'idle' : 'checking')
  const startedAt = useRef(0)
  const [painted, setPainted] = useState(false), [settled, setSettled] = useState(false), [iteration, setIteration] = useState(0)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const id = useId().replace(/[^a-z0-9]/gi, '')
  const svg = useMemo(() => launchSvg(motionAsset('assemble') || '', `launch-${id}-${iteration}`, viewport.width, viewport.height), [id, iteration, viewport])
  useEffect(() => {
    let active = true
    void claim().then(allowed => { if (!active) return; if (allowed && !shownHere) { shownHere = true; setPhase('playing') } else setPhase('idle') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const replay = (): void => { setSettled(false); setIteration(n => n + 1); setPhase('playing') }
    window.addEventListener('oddbrain:replay-opening', replay)
    return () => window.removeEventListener('oddbrain:replay-opening', replay)
  }, [])
  // App content has committed. Wait for the renderer to get two paint turns;
  // an elapsed animation is not permission to reveal an unpainted window.
  useEffect(() => { let second = 0; const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setPainted(true)) }); return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) } }, [])
  useEffect(() => {
    if (phase !== 'playing') return
    const start = performance.now(); startedAt.current = start
    const skip = (event: KeyboardEvent): void => { if (performance.now() - start < 250) return; event.preventDefault(); event.stopImmediatePropagation(); setSettled(true) }
    window.addEventListener('keydown', skip, true)
    const timer = setTimeout(() => setSettled(true), frozen ? 180 : 2620)
    const resize = (): void => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', skip, true); window.removeEventListener('resize', resize) }
  }, [phase, iteration, frozen])
  useEffect(() => { if (phase === 'playing' && settled && painted) setPhase('fading') }, [phase, settled, painted])
  useEffect(() => { if (phase !== 'fading') return; const timer = setTimeout(() => setPhase('idle'), 220); return () => clearTimeout(timer) }, [phase])
  useEffect(() => {
    if (phase === 'idle') return
    const app = document.querySelector<HTMLElement>('.ob-app-root')
    if (!app) return
    const previous = app.inert; app.inert = true
    return () => { app.inert = previous }
  }, [phase])
  if (phase === 'idle') return null
  return <div className={`ob-launch ${phase === 'fading' ? 'is-fading' : ''} ${frozen || phase === 'checking' ? 'is-static' : ''}`} role="img" aria-label="OddBrain opening" key={iteration} onClick={() => { if (phase === 'playing' && performance.now() - startedAt.current >= 250) setSettled(true) }}>
    <div className="ob-launch-art">{frozen || phase === 'checking' ? <BrainMark size={220} /> : <span className="ob-launch-scene" dangerouslySetInnerHTML={{ __html: svg }} />}</div>
    <div className="ob-launch-name" dangerouslySetInnerHTML={{ __html: wordmark }} />
  </div>
}
