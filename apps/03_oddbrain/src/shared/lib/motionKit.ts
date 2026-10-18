/**
 * The motion kit's assignment brain: which animation and which status word a
 * real app state gets. The kit ships 76 scenes + a loader and 304 words; the
 * OWNER'S RULE for this app: every animation is reachable, a word always
 * travels with the animation it was measured for (the kit's own variant map),
 * and a word is flavour — it never replaces the honest state name beside it.
 */

import { LOADER_ID, MOTIONS, STATUS_MAP, VARIANT_MAP, type MotionSpec } from './motionKitData'

/** The eight assignable roles the brief fixes, mapped to real app states. */
export type MotionRole = 'resting' | 'idle' | 'thinking' | 'working' | 'making' | 'waiting' | 'searching' | 'done'

/**
 * Role → scene pools. Deliberate, documented, and test-enforced:
 * every one of the 76 scenes sits in at least one pool, so rotation through
 * real states eventually shows every animation. The loader is not a pool
 * member — it is the utility for waiting, exactly as the kit assigns it.
 */
export const ROLE_POOLS: Readonly<Record<MotionRole, readonly string[]>> = Object.freeze({
  // Empty screens and the hero: calm, low-energy scenes.
  resting: ['idle', 'nap', 'hammock', 'mochi-melt', 'lotus-float', 'stretch', 'float', 'bubbles', 'glasses-clean', 'boop'],
  // The app is alive between work.
  idle: ['idle', 'float'],
  // The engine has the order and is reasoning.
  thinking: ['think', 'compute', 'idea', 'architect', 'sketch', 'read', 'lens-inspector', 'eye-roll', 'glasses-clean', 'unwind'],
  // Tools are running: reads, searches, commands, travel between places.
  working: ['type', 'run', 'waddle', 'tunnel', 'warp', 'shoe-skateboard', 'sneak', 'juggle-shoes', 'juggle-glasses', 'juggle-body', 'magnet', 'grow', 'unwind', 'branch-merge', 'hinge-tune', 'bee-bloom', 'flashlight-search', 'wind-up', 'stir', 'gust', 'shoe-lasso', 'talk'],
  // The engine is writing: files, artifacts, recipes taking shape.
  making: ['forge', 'transform', 'sketch', 'architect', 'grow', 'branch-merge', 'hinge-tune', 'wind-up', 'assemble', 'bake', 'stir', 'whisk', 'pan-flip', 'noodle-slurp', 'dissolve', 'bee-bloom'],
  // The engine is stopped at a permission card, waiting for a person.
  waiting: ['eye-roll', 'pocket-panic', 'rain-check', 'peekaboo', 'sneeze', 'talk', 'megaphone', 'topsy', 'shoe-phone', 'shoe-lasso', 'snow-shiver'],
  // Looking for something in the vault, a chat, a page.
  searching: ['flashlight-search', 'lens-inspector', 'sneak', 'peekaboo', 'tunnel', 'magnet', 'glasses-clean'],
  // A turn finished: celebration, with the two one-shots saved for exactly this.
  done: ['confetti', 'sparkle', 'self-hug', 'belly-laugh', 'shades-drop', 'boop', 'moonwalk', 'shimmy', 'wiggle', 'chaos', 'spin', 'cancan', 'tap-dance', 'accordion', 'maestro', 'ribbon', 'cheek-drums', 'brain-kickflip', 'balloon-brain', 'shoe-vortex', 'hula-hoop', 'megaphone'],
})

/** The kit's utility: THE loading state, for waiting — never for errors. */
export const WAITING_LOADER = LOADER_ID

/** Tools that change files — these make the 'making' role, not 'working'. */
export const WRITE_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/** The honest phase names shown in the engine card header (never flavour). */
export const PHASE_LABEL: Readonly<Record<MotionRole, string>> = Object.freeze({
  resting: 'resting',
  idle: 'idle',
  thinking: 'thinking',
  working: 'working',
  making: 'making',
  waiting: 'waiting for you',
  searching: 'searching',
  done: 'done',
})

/** The smallest slice of a turn the phase reader needs — no renderer imports. */
export type TurnLike = {
  state: string
  permissions: unknown[]
  items: ReadonlyArray<{ kind: string; name?: string }>
}

/**
 * The real state of a turn, as the motion system may speak it. A permission
 * question outranks everything (the engine is stopped at a card); the newest
 * item decides between making/working/thinking; a closed turn is done.
 */
