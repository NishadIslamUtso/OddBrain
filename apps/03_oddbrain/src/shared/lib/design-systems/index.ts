/**
 * Design systems — the appearance options the original HTML design had, kept
 * AS IS. Token sets are CSS custom properties from nexu-io/open-design
 * (Apache-2.0), which publishes 152 of them; sixteen ship here, each a whole
 * visual language: palette, type, spacing, radii, shadows, motion timings.
 *
 * They shipped here BEFORE this round — but were only ever used to style
 * generated ARTIFACTS. The owner caught it: the HTML had these looks and the
 * app never offered them for itself. They are the appearance now, wired to
 * every screen through the app's tokens — never a skeleton subset.
 */
import type { DesignSystem } from '../../types'
import airbnb from './airbnb'
import apple from './apple'
import claude from './claude'
import dashboard from './dashboard'
import deflt from './default'
import editorial from './editorial'
import glassmorphism from './glassmorphism'
import linearApp from './linear-app'
import minimal from './minimal'
import modern from './modern'
import neobrutalism from './neobrutalism'
import notion from './notion'
import retro from './retro'
import shadcn from './shadcn'
import stripe from './stripe'
import vercel from './vercel'

/** The catalog, in the order the picker shows them. */
export const DESIGN_SYSTEMS: readonly DesignSystem[] = Object.freeze([
  { id: 'claude', label: 'Claude', accent: '#c96442', bg: '#f5f4ed' },
  { id: 'default', label: 'Default', accent: '#2f6feb', bg: '#fafafa' },
  { id: 'minimal', label: 'Minimal', accent: '#111111', bg: '#ffffff' },
  { id: 'modern', label: 'Modern', accent: '#4f46e5', bg: '#f7f8fc' },
  { id: 'shadcn', label: 'Shadcn', accent: '#000000', bg: '#ffffff' },
  { id: 'linear-app', label: 'Linear', accent: '#5e6ad2', bg: '#08090a' },
  { id: 'apple', label: 'Apple', accent: '#0071e3', bg: '#ffffff' },
  { id: 'stripe', label: 'Stripe', accent: '#533afd', bg: '#ffffff' },
  { id: 'notion', label: 'Notion', accent: '#0075de', bg: '#ffffff' },
  { id: 'vercel', label: 'Vercel', accent: '#0070f3', bg: '#ffffff' },
  { id: 'airbnb', label: 'Airbnb', accent: '#ff385c', bg: '#ffffff' },
  { id: 'neobrutalism', label: 'Neobrutalism', accent: '#d24b1f', bg: '#fff4cf' },
  { id: 'glassmorphism', label: 'Glassmorphism', accent: '#4f8cff', bg: '#eef6ff' },
  { id: 'editorial', label: 'Editorial', accent: '#9a5a2f', bg: '#fbf7f0' },
  { id: 'dashboard', label: 'Dashboard', accent: '#0ea5e9', bg: '#f4f7fb' },
  { id: 'retro', label: 'Retro', accent: '#d24b1f', bg: '#fff4cf' },
])

const TOKENS: Readonly<Record<string, string>> = Object.freeze({
  airbnb,
  apple,
  claude,
  dashboard,
  default: deflt,
  editorial,
  glassmorphism,
  'linear-app': linearApp,
  minimal,
  modern,
  neobrutalism,
  notion,
  retro,
  shadcn,
  stripe,
  vercel,
})

/**
 * The full token set PLUS the mapping onto this app's own variables. Because
 * every screen reads the colour and font variables (nothing hardcodes a
 * colour), this one block restyles all of them at once. Radii follow the
 * system too: the two Tailwind radii the app actually uses are re-pointed at
 * the system's scale.
 */
export function designSystemCss(id: string): string {
  const tokens = TOKENS[id]
  if (!tokens) return ''
  return `${tokens}
:root {
  --color-bg: var(--bg);
  --color-panel: var(--surface-warm, var(--surface));
  --color-card: var(--surface, var(--bg));
  --color-line: var(--border, var(--border-soft));
  --color-ink: var(--fg);
  --color-muted: var(--muted, var(--fg-2));
  --color-accent: var(--accent);
  --accent-ink: var(--accent-on, #ffffff);
  --color-ok: var(--success, #4ade80);
  --color-warn: var(--warn, #f5b14c);
  --color-brand: var(--accent);
  --font-sans: var(--font-body, var(--font-display));
  --transcript-font: var(--font-body, var(--font-display));
  --transcript-size: var(--text-sm, 14.5px);
}
.rounded-lg { border-radius: var(--radius-md, 0.5rem); }
.rounded-xl { border-radius: var(--radius-lg, 0.75rem); }
h1, h2, h3 { font-family: var(--font-display, inherit); }`
}

/** True when the id is one of the sixteen. */
export function isDesignSystem(id: string): boolean {
  return id in TOKENS
}

/** The system the artifact styler falls back to — unchanged contract. */
export const DEFAULT_DESIGN_SYSTEM = 'claude'

/** The tokens for one system; '' for an unknown id. Sync by design now — the sets ship in the bundle. */
export function loadDesignTokens(id: string): string {
  return TOKENS[id] ?? ''
}

/** The human name for one system, as the artifact UI has always shown it. */
export function designSystemLabel(id: string): string {
  return DESIGN_SYSTEMS.find(entry => entry.id === id)?.label || id
}

/** The picker's preview colours for one system. */
export function designSystemPreview(id: string): { accent: string; bg: string; label: string } {
  const found = DESIGN_SYSTEMS.find(entry => entry.id === id)
  return { accent: found?.accent ?? '#7c5cff', bg: found?.bg ?? '#141417', label: found?.label ?? id }
}
