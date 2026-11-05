import { MOTIONS, LOADER_ID, type MotionSpec } from '@shared/lib/motionKitData'
/** The generated native kit intentionally separates its 76 regular scenes
 * from the compact utility loader. Appearance offers all 77 for preview and role assignment. */
export const SCENES: readonly MotionSpec[] = [
  ...MOTIONS,
  { id: LOADER_ID, name: 'Pocket-size eye-roll loader', category: 'Utility', duration: 1.2, loop: true, energy: 'low', defaultWord: 'Loading', words: ['Loading'] },
]
