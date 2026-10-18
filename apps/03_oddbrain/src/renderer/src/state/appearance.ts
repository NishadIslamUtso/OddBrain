/**
 * Settings > Appearance.
 *
 * The theme is tokens (see globals.css) and nothing in the app hardcodes a
 * colour, so appearance here is not a skin laid over the top: it rewrites the
 * tokens the interface actually reads, and everything drawn from them follows.
 *
 * It is kept in this window's storage rather than the machine's settings file
 * on purpose. An accent colour is a preference about reading, not a fact about
 * the computer — which also means it works in the browser preview, where there
 * is no machine to write anything down.
 */

import { readStored } from '@shared/lib/storage'
import { designSystemCss, isDesignSystem } from '@shared/lib/design-systems'

export type AccentName = 'violet' | 'blue' | 'teal' | 'amber' | 'rose'
export type WidthName = 'focused' | 'comfortable' | 'wide'
export type TextSizeName = 'small' | 'medium' | 'large'
export type FontName = 'sans' | 'serif' | 'anthropic-serif'
export type ThemeName = 'system' | 'light' | 'dark'

/** How the kit's scenes move: System follows the OS, Calm slows them,
 *  Balanced is the kit's own speed, Playful hurries them, Still stops them. */
export type MotionName = 'system' | 'calm' | 'balanced' | 'playful' | 'still'

export type Appearance = {
  /** Which palette the neutrals come from: the OS's choice, or one of ours. */
  theme: ThemeName
  accent: AccentName
  width: WidthName
  /** The transcript's text size, as the approved settings mockup offers it. */
  textSize: TextSizeName
  /** The reading font for the transcript: the app's sans, or a reading serif. */
  font: FontName
  /** The motion modes of the OddBrain kit; a stored 'reduced' reads as 'still'. */
  motion: MotionName
  /** The little mood word under the mascot on the home screen. */
  mascotWords: boolean
  /** The quiet explanation line under a settings row. Off, the rows are terse. */
  rowExplanations: boolean
  /**
   * A pack theme's own stylesheet, applied verbatim on top of the tokens —
   * the pack's ENTIRE style, per the owner's ruling, not a token subset.
   * Empty when no pack style is applied; Reset clears it.
   */
  packCss: string
  /**
   * A whole design system — one of the sixteen the original HTML design
   * shipped. Empty means the app's own look. A design system and a pack
   * theme are one look at a time: picking either clears the other.
   */
  designSystem: string
}

export const APPEARANCE_KEY = 'ai-assistant.appearance'

/**
 * Every accent ships with its own ink: the colour of text painted on it.
 * It is not decoration — it is the readability guarantee. White text on the
 * raw hues fails the WCAG line on all five (violet 4.35:1, amber 2.19:1),
 * so violet is deepened just enough for white to clear 4.5:1, and the four
 * lighter hues carry near-black ink instead. tests/accent-contrast.test.ts
 * computes the ratios, so no hue can ship unreadable again.
 */
export const ACCENTS: readonly { name: AccentName; label: string; hex: string; ink: string }[] = Object.freeze([
  { name: 'violet', label: 'Violet', hex: '#7350ff', ink: '#ffffff' },
  { name: 'blue', label: 'Blue', hex: '#4f8bf5', ink: '#1f1d1a' },
  { name: 'teal', label: 'Teal', hex: '#2fb3a2', ink: '#1f1d1a' },
  { name: 'amber', label: 'Amber', hex: '#e0a44a', ink: '#1f1d1a' },
  { name: 'rose', label: 'Rose', hex: '#e0688b', ink: '#1f1d1a' },
])

/** Comfortable is the width the conversation already used. */
export const WIDTHS: readonly { name: WidthName; label: string; px: number }[] = Object.freeze([
  { name: 'focused', label: 'Narrow', px: 640 },
  { name: 'comfortable', label: 'Medium', px: 760 },
  { name: 'wide', label: 'Wide', px: 1040 },
])

export const TEXT_SIZES: readonly { name: TextSizeName; label: string; px: number }[] = Object.freeze([
  { name: 'small', label: 'Small', px: 13 },
  { name: 'medium', label: 'Medium', px: 14.5 },
  { name: 'large', label: 'Large', px: 16.5 },
])

