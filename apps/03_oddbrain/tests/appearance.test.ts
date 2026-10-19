import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  FONTS,
  WIDTHS,
  accentHex,
  appearanceVariables,
  applyAppearance,
  applyStoredAppearance,
  chatWidthPx,
  normalizeAppearance,
} from '../src/renderer/src/state/appearance'

/**
 * Settings > Appearance.
 *
 * The point of these is not that a colour can be stored — it is that the
 * DEFAULT is byte-for-byte what the app already looked like, that the two
 * halves (the store and the stylesheet) agree on that default, and that a
 * half-written preference cannot make the interface unreadable.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')
const css = read('../src/renderer/src/styles/globals.css')

test('the default appearance is what the app already looked like, token for token', () => {
  assert.equal(DEFAULT_APPEARANCE.accent, 'violet')
  assert.equal(DEFAULT_APPEARANCE.width, 'comfortable')
  // The theme's own accent. Choosing violet chooses what was always there.
  assert.equal(accentHex('violet'), '#7350ff')
  // ...and the width the conversation column already used.
  assert.equal(chatWidthPx('comfortable'), 760)
})

test('the conversation column reads the token rather than a fixed number', () => {
  // If this ever goes back to a hard-coded max-width, the setting becomes a lie.
  const chatView = read('../src/renderer/src/components/ChatView.tsx')
  assert.match(chatView, /max-w-\[var\(--chat-width\)\]/)
  assert.doesNotMatch(chatView, /max-w-\[760px\]/)
})

test('an appearance rewrites its tokens, and nothing else', () => {
  const variables = appearanceVariables({ accent: 'teal', width: 'wide', textSize: 'large', font: 'serif', motion: 'still' })
  assert.deepEqual(Object.keys(variables).sort(), [
    '--accent-ink',
    '--chat-width',
    '--color-accent',
    '--motion',
    '--transcript-font',
    '--transcript-size',
  ])
  assert.equal(variables['--color-accent'], '#2fb3a2')
  assert.equal(variables['--chat-width'], '1040px')
  assert.equal(variables['--transcript-size'], '16.5px')
  assert.match(variables['--transcript-font'], /serif/)
  assert.equal(variables['--motion'], '0', 'Still stops the motion var')
  // The defaults keep the app exactly as it was.
  const plain = appearanceVariables({ accent: 'violet', width: 'comfortable', textSize: 'medium', font: 'sans', motion: 'system' })
  assert.equal(plain['--transcript-size'], '14.5px')
  assert.equal(plain['--motion'], '1')
  // A stored 'reduced' (the old two-value control) reads as Still — the same
  // promise, everything stopped.
  const migrated = normalizeAppearance({ motion: 'reduced' })
  assert.equal(migrated.motion, 'still')
  const kit = normalizeAppearance({ motion: 'calm' })
  assert.equal(kit.motion, 'calm')
})

test('every accent is a plain six-digit colour, and every width is distinct', () => {
  for (const accent of ACCENTS) assert.match(accent.hex, /^#[0-9a-f]{6}$/)
  assert.equal(new Set(ACCENTS.map(accent => accent.hex)).size, ACCENTS.length)
  assert.equal(new Set(ACCENTS.map(accent => accent.name)).size, ACCENTS.length)
  const widths = WIDTHS.map(width => width.px)
  assert.deepEqual(widths, [...widths].sort((a, b) => a - b), 'narrowest first, so the row reads left to right')
  assert.equal(new Set(widths).size, WIDTHS.length)
})

test('a half-written preference falls back field by field, never to nothing', () => {
  assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE)
  assert.deepEqual(normalizeAppearance('teal'), DEFAULT_APPEARANCE)
  assert.deepEqual(normalizeAppearance({}), DEFAULT_APPEARANCE)
  assert.deepEqual(normalizeAppearance({ accent: 'chartreuse' }), DEFAULT_APPEARANCE)
  assert.deepEqual(normalizeAppearance({ accent: 'rose', width: 'enormous' }), {
    theme: 'system',
    accent: 'rose',
    width: 'comfortable',
    textSize: 'medium',
    font: 'sans',
    motion: 'balanced',
    mascotWords: false,
    startupAnimation: true,
    rowExplanations: false,
  packCss: '',
  designSystem: '',
  })
  assert.deepEqual(normalizeAppearance({ width: 'wide' }), {
    theme: 'system',
    accent: 'violet',
    width: 'wide',
    textSize: 'medium',
    font: 'sans',
    motion: 'balanced',
    mascotWords: false,
    startupAnimation: true,
    rowExplanations: false,
  packCss: '',
  designSystem: '',
  })
  assert.deepEqual(normalizeAppearance({ accent: 'blue', width: 'focused', theme: 'light' }), {
    theme: 'light',
    accent: 'blue',
    width: 'focused',
    textSize: 'medium',
    font: 'sans',
    motion: 'balanced',
    mascotWords: false,
    startupAnimation: true,
    rowExplanations: false,
  packCss: '',
  designSystem: '',
  })
})

test('applying writes both variables onto the root, and nothing besides', () => {
  const written: Record<string, string> = {}
  const root = {
    style: {
      setProperty: (name: string, value: string): void => {
        written[name] = value
      },
    },
  }
  applyAppearance({ accent: 'amber', width: 'focused' }, root)
  assert.deepEqual(written, {
    '--color-accent': '#e0a44a',
    '--accent-ink': '#1f1d1a',
    '--chat-width': '640px',
    '--transcript-size': '14.5px',
    '--transcript-font': "system-ui, 'Segoe UI', sans-serif",
    '--motion': '1',
  })
})

test('the boot path applies what is stored before the first paint', () => {
  const written: Record<string, string> = {}
  const store = new Map([
    [
      'ai-assistant.appearance',
      JSON.stringify({
        theme: 'light',
        accent: 'blue',
        width: 'wide',
        textSize: 'large',
        font: 'serif',
        motion: 'reduced',
      }),
    ],
  ])
  const globals = globalThis as unknown as { localStorage: unknown; document: unknown }
  const previous = { localStorage: globals.localStorage, document: globals.document }
  globals.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: () => {},
    removeItem: () => {},
  }
  const fakeRoot = {
    attributes: {} as Record<string, string>,
    style: {
      setProperty: (name: string, value: string): void => {
        written[name] = value
      },
    },
    setAttribute(name: string, value: string): void {
      this.attributes[name] = value
    },
    removeAttribute(name: string): void {
      delete this.attributes[name]
    },
  }
  globals.document = {
    documentElement: fakeRoot as unknown as { style: { setProperty(name: string, value: string): void } },
  }
  try {
    applyStoredAppearance()
  } finally {
    globals.localStorage = previous.localStorage
    globals.document = previous.document
  }
  assert.deepEqual(written, {
    '--color-accent': '#4f8bf5',
    '--accent-ink': '#1f1d1a',
    '--chat-width': '1040px',
    '--transcript-size': '16.5px',
    '--transcript-font': "Georgia, 'Times New Roman', serif",
    '--motion': '0',
  })
  assert.equal(fakeRoot.attributes['data-theme'], 'light')
})

test('width pills say Narrow / Medium / Wide, as the mockup shows them', () => {
  assert.deepEqual(
    WIDTHS.map(width => width.label),
    ['Narrow', 'Medium', 'Wide'],
  )
})

test('the serif choice offers Anthropic Serif with an honest Georgia fallback', () => {
  assert.equal(FONTS.length, 3)
  const anthropic = FONTS.find(font => font.name === 'anthropic-serif')
  assert.ok(anthropic, 'Anthropic Serif pill exists')
  assert.equal(anthropic!.label, 'Anthropic Serif')
  // Without the font installed the stack lands on the same Georgia the
  // reading serif uses - the pill still changes nothing into something true.
  assert.match(anthropic!.stack, /^'Anthropic Serif', Georgia/)
})
