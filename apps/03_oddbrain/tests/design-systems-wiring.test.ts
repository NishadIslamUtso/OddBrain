import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
test('a design system and a pack theme are one look at a time', () => {
  const mods = readFileSync(new URL('../src/renderer/src/components/ModsSection.tsx', import.meta.url), 'utf8')
  assert.match(mods, /packCss: theme\.css, designSystem: '' /)
  const appearance = readFileSync(new URL('../src/renderer/src/ui/AppearancePanel.tsx', import.meta.url), 'utf8')
  assert.match(appearance, /designSystem: e\.target\.value, packCss: ''/)
})

test('the Appearance pane offers the whole gallery, not a subset', () => {
  const appearance = readFileSync(new URL('../src/renderer/src/ui/AppearancePanel.tsx', import.meta.url), 'utf8')
  assert.match(appearance, /DESIGN_SYSTEMS\.map/)
  assert.match(appearance, /Design system/)
  const catalog = readFileSync(new URL('../src/shared/lib/design-systems/index.ts', import.meta.url), 'utf8')
  assert.ok((catalog.match(/id: '/g) || []).length >= 16)
})

