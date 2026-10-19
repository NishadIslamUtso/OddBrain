import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { DEFAULT_APPEARANCE, normalizeAppearance } from '../src/renderer/src/state/appearance'
import { DEFAULT_LOOK, DEFAULT_SIDEBAR, ROLES, UI_FONTS, contrast, importLook, lookSnapshot, lookTokens, normalizeLook, normalizeSavedLooks, normalizeSidebar, presetSnapshot } from '../src/renderer/src/state/look'
import { LAYOUTS, LOOK_PRESETS, PALETTES, INTERFACE_STYLES, TASTE_QUIZ, NEW_SCENE_IDS } from '../src/renderer/src/ui/lookCatalog'
import { SCENES as MOTIONS } from '../src/renderer/src/ui/sceneCatalog'
import { DEFAULT_LAB, labMarkdown, normalizeLab, quizMatches } from '../src/renderer/src/state/lookLab'

test('complete owner inventory: every look, structure, palette, style and scene', () => {
  assert.equal(LOOK_PRESETS.length, 8); assert.equal(LAYOUTS.length, 8)
  assert.equal(PALETTES.length, 10); assert.equal(PALETTES.filter(p => p.id !== 'app').length, 9)
  assert.equal(INTERFACE_STYLES.length, 4); assert.equal(UI_FONTS.length, 5)
  assert.equal(ROLES.length, 8); assert.equal(MOTIONS.length, 77); assert.equal(NEW_SCENE_IDS.length, 16)
  assert.equal(TASTE_QUIZ.length, 5)
})
test('old native reading/theme values keep their meanings, not the HTML state meanings', () => {
  const old = { theme: 'light', accent: 'rose', font: 'anthropic-serif', width: 'wide', textSize: 'large', motion: 'calm', mascotWords: true, rowExplanations: true }
  assert.deepEqual(normalizeAppearance(old), { ...old, startupAnimation: true, packCss: '', designSystem: '' })
  assert.equal(normalizeAppearance({ motion: 'reduced' }).motion, 'still')
  assert.equal(DEFAULT_LOOK.interfaceFont, 'serif'); assert.equal(DEFAULT_LOOK.chatFollowsInterface, true)
})
test('missing/corrupt additional fields fall back individually and safely', () => {
  assert.deepEqual(normalizeLook(null), DEFAULT_LOOK)
  assert.deepEqual(normalizeLook([]), DEFAULT_LOOK)
  const value = normalizeLook({ palette: 'sage', paused: 'false', layout: 'evil', speed: Infinity, roles: { thinking: 'compute', working: '<script>' }, command: 'rm -rf', permissions: { cloud: true } })
  assert.equal(value.palette, 'sage'); assert.equal(value.paused, false); assert.equal(value.layout, DEFAULT_LOOK.layout); assert.equal(value.speed, 1)
  assert.equal(value.roles.thinking, 'compute'); assert.equal(value.roles.working, DEFAULT_LOOK.roles.working)
  assert(!('command' in value)); assert(!('permissions' in value))
})
test('numeric fields are bounded without changing the interface scale', () => {
  assert.equal(normalizeLook({ speed: .1 }).speed, .5); assert.equal(normalizeLook({ speed: 999 }).speed, 1.5)
  assert.equal(normalizeLook({ speed: 1.234 }).speed, 1.25)
  assert.deepEqual(normalizeSidebar({ width: -200, collapsed: 'true' }), { width: 200, collapsed: false })
  assert.equal(normalizeSidebar({ width: 99999 }).width, 420)
  assert.equal(normalizeSidebar({ width: 'wrong' }).width, 260)
})
test('all 77 assets can be assigned to each of the eight roles', () => {
  for (const role of ROLES) for (const scene of MOTIONS) assert.equal(normalizeLook({ roles: { [role]: scene.id } }).roles[role], scene.id)
})
test('every preset has valid distinct structural/data assignments and does not mutate inputs', () => {
  const a = { ...DEFAULT_APPEARANCE, width: 'wide' as const, textSize: 'large' as const, mascotWords: true }, side = { width: 330, collapsed: false }
  const look = normalizeLook({ ...DEFAULT_LOOK, interactions: false, captions: false, mischief: 'quiet', showThinking: true })
  const before = JSON.stringify({ a, side, look })
  for (const preset of LOOK_PRESETS) {
    const snapshot = presetSnapshot(preset.id, a, side, look)!
    assert(snapshot); assert.equal(snapshot.look.layout, preset.layout)
    assert.equal(snapshot.look.palette, preset.palette); assert.equal(snapshot.look.interactions, false)
    assert.equal(snapshot.look.captions, false); assert.equal(snapshot.look.showThinking, true)
    assert.equal(snapshot.look.mischief, 'quiet'); assert.equal(snapshot.appearance.width, 'wide')
    assert.equal(snapshot.appearance.textSize, 'large'); assert.equal(snapshot.appearance.mascotWords, true)
    assert.equal(snapshot.sidebar.width, 330)
    for (const role of ROLES) assert(MOTIONS.some(m => m.id === snapshot.look.roles[role]))
  }
  assert.equal(JSON.stringify({ a, side, look }), before)
})
test('each independent axis can change without reapplying or locking the preset', () => {
  const original = presetSnapshot('cozy-studio', DEFAULT_APPEARANCE, DEFAULT_SIDEBAR)!
  const changed = normalizeLook({ ...original.look, palette: 'midnight', layout: 'console', style: 'ink', interfaceFont: 'mono', density: 'compact', speed: 1.3, paused: true })
  assert.equal(changed.palette, 'midnight'); assert.equal(changed.layout, 'console'); assert.equal(changed.style, 'ink')
  assert.equal(changed.interfaceFont, 'mono'); assert.equal(changed.speed, 1.3); assert.equal(changed.paused, true)
  assert.deepEqual(changed.roles, original.look.roles)
})
test('240 palette/mode/accent resolutions meet measured body, muted, button and focus contrast', () => {
  let count = 0
  for (const p of PALETTES) for (const mode of ['light', 'dark', 'system', 'palette']) for (const accent of ['palette', 'violet', 'blue', 'teal', 'amber', 'rose']) {
    const a = normalizeAppearance({ theme: mode, accent }), l = normalizeLook({ palette: p.id, paletteTheme: mode === 'palette', paletteAccent: accent === 'palette' })
    const t = lookTokens(a, l, false)
    for (const surface of ['--color-bg', '--color-panel', '--color-card']) {
      assert(contrast(t['--color-ink'], t[surface]) >= 4.5, `${p.id}/${mode}/${accent} body`)
      assert(contrast(t['--color-muted'], t[surface]) >= 4.5, `${p.id}/${mode}/${accent} muted`)
      assert(contrast(t['--ob-accent-text'], t[surface]) >= 4.5)
    }
    assert(contrast(t['--color-accent'], t['--accent-ink']) >= 4.5)
    assert(contrast(t['--ob-focus'], t['--color-bg']) >= 3)
    count++
  }
  assert.equal(count, 240)
})
test('all 320 layout/palette/style states resolve without overriding font, size or width', () => {
  let count = 0
  const a = normalizeAppearance({ width: 'wide', textSize: 'large', font: 'anthropic-serif' })
  for (const layout of LAYOUTS) for (const palette of PALETTES) for (const style of INTERFACE_STYLES) {
    const look = normalizeLook({ layout: layout.id, palette: palette.id, style: style.id, interfaceFont: 'humanist', chatFollowsInterface: false })
    const vars = lookTokens(a, look)
    assert(vars['--font-sans'].includes('Trebuchet')); assert(!('--transcript-size' in vars)); assert(!('--chat-width' in vars))
    assert(!('--transcript-font' in vars)); count++
  }
  assert.equal(count, 320)
})
test('saved look round trip includes every UI setting and role, not keys/work/permissions', () => {
  const a = normalizeAppearance({ font: 'anthropic-serif', theme: 'dark', width: 'wide', mascotWords: true })
  const look = normalizeLook({ ...DEFAULT_LOOK, palette: 'rose', paletteTheme: true, paletteAccent: true, paused: true, speed: 1.35, layout: 'floating', roles: { thinking: 'compute' }, showThinking: true })
  const snap = lookSnapshot('A <name>', a, look, { width: 340, collapsed: true })
  assert.deepEqual(importLook(JSON.parse(JSON.stringify(snap))), snap)
  const malicious = { ...snap, keys: 'secret', commands: ['command'], loginItem: true, warmRuntime: true, permissions: { cloud: true }, chats: ['private'] }
  assert.deepEqual(importLook(malicious), snap)
  assert.equal(importLook({ ...snap, look: 'bad' }), null)
  assert.equal(importLook({ ...snap, appearance: [] }), null)
  assert.equal(importLook({ version: 3 }), null)
  assert.deepEqual(normalizeSavedLooks([snap, null, { format: 'other' }]), [snap])
})
test('quiz, verdicts, shortlist and notes remain functional persistent choices', () => {
  assert.deepEqual(normalizeLab(null), DEFAULT_LAB)
  const lab = normalizeLab({ verdicts: { 'quiet-minimal': 'love', bad: 'love' }, notes: { 'layout:rail': 'Useful <note>' }, shortlist: ['quiet-minimal', 'quiet-minimal', 'bad'], quiz: { 0: 2, 1: 2, 2: 1, 3: 1, 4: 1, 999: 1 } })
  assert.deepEqual(lab.shortlist, ['quiet-minimal']); assert(!('bad' in lab.verdicts)); assert(!('999' in lab.quiz))
  assert(quizMatches(lab.quiz)[0].score > 0); assert(quizMatches(lab.quiz)[0].reasons.length)
  const markdown = labMarkdown(lab); assert(markdown.includes('Quiet Minimal')); assert(markdown.includes('Useful <note>'))
})
test('all native provider-key controls stay byte-for-byte intact across the settings move', () => {
  // Pin real behavior directly. No replacement key forms or fake saves.
  const current = readFileSync(resolve('src/renderer/src/components/SettingsView.tsx'), 'utf8').replace(/\r\n/g, '\n')
  const providerBlock = current.slice(current.indexOf('    models: isDemo'), current.indexOf('    performance: [', current.indexOf('    models: isDemo')))
  assert.equal(createHash('sha256').update(providerBlock.slice(providerBlock.indexOf('      : ['))).digest('hex'), '06598a7604e4d22295ccf648cf7b948b9daa6a28ae99d395eec6d8eb0ac12409')
  assert.match(current, /await bridge\.cloud\.saveKey\(id, key\)/)
  assert.match(current, /bridge\.cloud\.clearKey/)
  assert.match(current, /setKeyDraft\(current => \(\{ \.\.\.current, \[id\]: '' \}\)\)/)
  assert.match(current, /Models & API keys/); assert.match(current, /connectors:/)
  assert.match(current, /extensions:/); assert.match(current, /Capture sources/)
  assert.match(current, /Windows & shortcuts/); assert.match(current, /About & help/)
  assert.match(current, /Open Capture sources in Vault/)
  assert.match(readFileSync(resolve('src/renderer/src/components/VaultView.tsx'), 'utf8'), /<MemoryMap open[\s\S]*?\bembedded\s*\/>/)
})

test('fresh defaults and reset match Ink & Sketchbook including the eight behaviour roles; saved choices survive', () => {
  const ink = LOOK_PRESETS.find(p => p.id === 'ink-sketchbook')!
  assert.deepEqual(DEFAULT_LOOK.roles, ink.roles)
  assert.equal(DEFAULT_LOOK.palette, ink.palette); assert.equal(DEFAULT_LOOK.style, ink.style)
  assert.equal(DEFAULT_LOOK.layout, ink.layout); assert.equal(DEFAULT_APPEARANCE.motion, ink.motion)
  const saved = normalizeLook({ ...DEFAULT_LOOK, palette: 'sage', layout: 'classic', roles: Object.fromEntries(ROLES.map(r => [r, 'auto'])) })
  assert.equal(saved.palette, 'sage'); assert.equal(saved.layout, 'classic')
  assert(ROLES.every(r => saved.roles[r] === 'auto'))
  assert.deepEqual(normalizeLook({}), DEFAULT_LOOK)
})
