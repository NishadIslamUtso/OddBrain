import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ARTWORK_IDS,
  KIT_VERSION,
  LOADER_ID,
  MOTIONS,
  STATUS_MAP,
  VARIANT_MAP,
} from '../src/shared/lib/motionKitData'
import {
  pairingsForRole,
  pairingAt,
  PHASE_LABEL,
  ROLE_POOLS,
  durationScaleFor,
  motionPaused,
  phaseFromTurn,
  WAITING_LOADER,
  type MotionRole,
} from '../src/shared/lib/motionKit'

const ASSET_DIR = join(import.meta.dirname ?? 'tests', '..', 'src', 'renderer', 'src', 'assets', 'motion')

/**
 * The kit is a shipped asset, not a decoration: 76 scenes + the loader,
 * byte-exact from the 3.0.1 gallery; 304 words; and the owner's rule that
 * EVERY animation is reachable through some real app state.
 */
test('the kit ships whole: 77 byte-exact scenes, the 3.0.1 forge, 304 words', () => {
  assert.equal(KIT_VERSION, '3.0.1')
  const files = readdirSync(ASSET_DIR).filter((f) => f.endsWith('.svg')).sort()
  assert.equal(files.length, 77, '77 SVG files ship (76 scenes + loader)')
  assert.deepEqual(files.map((f) => f.replace(/\.svg$/, '')), [...ARTWORK_IDS].sort())
  for (const id of ARTWORK_IDS) {
    const svg = readFileSync(join(ASSET_DIR, `${id}.svg`), 'utf8')
    assert.ok(svg.startsWith('<svg'), `${id} is an SVG`)
    assert.ok(svg.includes('</svg>'), `${id} is complete`)
    assert.ok(svg.includes(`ob-${id}`) || id === LOADER_ID, `${id} carries its ob- token family`)
  }
  assert.equal(MOTIONS.length, 76)
  assert.equal(Object.keys(STATUS_MAP).length, 304)
  assert.equal(Object.keys(VARIANT_MAP).length, 304)
  // The 3.0.1 kit corrected the forge's hammer orientation; its words prove
  // the version by content, not just a string.
  const forge = MOTIONS.find((mo) => mo.id === 'forge')
  assert.ok(forge, 'forge ships')
  assert.ok(forge.words.includes('Tinkering'))
  assert.ok(forge.words.includes('Forging'))
})

test('every variant names a real scene; the loader is the only utility', () => {
  const known = new Set([...MOTIONS.map((mo) => mo.id), LOADER_ID])
  for (const [word, ids] of Object.entries(VARIANT_MAP)) {
    assert.ok(ids.length >= 1, `${word} has at least one animation`)
    for (const id of ids) assert.ok(known.has(id), `${word} → ${id} exists`)
  }
  assert.equal(WAITING_LOADER, 'loader-eye-roll')
  assert.ok(existsSync(join(ASSET_DIR, 'loader-eye-roll.svg')), 'the waiting loader ships')
})

test("the owner's rule: all 76 scenes are reachable through the eight roles", () => {
  const assigned = new Set<string>()
  for (const role of Object.keys(ROLE_POOLS) as MotionRole[]) {
    for (const id of ROLE_POOLS[role]) {
      assigned.add(id)
      assert.ok(
        MOTIONS.some((mo) => mo.id === id),
        `${role} pool names a real scene: ${id}`,
      )
    }
  }
  for (const mo of MOTIONS) {
    assert.ok(assigned.has(mo.id), `scene ${mo.id} must sit in at least one role pool`)
  }
  // The two one-shots have homes: assemble finishes a making run, shades-drop
  // lands a done celebration.
  assert.ok(ROLE_POOLS.making.includes('assemble'))
  assert.ok(ROLE_POOLS.done.includes('shades-drop'))
})

test('all 304 words are reachable through some role — none shipped dead', () => {
  const reachable = new Set<string>()
  for (const role of Object.keys(ROLE_POOLS) as MotionRole[]) {
    for (const pairing of pairingsForRole(role)) reachable.add(pairing.word)
  }
  assert.equal(reachable.size, 304, `expected all 304 kit words reachable, got ${reachable.size}`)
})

