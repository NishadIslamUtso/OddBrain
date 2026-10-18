import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SCENES as MOTIONS } from '../src/renderer/src/ui/sceneCatalog'
import { pairingAt } from '../src/shared/lib/motionKit'
import { ROLES } from '../src/renderer/src/state/look'
import { scenePairing, INSTANCE_BUDGET, motionAsset } from '../src/renderer/src/motion/Mascot'
import { REACTIONS, reactionFor } from '../src/renderer/src/ui/InteractiveBrain'
import { launchSvg } from '../src/renderer/src/ui/LaunchOverlay'
import { getMotionMode, setMotionMode, setOsReducedMotion, setMascotPause } from '../src/renderer/src/motion/motionMode'

test('automatic roles preserve the original kit pairing; manual roles use the chosen scene words', () => {
  for (const role of ROLES) for (let n = 0; n < 12; n++) assert.deepEqual(scenePairing(role, n, { [role]: 'auto' }, 3), pairingAt(role, n, 3))
  for (const role of ROLES) for (const scene of MOTIONS) {
    const p = scenePairing(role, 7, { [role]: scene.id }, 2)
    assert.deepEqual(p.motionIds, [scene.id]); assert(scene.words.includes(p.word) || p.word === scene.defaultWord)
  }
})
test('the kit remains 77 byte-exact assets and animation budget remains six', () => {
  assert.equal(INSTANCE_BUDGET, 6)
  for (const m of MOTIONS) assert.equal(motionAsset(m.id), readFileSync(resolve(`src/renderer/src/assets/motion/${m.id}.svg`), 'utf8'))
})
test('every physical reaction uses real artwork, stays short and avoids immediate repeated replies', () => {
  for (const kind of Object.keys(REACTIONS) as (keyof typeof REACTIONS)[]) {
    const first = reactionFor(kind, 0), second = reactionFor(kind, 1, first.text)
    assert(MOTIONS.some(m => m.id === first.scene)); assert(MOTIONS.some(m => m.id === second.scene))
    assert(first.text.length < 100); assert.notEqual(first.text, second.text)
  }
  const source = readFileSync(resolve('src/renderer/src/ui/InteractiveBrain.tsx'), 'utf8')
  assert.doesNotMatch(source, /fetch\(|engineStore|bridge\.|speechSynthesis|getUserMedia/)
  assert.match(source, /ArrowLeft/); assert.match(source, /ArrowRight/); assert.match(source, /onPointerCancel/)
  assert.match(source, /clearTimeout\(hold\.current\)/); assert.match(source, /clearTimeout\(reply\.current\)/)
})
test('the motion store snapshot is cached and a global pause is independently observable', () => {
  setMotionMode('balanced'); setOsReducedMotion(false); setMascotPause(false)
  const a = getMotionMode(); assert.equal(getMotionMode(), a)
  setMascotPause(true); const b = getMotionMode(); assert.notEqual(a, b); assert.equal(b.paused, true)
  setMascotPause(true); assert.equal(getMotionMode(), b)
  setOsReducedMotion(true); assert.equal(getMotionMode().osReduced, true)
  setMascotPause(false); setOsReducedMotion(false); setMotionMode('system')
})
test('opening travel reaches the actual viewport edges, without changing the SVG files', () => {
  const raw = motionAsset('assemble')!
  const a = launchSvg(raw, 'test-a', 940, 620), b = launchSvg(raw, 'test-b', 3840, 2160)
  assert.notEqual(a, raw); assert.notEqual(b, raw)
  assert.match(a, /ob-assemble-test-a/); assert.match(b, /ob-assemble-test-b/)
  const first = (s: string): number => Math.abs(Number(s.match(/0%\{transform:translate\((-?\d+)px/)?.[1]))
  assert(first(b) > first(a)); assert.equal(motionAsset('assemble'), raw)
})
test('preview controls share real React shells/composer/home and never start another engine', () => {
  const source = readFileSync(resolve('src/renderer/src/ui/AppearancePreview.tsx'), 'utf8')
  assert.match(source, /<DesktopShell/); assert.match(source, /<Sidebar/)
  assert.match(source, /<ChatHome/); assert.match(source, /<ComposerSurface/); assert.match(source, /<MessageRow/)
  assert.match(source, /inert/); assert.doesNotMatch(source, /engineStore\(\)\.init|bridge\.|fetch\(/)
  const title = readFileSync(resolve('src/renderer/src/components/TitleBar.tsx'), 'utf8')
  assert.doesNotMatch(title, /bg-ok|bg-warn|bg-muted|Needs you|Vault offline/)
  const side = readFileSync(resolve('src/renderer/src/components/Sidebar.tsx'), 'utf8')
  assert.doesNotMatch(side, />Local<|UserMenuItem/)
  assert.match(side, /ProfileButton/)
})
