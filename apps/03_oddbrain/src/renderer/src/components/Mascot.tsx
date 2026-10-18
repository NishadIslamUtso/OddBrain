import type { CSSProperties } from 'react'
import idle from '../assets/motion/idle.svg?raw'
import read from '../assets/motion/read.svg?raw'
import think from '../assets/motion/think.svg?raw'

const scenes = { idle, read, think }
export function Mascot({
  scene = 'idle',
  still = false,
  size = 116,
}: {
  scene?: keyof typeof scenes
  still?: boolean
  size?: number
}) {
  // Static, bundled SVG from the selected UI branch. Never insert user content.
  return (
    <span
      className="ob-mascot"
      role="img"
      aria-label="OddBrain mascot"
      style={{ width: size, height: size, '--play-state': still ? 'paused' : 'running' } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: scenes[scene] }}
    />
  )
}