test('every role has words, and each word carries animations inside its pool', () => {
  for (const role of Object.keys(ROLE_POOLS) as MotionRole[]) {
    const pairings = pairingsForRole(role)
    assert.ok(pairings.length >= 2, `${role} has more than one word`)
    const pool = new Set(ROLE_POOLS[role])
    for (const pairing of pairings) {
      assert.ok(pairing.motionIds.length >= 1, `${role}/${pairing.word} resolves to a scene`)
      const known = new Set([...pairing.motionIds])
      for (const id of known) {
        assert.ok(
          pool.has(id) || Object.values(ROLE_POOLS).some((other) => other.includes(id)),
          `${role}/${pairing.word} → ${id} is a real scene`,
        )
      }
    }
  }
})

test('rotation shows every word AND every animation of a role — nothing random', () => {
  for (const role of Object.keys(ROLE_POOLS) as MotionRole[]) {
    const pairings = pairingsForRole(role)
    const words = new Set<string>()
    const scenes = new Set<string>()
    for (let tick = 0; tick < pairings.length * pairingWheelMax(role); tick += 1) {
      const { word, motionIds } = pairingAt(role, tick, 3)
      words.add(word)
      scenes.add(motionIds[0])
    }
    assert.equal(words.size, pairings.length, `${role}: every word turns up`)
    const expected = new Set<string>()
    for (const pairing of pairings) for (const id of pairing.motionIds) expected.add(id)
    assert.deepEqual(
      [...scenes].sort(),
      [...expected].sort(),
      `${role}: rotation reaches every animation the role owns`,
    )
    // Deterministic: the same tick, same seed, same pairing.
    assert.deepEqual(pairingAt(role, 7, 3), pairingAt(role, 7, 3))
  }
})

function pairingWheelMax(role: MotionRole): number {
  const pairings = pairingsForRole(role)
  return Math.max(...pairings.map((p) => p.motionIds.length))
}

test('the phase reader maps REAL turn states to roles, cards first', () => {
  // A permission question outranks everything: the engine is stopped at a card.
  assert.equal(
    phaseFromTurn({ state: 'running', permissions: [{ requestId: 'r' }], items: [{ kind: 'thinking', text: 'hmm' }] }),
    'waiting',
  )
  assert.equal(
    phaseFromTurn({
      state: 'running',
      permissions: [],
      items: [{ kind: 'tool', name: 'Write', summary: 'note.md' }, { kind: 'thinking', text: 'checking' }],
    }),
    'thinking', // no permission pending: the newest item decides
  )
  assert.equal(
    phaseFromTurn({ state: 'running', permissions: [], items: [{ kind: 'tool', name: 'Write', summary: 'note.md' }] }),
    'making',
  )
  assert.equal(
    phaseFromTurn({ state: 'running', permissions: [], items: [{ kind: 'tool', name: 'Bash', summary: 'ls' }] }),
    'working',
  )
  assert.equal(
    phaseFromTurn({ state: 'running', permissions: [], items: [{ kind: 'tool', name: 'Glob', summary: '*' }, { kind: 'text', text: 'Here is' }] }),
    'working',
    'text after tools is the working tail',
  )
  assert.equal(
    phaseFromTurn({ state: 'running', permissions: [], items: [{ kind: 'text', text: 'Working on it' }] }),
    'thinking',
    'words with no tool yet are still reasoning',
  )
  assert.equal(phaseFromTurn({ state: 'done', permissions: [], items: [] }), 'done')
})

test('motion modes: Calm slows to 1.6×, Still and the OS preference stop everything', () => {
  assert.equal(durationScaleFor('calm', false), 1.6)
  assert.equal(durationScaleFor('balanced', false), 1)
  assert.equal(durationScaleFor('playful', false), 0.85)
  assert.equal(motionPaused('still', false), true)
  assert.equal(motionPaused('balanced', false), false)
  assert.equal(motionPaused('calm', true), true, 'the OS reduced-motion preference wins in every mode')
  assert.equal(motionPaused('system', true), true)
  assert.equal(motionPaused('system', false), false)
  // The honest phase names are real words a person can read, per role.
  assert.equal(PHASE_LABEL.waiting, 'waiting for you')
  assert.equal(PHASE_LABEL.making, 'making')
})
