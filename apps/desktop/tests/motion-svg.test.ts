import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { namespaceMotionSvg, prepareMotionSvg, scaleMotionDurations } from '../src/shared/lib/motionSvg'
import { ARTWORK_IDS } from '../src/shared/lib/motionKitData'

const ASSET_DIR = join(import.meta.dirname ?? 'tests', '..', 'src', 'renderer', 'src', 'assets', 'motion')

const readScene = (id: string): string => readFileSync(join(ASSET_DIR, `${id}.svg`), 'utf8')

/**
 * Two live instances of one scene must never fight over an id or a keyframe:
 * every `ob-…` token (root id, element ids, keyframe names, url() clips,
 * aria-labelledby lists) gets the instance suffix, consistently.
 */
test('namespacing suffixes the whole ob- token family, per instance', () => {
  const source = readScene('idle')
  const a = namespaceMotionSvg(source, 'i-a')
  const b = namespaceMotionSvg(source, 'i-b')

  // The renderer always namespaces FROM the pristine string, so the shipped
  // file on disk stays byte-exact no matter how many instances mount.
  assert.equal(readScene('idle'), source)

  // The root id, its style block selectors, and url() refs all move together.
  assert.ok(a.includes('id="ob-idle-i-a"'), 'root id suffixed')
  assert.ok(a.includes('#ob-idle-i-a '), 'style selectors follow the root id')
  assert.ok(a.includes('ob-idle-k1-i-a'), 'keyframe names suffixed')
  assert.ok(a.includes('animation:ob-idle-k1-i-a') || a.includes('ob-idle-k1-i-a '), 'animation references follow')
  assert.ok(!a.includes('animation:ob-idle-k1 '), 'no unsuffixed keyframe reference survives')
  assert.ok(a.includes('url(#ob-idle-body-clip-i-a)'), 'clip refs follow')
  assert.ok(a.includes('aria-labelledby="ob-idle-title-i-a'), 'aria refs follow')

  // Two instances are fully disjoint id families.
  const ids = (svg: string) => [...svg.matchAll(/id="(ob-[^"]+)"/g)].map((m) => m[1])
  const idsA = ids(a)
  const idsB = ids(b)
  assert.ok(idsA.length > 10, 'the scene has a real id family')
  assert.equal(idsA.filter((id) => idsB.includes(id)).length, 0, 'no id is shared between instances')
  assert.ok(a.includes('ob-idle-i-a') && !b.includes('ob-idle-i-a'))
})

test('durations scale inside the instance styles only — shipped files stay exact', () => {
  const source = readScene('idle')
  const scaled = scaleMotionDurations(source, 1.6)
  assert.ok(scaled.includes('5.12s'), '3.2s × 1.6 = 5.12s in the style block')
  assert.ok(!source.includes('5.12s'), 'the pristine file is unchanged')
  assert.equal(scaleMotionDurations(source, 1), source, 'scale 1 is a perfect no-op')

  // Only <style> durations scale; nothing outside a style block is touched.
  const marker = '<title>waits 3s for no reason</title>'
  const probe = `<svg xmlns="http://www.w3.org/2000/svg">${marker}<style>.x{animation:ob-x-k1 2s linear infinite}</style></svg>`
  const scaledProbe = scaleMotionDurations(probe, 1.5)
  assert.ok(scaledProbe.includes('waits 3s for no reason'), 'text content keeps its bytes')
  assert.ok(scaledProbe.includes('3s linear'), 'style durations scale (2s × 1.5 = 3s)')
})

test('every shipped scene namespaces cleanly and keeps its animation wiring', () => {
  for (const id of ARTWORK_IDS) {
    const prepared = prepareMotionSvg(readScene(id), 'i-x', 1.6)
    assert.ok(prepared.startsWith('<svg'), `${id} still starts as an SVG`)
    assert.ok(prepared.includes('-i-x'), `${id} carries the instance suffix`)
    const unscaled = prepareMotionSvg(readScene(id), 'i-x', 1)
    assert.equal(unscaled.replaceAll('-i-x', ''), readScene(id), `${id}: stripping the suffix restores the shipped bytes`)
  }
})