export const FONTS: readonly { name: FontName; label: string; stack: string }[] = Object.freeze([
  { name: 'sans', label: 'App sans', stack: "system-ui, 'Segoe UI', sans-serif" },
  { name: 'serif', label: 'Reading serif', stack: "Georgia, 'Times New Roman', serif" },
  /** Anthropic Serif when the machine has it; otherwise the same reading
   *  serif renders - an honest fallback, never a missing-font box. */
  { name: 'anthropic-serif', label: 'Anthropic Serif', stack: "'Anthropic Serif', Georgia, 'Times New Roman', serif" },
])

/** The dark palette is the app's own; System follows the OS either way. */
export const THEMES: readonly { name: ThemeName; label: string }[] = Object.freeze([
  { name: 'system', label: 'System' },
  { name: 'light', label: 'Light' },
  { name: 'dark', label: 'Dark' },
])

export const MOTIONS: readonly { name: MotionName; label: string }[] = Object.freeze([
  { name: 'system', label: 'System' },
  { name: 'calm', label: 'Calm' },
  { name: 'balanced', label: 'Balanced' },
  { name: 'playful', label: 'Playful' },
  { name: 'still', label: 'Still' },
])

export const DEFAULT_APPEARANCE: Appearance = Object.freeze({
  theme: 'system',
  accent: 'violet',
  width: 'comfortable',
  textSize: 'medium',
  font: 'sans',
  motion: 'system',
  // Off by default: the owner asked for the decorative furniture to go — no
  // status words floating over the interface, no explanations on every row.
  // Both stay available as choices in Appearance; they are simply not imposed.
  mascotWords: false,
  rowExplanations: false,
  // Kept from the design-system work: a pack theme's own stylesheet and the
  // active design system. Empty means "the app's own look", and one rules at
  // a time — a system retires a pack style, a pack retires a system.
  packCss: '',
  designSystem: '',
})

/** The id of the <style> element a pack theme's stylesheet lives in. */
export const PACK_STYLE_ID = 'ob-pack-style'
/** The id of the <style> element the active design system lives in. */
export const DESIGN_SYSTEM_STYLE_ID = 'ob-design-system'

export function accentHex(name: AccentName): string {
  return (ACCENTS.find(accent => accent.name === name) || ACCENTS[0]).hex
}

/** The readable text colour for an accent, as `--accent-ink`. */
export function accentInk(name: AccentName): string {
  return (ACCENTS.find(accent => accent.name === name) || ACCENTS[0]).ink
}

export function chatWidthPx(name: WidthName): number {
  return (WIDTHS.find(width => width.name === name) || WIDTHS[1]).px
}

/** Half-written or hand-edited values degrade to the default, field by field. */
export function normalizeAppearance(value: unknown): Appearance {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Appearance>
  return {
    theme: THEMES.some(theme => theme.name === input.theme)
      ? (input.theme as ThemeName)
      : DEFAULT_APPEARANCE.theme,
    accent: ACCENTS.some(accent => accent.name === input.accent)
      ? (input.accent as AccentName)
      : DEFAULT_APPEARANCE.accent,
    width: WIDTHS.some(width => width.name === input.width)
      ? (input.width as WidthName)
      : DEFAULT_APPEARANCE.width,
    textSize: TEXT_SIZES.some(size => size.name === input.textSize)
      ? (input.textSize as TextSizeName)
      : DEFAULT_APPEARANCE.textSize,
    font: FONTS.some(font => font.name === input.font) ? (input.font as FontName) : DEFAULT_APPEARANCE.font,
    // A stored 'reduced' (the old two-value control) reads as Still — the same
    // promise, everything stopped.
    motion: MOTIONS.some(mode => mode.name === input.motion)
      ? (input.motion as MotionName)
      : (input as { motion?: unknown }).motion === 'reduced'
        ? 'still'
        : DEFAULT_APPEARANCE.motion,
    mascotWords: typeof input.mascotWords === 'boolean' ? input.mascotWords : DEFAULT_APPEARANCE.mascotWords,
    rowExplanations:
      typeof input.rowExplanations === 'boolean' ? input.rowExplanations : DEFAULT_APPEARANCE.rowExplanations,
    packCss: typeof input.packCss === 'string' ? input.packCss.slice(0, 200_000) : '',
    designSystem: typeof input.designSystem === 'string' && isDesignSystem(input.designSystem) ? input.designSystem : '',
  }
}

