import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
test('a design system and a pack theme are one look at a time', () => {
  const mods = readFileSync(new URL('../src/renderer/src/components/ModsSection.tsx', import.meta.url), 'utf8')
  assert.match(mods, /packCss: theme\.css, designSystem: '' /)
  const settings = readFileSync(new URL('../src/renderer/src/components/SettingsView.tsx', import.meta.url), 'utf8')
  assert.match(settings, /designSystem: system\.id, packCss: '' /)
})

test('the Appearance pane offers the whole gallery, not a subset', () => {
  const settings = readFileSync(new URL('../src/renderer/src/components/SettingsView.tsx', import.meta.url), 'utf8')
  assert.match(settings, /DESIGN_SYSTEMS\.map/)
  assert.match(settings, /Design system/)
})

