// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_APPEARANCE,
  DESIGN_SYSTEM_STYLE_ID,
  applyAppearance,
  normalizeAppearance,
} from '../src/renderer/src/state/appearance'
import { DESIGN_SYSTEMS, designSystemCss, isDesignSystem, loadDesignTokens } from '../src/shared/lib/design-systems'

/**
 * The owner's ruling: "i want all the uiux appearance options that HTML had
 * as is. Not your skeleton, for all the screens." The sixteen token sets
 * shipped in this bundle for styling generated artifacts while the app's own
 * appearance stayed a skeleton. These pins: all sixteen are offered, each is
 * a COMPLETE token set, applying one restyles every screen through the app's
 * variables, and picking a system retires the pack style (one look at a time).
 */

test('all sixteen systems are bundled and offered', () => {
  assert.equal(DESIGN_SYSTEMS.length, 16)
  for (const id of ['claude', 'linear-app', 'apple', 'stripe', 'notion', 'vercel', 'airbnb', 'glassmorphism', 'neobrutalism', 'editorial', 'retro', 'dashboard', 'shadcn', 'minimal', 'modern', 'default']) {
    assert.ok(isDesignSystem(id), `${id} is bundled`)
  }
  assert.equal(isDesignSystem('nope'), false)
})

test('every system is a COMPLETE token set — palette, type, radii, accent ink', () => {
  for (const system of DESIGN_SYSTEMS) {
    const css = loadDesignTokens(system.id)
    assert.ok(css.length > 1000, `${system.id} carries real tokens (${css.length} chars)`)
    for (const token of ['--bg:', '--surface:', '--fg:', '--muted:', '--border:', '--accent:', '--accent-on:', '--font-body:', '--font-display:', '--radius-lg:', '--elev-raised']) {
      assert.ok(css.includes(token), `${system.id} is missing ${token}`)
    }
  }
})

test('applying a system maps the WHOLE token set onto the app variables — every screen follows', () => {
  const css = designSystemCss('linear-app')
  assert.ok(css.includes('--color-bg: var(--bg)'), 'app bg follows the system')
  assert.ok(css.includes('--color-card: var(--surface'), 'cards follow')
  assert.ok(css.includes('--color-ink: var(--fg)'), 'text follows')
  assert.ok(css.includes('--color-accent: var(--accent)'), 'accent follows')
  assert.ok(css.includes('--transcript-font: var(--font-body'), 'reading type follows')
  assert.ok(css.includes('.rounded-xl'), 'corners follow the system scale')
  assert.ok(css.includes('h1, h2, h3'), 'display type follows')
})

test('applying a system through the appearance door really installs it', () => {
  document.getElementById(DESIGN_SYSTEM_STYLE_ID)?.remove()
  document.documentElement.removeAttribute('data-theme')
  applyAppearance({ ...DEFAULT_APPEARANCE, designSystem: 'claude' })
  const element = document.getElementById(DESIGN_SYSTEM_STYLE_ID)
  assert.ok(element, 'the system style element exists')
  assert.ok((element?.textContent ?? '').includes('--color-bg: var(--bg)'))
  // the system owns accent and type: those keys stay OFF the inline root
  assert.equal(document.documentElement.style.getPropertyValue('--color-accent'), '')
  // the system IS the palette: both light/datalogy rules are pinned away
  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark')
  // switching to none removes it and the palette hand-back
  applyAppearance({ ...DEFAULT_APPEARANCE, designSystem: '' })
  assert.equal(document.getElementById(DESIGN_SYSTEM_STYLE_ID), null)
})

test('normalize refuses invented systems and keeps real ones', () => {
  assert.equal(normalizeAppearance({ designSystem: 'skynet-ui' }).designSystem, '')
  assert.equal(normalizeAppearance({ designSystem: 'stripe' }).designSystem, 'stripe')
  assert.equal(normalizeAppearance({}).designSystem, '')
})