export function phaseFromTurn(turn: TurnLike): MotionRole {
  if (turn.state !== 'running') return 'done'
  if (turn.permissions.length > 0) return 'waiting'
  const items = turn.items
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (item.kind === 'tool') return WRITE_TOOLS.has(item.name ?? '') ? 'making' : 'working'
    if (item.kind === 'thinking') return 'thinking'
    if (item.kind === 'text' || item.kind === 'status' || item.kind === 'done' || item.kind === 'error') {
      // The answer is streaming: if a tool already ran this is the working
      // tail; otherwise the engine is still reasoning its way to words.
      const sawTool = items.slice(0, i).some((earlier) => earlier.kind === 'tool')
      return sawTool ? 'working' : 'thinking'
    }
  }
  return 'thinking'
}

/** One word and the animations measured to carry it. */
export type MotionPairing = { word: string; motionIds: readonly string[] }

const pairingCache = new Map<MotionRole, MotionPairing[]>()

/** Every word assignable to a role, each tied to its animations inside the pool. */
export function pairingsForRole(role: MotionRole): readonly MotionPairing[] {
  const hit = pairingCache.get(role)
  if (hit) return hit
  const pool = new Set(ROLE_POOLS[role])
  const seen = new Set<string>()
  const pairings: MotionPairing[] = []
  for (const id of ROLE_POOLS[role]) {
    const motion = MOTIONS.find((mo: MotionSpec) => mo.id === id)
    if (!motion) continue
    for (const word of motion.words) {
      if (seen.has(word)) continue
      seen.add(word)
      const inPool = (VARIANT_MAP[word] ?? []).filter((mid) => pool.has(mid))
      const ids = inPool.length ? inPool : (VARIANT_MAP[word]?.length ? VARIANT_MAP[word] : [id])
      pairings.push({ word, motionIds: ids })
    }
  }
  // Kit words that map straight into this pool but were listed on a scene
  // outside it still belong here when their variant lands in the pool.
  for (const word of Object.keys(STATUS_MAP)) {
    if (seen.has(word)) continue
    const inPool = (VARIANT_MAP[word] ?? []).filter((mid) => pool.has(mid))
    if (inPool.length) {
      seen.add(word)
      pairings.push({ word, motionIds: inPool })
    }
  }
  pairings.sort((a, b) => a.word.localeCompare(b.word))
  pairingCache.set(role, pairings)
  return pairings
}

/**
 * The pairing at tick n: words turn over round-robin, and each repeat of the
 * wheel moves to the word's NEXT animation — so over two wheels every word has
 * shown every animation it owns, and every scene in the pool has been on
 * screen. Deterministic given the seed; nothing random.
 */
export function pairingAt(role: MotionRole, tick: number, seed = 0): MotionPairing {
  const pairings = pairingsForRole(role)
  const wordIndex = (((tick + seed) % pairings.length) + pairings.length) % pairings.length
  const pairing = pairings[wordIndex]
  const wheel = Math.floor((tick + seed) / pairings.length)
  const motionIndex = wheel % pairing.motionIds.length
  return { word: pairing.word, motionIds: [pairing.motionIds[motionIndex]] }
}

/** The scene id a pairing resolves to right now (its one chosen animation). */
export function pairingMotion(pairing: MotionPairing): string {
  return pairing.motionIds[0]
}

/** How the appearance setting maps onto the kit's animation speed. */
export type MotionModeName = 'system' | 'calm' | 'balanced' | 'playful' | 'still'

export const MOTION_MODES: readonly { name: MotionModeName; label: string }[] = Object.freeze([
  { name: 'system', label: 'System' },
  { name: 'calm', label: 'Calm' },
  { name: 'balanced', label: 'Balanced' },
  { name: 'playful', label: 'Playful' },
  { name: 'still', label: 'Still' },
])

/** Calm slows the scenes (the brief's own 1.6×); Still stops them. */
export function durationScaleFor(mode: MotionModeName, osReduced: boolean): number {
  if (mode === 'still' || (mode === 'system' && osReduced)) return 1 // paused at the class level, scale irrelevant
  if (mode === 'calm') return 1.6
  if (mode === 'playful') return 0.85
  return 1
}

/** Still stops them; the OS reduced-motion preference stops them everywhere —
 *  the kit's own rule ("reduced motion stops animation everywhere"), so it
 *  wins over every mode. Calm slows the scenes (the brief's own 1.6×). */
export function motionPaused(mode: MotionModeName, osReduced: boolean): boolean {
  return mode === 'still' || osReduced
}