/**
 * The two tokens an appearance rewrites. `--color-accent` is Tailwind's, so
 * every `bg-accent`/`border-accent`/`text-accent` in the app follows without a
 * component knowing this exists; `--chat-width` is read by the conversation
 * column through an arbitrary utility.
 */
export function textSizePx(name: TextSizeName): number {
  return (TEXT_SIZES.find(size => size.name === name) || TEXT_SIZES[1]).px
}

export function fontStack(name: FontName): string {
  return (FONTS.find(font => font.name === name) || FONTS[0]).stack
}

export function appearanceVariables(appearance: Appearance): Record<string, string> {
  return {
    '--color-accent': accentHex(appearance.accent),
    '--accent-ink': accentInk(appearance.accent),
    '--chat-width': `${chatWidthPx(appearance.width)}px`,
    '--transcript-size': `${textSizePx(appearance.textSize)}px`,
    '--transcript-font': fontStack(appearance.font),
    '--motion': appearance.motion === 'still' ? '0' : '1',
  }
}

type StyledRoot = {
  style: { setProperty(name: string, value: string): void }
  setAttribute?(name: string, value: string): void
  removeAttribute?(name: string, value?: string): void
}

export function applyAppearance(
  appearance: Appearance,
  root: StyledRoot = document.documentElement
): void {
  const active = appearance.designSystem !== '' && isDesignSystem(appearance.designSystem)
  const variables = appearanceVariables(appearance)
  for (const [name, value] of Object.entries(variables)) {
    // The design system owns the accent, the ink on it and the reading
    // type — inline styles beat stylesheets, so those keys stay OFF the
    // root while a system is active, or its own choices could never land.
    if (active && (name === '--color-accent' || name === '--accent-ink' || name === '--transcript-font' || name === '--transcript-size')) continue
    root.style.setProperty(name, value)
  }
  applyPackStyle(active ? '' : (appearance.packCss ?? ''))
  applyDesignSystem(active ? appearance.designSystem : '')
  if (active) {
    // The system IS the palette. The app's light/datalogy rules key off
    // data-theme with higher specificity than the system's stylesheet —
    // pinning 'dark' (which carries no rules of its own) takes both out of
    // the fight, so the system's own light or dark palette stands alone.
    if (typeof root.setAttribute === 'function') root.setAttribute('data-theme', 'dark')
  }
  // The theme is a palette swap, not a variable: it lives in the stylesheet as
  // `[data-theme='light']`, so `System` is the attribute's absence and the OS's
  // preference answers. The accent stays inline — it is chosen separately and
  // works on both palettes.
  if (appearance.theme === 'light' || appearance.theme === 'dark') {
    if (typeof root.setAttribute === 'function') root.setAttribute('data-theme', appearance.theme)
  } else if (typeof root.removeAttribute === 'function') {
    // With a design system active the attribute was pinned 'dark' above —
    // the system IS the palette, so it is left alone here.
    if (!appearance.designSystem) root.removeAttribute('data-theme')
  }
}

/**
 * The same thing, read straight from storage, so the first paint is already the
 * chosen colour rather than the default flashing for a frame.
 */
export function applyStoredAppearance(): void {
  const stored = readStored(APPEARANCE_KEY, DEFAULT_APPEARANCE, normalizeAppearance)
  applyAppearance(stored.value)
}

/**
 * The pack stylesheet, as its own <style> element after the app's stylesheet:
 * same specificity, later order, so the pack wins. Set '' to remove it.
 * Guarded for the node test environment, which has no document.
 */
export function applyPackStyle(css: string): void {
  applyStyleElement(PACK_STYLE_ID, css)
}

/**
 * The active design system, as its own style element LAST in the head — one
 * whole look, applied to every screen through the app's tokens.
 */
export function applyDesignSystem(id: string): void {
  applyStyleElement(DESIGN_SYSTEM_STYLE_ID, id ? designSystemCss(id) : '')
}

function applyStyleElement(elementId: string, css: string): void {
  const doc = typeof document !== 'undefined' ? document : undefined
  if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return
  const existing = doc.getElementById(elementId)
  if (!css) {
    existing?.remove()
    return
  }
  let element = existing
  if (!element) {
    element = doc.createElement('style')
    element.id = elementId
    doc.head.appendChild(element)
  }
  if (element.textContent !== css) element.textContent = css
}
