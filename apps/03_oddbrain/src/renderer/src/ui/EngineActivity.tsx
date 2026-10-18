import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PHASE_LABEL, phaseFromTurn } from '@shared/lib/motionKit'
import { Mascot, scenePairing } from '../motion/Mascot'
import { getMotionMode, subscribeMotionMode } from '../motion/motionMode'
import { useEngine } from '../state/engine'
import { useLook } from './LookContext'
import { MotionOverride } from './MotionContext'

/** Read-only view of the actual turn. Permission handling stays in EnginePanel. */
export default function EngineActivity({ words = false }: { words?: boolean }) {
  const engine = useEngine(), look = useLook(), env = useSyncExternalStore(subscribeMotionMode, getMotionMode), override = useContext(MotionOverride)
  const turn = engine.turn, running = turn?.state === 'running', previous = useRef(false)
  const [celebrate, setCelebrate] = useState(false), [tick, setTick] = useState(0)
  const frozen = look.paused || env.paused || env.mode === 'still' || env.osReduced || (override ?? env.mode) === 'still'
  useEffect(() => {
    if (running) { previous.current = true; setCelebrate(false); return }
    if (!previous.current) return
    previous.current = false
    if (turn?.state !== 'done') { setCelebrate(false); return }
    setCelebrate(true); const timer = setTimeout(() => setCelebrate(false), 1700)
    return () => clearTimeout(timer)
  }, [running, turn?.state])
  useEffect(() => { if (!running || frozen) return; const timer = setInterval(() => setTick(n => n + 1), 5000); return () => clearInterval(timer) }, [running, frozen])
  if (!running && !celebrate) return null
  let role = turn ? phaseFromTurn(turn) : 'done'
  const latestTool = turn?.items.filter(i => i.kind === 'tool').at(-1)
  if (role === 'working' && latestTool?.kind === 'tool' && /^(grep|glob|search|websearch|web_search|find)$/i.test(latestTool.name || '')) role = 'searching'
  const pair = scenePairing(role, tick, look.roles, 0)
  return <div className="ob-engine-activity" role="status"><Mascot motion={pair.motionIds[0]} size={24} /><span>{PHASE_LABEL[role]}</span>{words ? <span aria-hidden="true" className="ob-activity-word">{pair.word}</span> : null}{role === 'waiting' ? <button type="button" className="ob-text-button" onClick={() => window.dispatchEvent(new Event('app:show-approval'))}>Review request</button> : null}</div>
}
