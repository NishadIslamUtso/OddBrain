import { createContext } from 'react'
import type { MotionModeName } from '@shared/lib/motionKit'
/** Read-only previews may demonstrate another mode without changing the app. */
export const MotionOverride = createContext<MotionModeName | null>(null)
