/** UI-only additions. The native Appearance schema keeps its original meanings:
 * theme = System/Light/Dark, font = transcript font. No keys, permissions,
 * commands, startup flags or work records belong in a saved look. */
import { loadDesignTokens, DESIGN_SYSTEMS } from '@shared/lib/design-systems'
import { readStored } from '@shared/lib/storage'
import { SCENES as MOTIONS } from '../ui/sceneCatalog'
import type { MotionRole } from '@shared/lib/motionKit'
import { ACCENTS, APPEARANCE_KEY, DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from './appearance'
import { PALETTES, LOOK_PRESETS, LAYOUTS, INTERFACE_STYLES } from '../ui/lookCatalog'

export const LOOK_KEY = 'oddbrain.look.v2'
export type LayoutId = typeof LAYOUTS[number]['id']
export type PaletteId = typeof PALETTES[number]['id']
export const ROLES: readonly MotionRole[] = ['idle', 'thinking', 'working', 'waiting', 'done', 'searching', 'making', 'resting']
export const UI_FONTS = [
  { id: 'system', label: 'App sans', stack: "system-ui, 'Segoe UI', sans-serif" },
  { id: 'editorial', label: 'Serif headings', stack: "system-ui, 'Segoe UI', sans-serif" },
  { id: 'humanist', label: 'Humanist', stack: "'Trebuchet MS', Arial, sans-serif" },
  { id: 'serif', label: 'Bookish serif', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Monospace', stack: "'Cascadia Mono', Consolas, monospace" },
] as const
export type InterfaceFont = typeof UI_FONTS[number]['id']
export type LookPreferences = {
  version: 2
  palette: PaletteId
  paletteTheme: boolean
  paletteAccent: boolean
  style: typeof INTERFACE_STYLES[number]['id']
  layout: LayoutId
  interfaceFont: InterfaceFont
  chatFollowsInterface: boolean
  density: 'comfortable' | 'compact'
  speed: number
  paused: boolean
  interactions: boolean
  captions: boolean
  showThinking: boolean
  streamReplies: boolean
  mischief: 'quiet' | 'witty' | 'extra'
  roles: Record<MotionRole, string>
}
export const DEFAULT_LOOK: LookPreferences = Object.freeze({
  version: 2, palette: 'app', paletteTheme: false, paletteAccent: false,
  style: 'editorial', layout: 'classic', interfaceFont: 'system', chatFollowsInterface: false,
  density: 'comfortable', speed: 1, paused: false, interactions: true,
  captions: true, showThinking: false, streamReplies: true, mischief: 'witty', roles: Object.fromEntries(ROLES.map(r => [r, 'auto'])) as Record<MotionRole, string>,
})
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const choose = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => list.includes(v as T) ? v as T : fallback
export function normalizeLook(value: unknown): LookPreferences {
  const v = object(value), roles = object(v.roles)
  const flag = (k: keyof LookPreferences): boolean => typeof v[k] === 'boolean' ? v[k] as boolean : DEFAULT_LOOK[k] as boolean
  return {
    version: 2,
    palette: choose(v.palette, PALETTES.map(p => p.id), 'app'),
    paletteTheme: flag('paletteTheme'), paletteAccent: flag('paletteAccent'),
    style: choose(v.style, INTERFACE_STYLES.map(s => s.id), 'editorial'),
    layout: choose(v.layout, LAYOUTS.map(l => l.id), 'classic'),
    interfaceFont: choose(v.interfaceFont, UI_FONTS.map(f => f.id), 'system'),
    chatFollowsInterface: flag('chatFollowsInterface'),
    density: choose(v.density, ['comfortable', 'compact'], 'comfortable'),
    speed: typeof v.speed === 'number' && Number.isFinite(v.speed) ? Math.round(Math.max(.5, Math.min(1.5, v.speed)) * 20) / 20 : 1,
    paused: flag('paused'), interactions: flag('interactions'), captions: flag('captions'), showThinking: flag('showThinking'), streamReplies: flag('streamReplies'),
    mischief: choose(v.mischief, ['quiet', 'witty', 'extra'], 'witty'),
    roles: Object.fromEntries(ROLES.map(r => [r, MOTIONS.some(m => m.id === roles[r]) ? roles[r] : 'auto'])) as Record<MotionRole, string>,
  }
}
export type SidebarPreferences = { collapsed: boolean; width: number }
export const SIDEBAR_KEY = 'ai-assistant.sidebar'
export const DEFAULT_SIDEBAR: SidebarPreferences = { collapsed: false, width: 260 }
export function normalizeSidebar(value: unknown): SidebarPreferences {
  const v = object(value)
  return { collapsed: v.collapsed === true, width: typeof v.width === 'number' && Number.isFinite(v.width) ? Math.max(200, Math.min(420, Math.round(v.width))) : 260 }
}
export type LookSnapshot = { format: 'oddbrain-look'; version: 3; name: string; appearance: Appearance; look: LookPreferences; sidebar: SidebarPreferences }
export function lookSnapshot(name: string, appearance: Appearance, look: LookPreferences, sidebar: SidebarPreferences): LookSnapshot {
  return { format: 'oddbrain-look', version: 3, name: name.trim().slice(0, 60) || 'My OddBrain', appearance: normalizeAppearance(appearance), look: normalizeLook(look), sidebar: normalizeSidebar(sidebar) }
}
export function importLook(value: unknown): LookSnapshot | null {
  const v = object(value)
  // Earlier owner-supplied concept exports and the v2 reference are accepted
  // as UI data only. Operational flags/keys/commands in them are ignored.
  if (v.format === 'oddbrain-look' && v.version === 2 && v.preferences && typeof v.preferences === 'object' && !Array.isArray(v.preferences)) {
    const p = object(v.preferences)
    return lookSnapshot(typeof v.name === 'string' ? v.name : 'Imported look',
      normalizeAppearance({ theme: p.colorMode === 'palette' ? 'system' : p.colorMode, accent: p.accent, width: p.chatWidth, textSize: p.textSize, font: p.chatFont, motion: p.motion, mascotWords: p.words, rowExplanations: p.help }),
      normalizeLook({ palette: p.theme, paletteTheme: p.colorMode === 'palette', paletteAccent: p.accent === 'palette', style: p.style, layout: p.shell, interfaceFont: p.font, chatFollowsInterface: p.chatFont === 'follow', density: p.density, speed: p.speed, paused: p.paused, interactions: p.brainInteractive, captions: p.brainCaptions, mischief: p.mischief, roles: p.motionMap }),
      normalizeSidebar({ width: p.sidebarWidth, collapsed: p.sidebar }))
  }
  if (v.concept === true && v.palette && v.motion && typeof v.interfaceStyle === 'string') {
    const palette = object(v.palette), motion = object(v.motion), structure = object(v.structure)
    return lookSnapshot(typeof v.name === 'string' ? v.name : 'Imported concept look', normalizeAppearance({ motion: motion.mode }),
      normalizeLook({ palette: palette.id, paletteTheme: true, paletteAccent: true, style: v.interfaceStyle, layout: structure.id, interfaceFont: v.bodyFont === 'system' ? 'editorial' : v.bodyFont, chatFollowsInterface: true, density: v.density, speed: motion.speed, paused: motion.paused, roles: motion.roles }), DEFAULT_SIDEBAR)
  }
  if (v.format !== 'oddbrain-look' || v.version !== 3 || !v.appearance || typeof v.appearance !== 'object' || Array.isArray(v.appearance) || !v.look || typeof v.look !== 'object' || Array.isArray(v.look)) return null
  return lookSnapshot(typeof v.name === 'string' ? v.name : 'My OddBrain', normalizeAppearance(v.appearance), normalizeLook(v.look), normalizeSidebar(v.sidebar))
}
export function normalizeSavedLooks(value: unknown): LookSnapshot[] {
  return Array.isArray(value) ? value.map(importLook).filter((v): v is LookSnapshot => !!v) : []
}
export function presetSnapshot(id: string, appearance: Appearance, sidebar: SidebarPreferences, look: LookPreferences = DEFAULT_LOOK): LookSnapshot | null {
  const p = LOOK_PRESETS.find(p => p.id === id)
  if (!p) return null
  return lookSnapshot(p.name,
    { ...appearance, motion: p.motion, font: 'sans' },
    { ...look, speed: 1, paused: false, palette: p.palette, paletteTheme: true, paletteAccent: true, style: p.style, layout: p.layout, interfaceFont: p.interfaceFont, chatFollowsInterface: true, density: p.density, roles: p.roles },
    { ...sidebar, collapsed: p.collapsed })
}
const rgb = (h: string): number[] => (h.match(/[a-f\d]{2}/ig) || []).slice(0, 3).map(s => parseInt(s, 16))
const hex = (a: number[]): string => '#' + a.map(n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('')
export function mix(a: string, b: string, amount: number): string { const aa = rgb(a), bb = rgb(b); return hex(aa.map((n, i) => n + (bb[i] - n) * amount)) }
function luminance(h: string): number { const c = rgb(h).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722 }
export function contrast(a: string, b: string): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
/** Legacy token themes remain optional; the same resolved values drive the
 * actual shell, live miniature and exported look instead of fighting CSS. */
export function legacyLookTokens(appearance: Appearance): Record<string, string> {
  if (!appearance.designSystem) return {}
  const css = loadDesignTokens(appearance.designSystem)
  const raw = Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]))
  if (!css) return {}
  const resolve = (key: string, fallback: string, seen: string[] = []): string => {
    if (seen.includes(key)) return fallback
    let value = raw[key] || fallback
    for (let i = 0; i < 16 && value.includes('var('); i++) value = value.replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (_all, next: string, alternate: string) => resolve(next, alternate || fallback, [...seen, key]))
    return value
  }
  const bg = resolve('--bg', '#141417'), ink = resolve('--fg', '#ececef'), accent = resolve('--accent', '#774aff')
  const font = resolve('--font-body', resolve('--font-display', 'system-ui'))
  const catalog = DESIGN_SYSTEMS.find(system => system.id === appearance.designSystem)
  const dark = catalog ? contrast(catalog.bg, '#000000') < contrast(catalog.bg, '#ffffff') : false
  return { '--color-bg': bg, '--color-panel': resolve('--surface-warm', resolve('--surface', bg)), '--color-card': resolve('--surface', bg), '--color-ink': ink, '--color-muted': resolve('--muted', ink), '--color-line': resolve('--border', '#888888'), '--color-accent': accent, '--color-brand': accent, '--color-ok': resolve('--success', '#15803d'), '--color-warn': resolve('--warn', '#b45309'), '--accent-ink': resolve('--accent-on', '#ffffff'), '--font-sans': font, '--transcript-font': font, '--transcript-size': resolve('--text-sm', '14.5px'), '--ob-heading-font': resolve('--font-display', font), '--ob-header-bg': bg, '--ob-accent-text': ink, '--ob-focus': accent, '--ob-scheme': dark ? 'dark' : 'light' }
}
export function lookTokens(appearance: Appearance, look: LookPreferences, osDark = false): Record<string, string> {
  const base = PALETTES.find(p => p.id === look.palette) || PALETTES[0]
  const dark = look.paletteTheme ? base.dark : appearance.theme === 'dark' || (appearance.theme === 'system' && osDark)
  let t: Record<string, string> = { bg: base.paper, panel: base.panel, card: base.card, ink: base.ink, muted: base.muted, line: base.line, brand: base.pink, ok: base.green, warn: base.amber }
  if (base.id === 'app' && !dark) t = { ...t, bg: '#f5f5f7', panel: '#ededf0', card: '#ffffff', ink: '#242429', muted: '#666670', line: '#d9d9e0', brand: '#b04a6a', ok: '#15803d', warn: '#b45309' }
  else if (dark !== base.dark) t = dark
    ? { ...t, bg: mix('#141417', base.accent, .045), panel: mix('#1a1a1f', base.accent, .065), card: mix('#202027', base.accent, .08), ink: '#ececef', muted: '#aaa8b1', line: mix('#3a3941', base.accent, .1) }
    : { ...t, bg: mix('#ffffff', base.accent, .045), panel: mix('#ffffff', base.accent, .1), card: mix('#ffffff', base.accent, .014), ink: mix('#202024', base.accent, .08), muted: '#66616a', line: mix('#ffffff', base.accent, .25) }
  const accent = look.paletteAccent ? base.accent : (ACCENTS.find(a => a.name === appearance.accent) || ACCENTS[0]).hex
  let accentInk = contrast(accent, '#ffffff') >= contrast(accent, '#1f1d1a') ? '#ffffff' : '#1f1d1a'
  if (contrast(accent, accentInk) < 4.5) accentInk = '#000000'
  for (let i = 0; i < 100 && Math.min(...['bg', 'panel', 'card'].map(k => contrast(t.muted, t[k]))) < 4.6; i++) t.muted = mix(t.muted, t.ink, .05)
  let ring = accent
  for (let i = 0; i < 40 && contrast(ring, t.bg) < 3.1; i++) ring = mix(ring, t.ink, .08)
  let accentText = accent
  for (let i = 0; i < 60 && Math.min(...['bg', 'panel', 'card'].map(k => contrast(accentText, t[k]))) < 4.6; i++) accentText = mix(accentText, t.ink, .08)
  for (const key of ['ok', 'warn']) for (let i = 0; i < 60 && Math.min(...['bg', 'panel', 'card'].map(k => contrast(t[key], t[k]))) < 4.5; i++) t[key] = mix(t[key], t.ink, .08)
  const font = UI_FONTS.find(f => f.id === look.interfaceFont) || UI_FONTS[0]
  return { ...Object.fromEntries(Object.entries(t).map(([k, v]) => ['--color-' + k, v])), '--color-accent': accent, '--accent-ink': accentInk, '--font-sans': font.stack, '--ob-heading-font': look.interfaceFont === 'editorial' ? "Georgia, 'Times New Roman', serif" : font.stack, '--ob-radius': look.style === 'ink' ? '4px' : look.style === 'soft' ? '18px' : look.style === 'glass' ? '12px' : '14px', '--ob-control-radius': look.style === 'ink' ? '3px' : look.style === 'soft' ? '10px' : '8px', '--ob-border-size': look.style === 'ink' ? '1.3px' : '1px', '--ob-header-bg': look.style === 'glass' ? t.card : t.bg, '--ob-accent-text': accentText, '--ob-message-gap': look.density === 'compact' ? '20px' : '28px', '--ob-row-pad': look.density === 'compact' ? '8px' : '12px', '--ob-focus': ring, '--ob-scheme': dark ? 'dark' : 'light', ...(look.chatFollowsInterface ? { '--transcript-font': font.stack } : {}), ...legacyLookTokens(appearance) }
}
export function applyLook(appearance: Appearance, look: LookPreferences): void {
  const root = document.documentElement
  const tokens = lookTokens(appearance, look, window.matchMedia('(prefers-color-scheme: dark)').matches)
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v)
  // Legacy systems and installed pack styles still own their palette/type.
  // Do not let the new look's inline values mask their stylesheet.
  if (appearance.packCss && !appearance.designSystem) {
    for (const key of Object.keys(tokens)) {
      if (key.startsWith('--color-') || ['--accent-ink', '--font-sans', '--transcript-font'].includes(key)) root.style.removeProperty(key)
    }
  }
  root.style.colorScheme = tokens['--ob-scheme']
  root.dataset.obStyle = look.style; root.dataset.obDensity = look.density; root.dataset.obLayout = look.layout
}
export function applyStoredLook(): void {
  const a = readStored(APPEARANCE_KEY, DEFAULT_APPEARANCE, normalizeAppearance).value
  const l = readStored(LOOK_KEY, DEFAULT_LOOK, normalizeLook).value
  applyLook(a, l)
}
