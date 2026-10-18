import { useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { SCENES as MOTIONS } from './sceneCatalog'
import { motionPaused } from '@shared/lib/motionKit'
import { Mascot } from '../motion/Mascot'
import { getMotionMode, subscribeMotionMode } from '../motion/motionMode'
import { useLook } from './LookContext'
import { MotionOverride } from './MotionContext'

export const REACTIONS = {
  poke: [['boop', 'Boop. Highly technical work.'], ['eye-roll', 'My brain has a poke quota.'], ['shades-drop', 'Yes, I always look this busy.']],
  head: [['glasses-clean', 'Careful. These are my clever glasses.'], ['shades-drop', 'The sunglasses are load-bearing.']],
  shoes: [['shoe-phone', 'My shoes are taking calls now.'], ['shoe-skateboard', 'Business on top. Wheels underneath.']],
  tickle: [['belly-laugh', 'Not the cheeks. I have a reputation.'], ['cheek-drums', 'That is not a keyboard.']],
  double: [['cheek-drums', 'Two pokes. Still no snacks.'], ['belly-laugh', 'You have found the wrong shortcut.']],
  drag: [['waddle', 'I was sitting there professionally.'], ['moonwalk', 'I call that a strategic retreat.']],
  flick: [['brain-kickflip', 'Completely intentional. Naturally.'], ['topsy', 'Gravity. Such a show-off.']],
  hold: [['peekaboo', 'I was about to look busy.'], ['self-hug', 'Personal space. A bold concept.']],
  many: [['eye-roll', 'Yes, yes. Premium poking service.'], ['pocket-panic', 'Do you poke all your colleagues?']],
} as const
export type ReactionKind = keyof typeof REACTIONS
export function reactionFor(kind: ReactionKind, count: number, previous = ''): { scene: string; text: string } {
  const choices = REACTIONS[kind].filter(r => r[1] !== previous)
  const pool = choices.length ? choices : REACTIONS[kind]
  const [scene, text] = pool[Math.abs(count) % pool.length]
  return { scene, text }
}
type Drag = { x: number; y: number; at: number; top: number; height: number; dragged: boolean; held: boolean }
/** Only local physical/visual reactions. It has no access to an engine,
 * microphone, permission, chat setter or network client. */
export default function InteractiveBrain({ words = false, readOnly = false }: { words?: boolean; readOnly?: boolean }) {
  const look = useLook(), env = useSyncExternalStore(subscribeMotionMode, getMotionMode), override = useContext(MotionOverride)
  const frozen = look.paused || env.paused || env.mode === 'still' || motionPaused(override ?? env.mode, env.osReduced)
  const [reaction, setReaction] = useState<{ scene: string; text: string; kind: string } | null>(null)
  const [resting, setResting] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0, tilt: 0 })
  const button = useRef<HTMLButtonElement | null>(null), drag = useRef<Drag | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null), reply = useRef<ReturnType<typeof setTimeout> | null>(null)
  const motion = useRef({ count: 0, taps: [] as number[], lastMove: 0, lastX: 0, lastY: 0, distance: 0, tickled: 0, text: '', lastKind: '', lastTap: 0, tapX: 0, tapY: 0 })
  const hint = useId(), interactive = look.interactions && !readOnly
  const clearHold = (): void => { if (hold.current) clearTimeout(hold.current); hold.current = null }
  const reset = (): void => { if (reply.current) clearTimeout(reply.current); reply.current = null; setReaction(null); motion.current.taps = []; motion.current.lastTap = 0; motion.current.lastKind = ''; setOffset({ x: 0, y: 0, tilt: 0 }) }
  useEffect(() => () => { if (hold.current) clearTimeout(hold.current); if (reply.current) clearTimeout(reply.current) }, [])
  useEffect(() => { if (!interactive) { drag.current = null; clearHold(); reset() } }, [interactive])
  useEffect(() => { if (frozen || readOnly || reaction) return; const timer = setTimeout(() => setResting(true), 45000); return () => clearTimeout(timer) }, [frozen, readOnly, reaction])
  const react = (kind: ReactionKind): void => {
    if (!interactive) return
    setResting(false)
    const next = reactionFor(kind, motion.current.count++, motion.current.text)
    if (look.mischief === 'quiet') { next.scene = kind === 'head' ? 'glasses-clean' : 'boop'; next.text = '' }
    if (look.mischief === 'extra' && kind === 'poke') next.scene = ['shimmy', 'chaos', 'hula-hoop'][motion.current.count % 3]
    motion.current.text = next.text; motion.current.lastKind = kind; setReaction({ ...next, kind })
    if (reply.current) clearTimeout(reply.current)
    reply.current = setTimeout(reset, 2600)
  }
  const idle = resting ? look.roles.resting !== 'auto' ? look.roles.resting : 'nap' : look.roles.idle !== 'auto' ? look.roles.idle : 'idle'
  const scene = reaction?.scene ?? idle
  const caption = look.captions && reaction?.text ? reaction.text : words ? MOTIONS.find(m => m.id === scene)?.defaultWord ?? '' : ''
  return <div className="ob-brain-stage">
    <button ref={button} className="ob-brain-toy" type="button" disabled={!interactive} aria-label="OddBrain, interactive mascot" aria-describedby={hint} title="OddBrain" data-reaction={reaction?.kind ?? 'idle'}
      style={{ transform: frozen ? 'none' : `translate(${offset.x}px, ${offset.y}px) rotate(${offset.tilt}deg)` }}
      onPointerEnter={() => setResting(false)}
      onPointerDown={e => {
        if (!interactive || e.button !== 0) return
        const rect = e.currentTarget.getBoundingClientRect()
        drag.current = { x: e.clientX, y: e.clientY, at: performance.now(), top: rect.top, height: rect.height, dragged: false, held: false }
        e.currentTarget.setPointerCapture(e.pointerId); clearHold()
        hold.current = setTimeout(() => { if (drag.current && !drag.current.dragged) { drag.current.held = true; react('hold') } }, 650)
      }}
      onPointerMove={e => {
        if (!interactive) return
        const d = drag.current
        if (d) { const x = e.clientX - d.x, y = e.clientY - d.y; if (Math.abs(x) + Math.abs(y) > 10) { d.dragged = true; clearHold(); if (!frozen) setOffset({ x: Math.max(-64, Math.min(64, x)), y: Math.max(-40, Math.min(40, y)), tilt: Math.max(-12, Math.min(12, x * .12)) }) } }
        else { const now = performance.now(), m = motion.current; m.distance = now - m.lastMove < 180 ? m.distance + Math.abs(e.clientX - m.lastX) + Math.abs(e.clientY - m.lastY) : 0; m.lastMove = now; m.lastX = e.clientX; m.lastY = e.clientY; if (m.distance > 160 && (!m.tickled || now - m.tickled > 1600)) { m.distance = 0; m.tickled = now; react('tickle') } }
      }}
      onPointerUp={e => {
        clearHold(); const d = drag.current; drag.current = null; setOffset({ x: 0, y: 0, tilt: 0 })
        if (!d || d.held) return
        if (d.dragged) { const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y); react(dist > 80 && dist / (performance.now() - d.at) > .5 ? 'flick' : 'drag'); return }
        const now = Date.now(), m = motion.current; m.taps = m.taps.filter(at => now - at < 1600); m.taps.push(now)
        // A scene swap replaces SVG event targets. Detect the physical second
        // tap here instead of relying only on a browser dblclick target.
        const double = now - m.lastTap < 350 && Math.hypot(e.clientX - m.tapX, e.clientY - m.tapY) < 24
        m.lastTap = now; m.tapX = e.clientX; m.tapY = e.clientY
        const y = (e.clientY - d.top) / d.height; react(m.taps.length >= 4 ? 'many' : double ? 'double' : y < .42 ? 'head' : y > .73 ? 'shoes' : 'poke')
      }}
      onPointerCancel={() => { clearHold(); drag.current = null; reset() }}
      onDoubleClick={() => { if (motion.current.lastKind !== 'double' && motion.current.taps.length < 4) react('double') }}
      onKeyDown={e => {
        const keys: Record<string, ReactionKind> = { Enter: 'poke', ' ': 'poke', ArrowUp: 'head', ArrowDown: 'shoes', ArrowLeft: 'drag', ArrowRight: 'flick' }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); reset() }
        else if (keys[e.key]) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) react(keys[e.key]) }
      }}>
      <Mascot motion={scene} size={180} />
    </button>
    <span id={hint} className="sr-only">Enter or Space pokes. Arrows choose reactions. Escape returns to rest.</span>
    <div className={`ob-brain-reply ${caption ? 'is-visible' : ''}`} role="status" aria-live="polite">{caption}</div>
  </div>
}
