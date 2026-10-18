import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installPackFromFolder, PACK_CSS_MAX } from '../src/main/engine/packs'
import { exportPack } from '../src/main/engine/exportPack'

/**
 * The owner's ruling, 2026-10-17: "i said to take the entire style, you kept
 * your skeleton". A pack theme is therefore allowed to carry its own
 * stylesheet — the pack's ENTIRE style — not only the handful of look
 * switches the app already had. These pins: css survives install, a css-only
 * theme is a valid theme, css rides along on export, and the size cap holds.
 */

const makePack = (root: string, theme: Record<string, unknown>): string => {
  const folder = join(root, 'the-pack')
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, 'manifest.json'),
    JSON.stringify({
      id: 'style-pack',
      name: 'Style Pack',
      version: '1.0.0',
      description: 'A pack with a full style.',
      author: 'Nishad',
      contributes: { skills: [], prompts: [], themes: ['themes/pack.json'] },
    }),
  )
  return folder
}

const writeTheme = (folder: string, theme: Record<string, unknown>): void => {
  mkdirSync(join(folder, 'themes'), { recursive: true })
  writeFileSync(join(folder, 'themes', 'pack.json'), JSON.stringify(theme))
}

test('a pack theme keeps its stylesheet through install', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-css-'))
  try {
    const folder = makePack(root, {})
    writeTheme(folder, {
      name: 'Full style',
      appearance: { accent: 'teal' },
      css: ':root { --color-bg: #101014; } .card { border-radius: 20px; }',
    })
    const result = installPackFromFolder(folder, {
      storeRoot: join(root, 'store'),
      claudeSkillsDir: join(root, 'claude-skills'),
      agySkillsDir: join(root, 'agy-skills'),
    })
    assert.ok(result.ok, result.ok ? '' : result.answer)
    if (!result.ok) return
    assert.equal(result.themes.length, 1)
    assert.equal(result.themes[0]?.css, ':root { --color-bg: #101014; } .card { border-radius: 20px; }')
    assert.equal(result.themes[0]?.appearance['accent'], 'teal')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a css-only theme is a valid theme — tokens are no longer the whole skeleton', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-css2-'))
  try {
    const folder = makePack(root, {})
    writeTheme(folder, { name: 'Look only', css: 'body { font-family: serif; }' })
    const result = installPackFromFolder(folder, {
      storeRoot: join(root, 'store'),
      claudeSkillsDir: join(root, 'claude-skills'),
      agySkillsDir: join(root, 'agy-skills'),
    })
    assert.ok(result.ok, result.ok ? '' : result.answer)
    if (!result.ok) return
    assert.deepEqual(result.themes[0]?.appearance, {})
    assert.equal(result.themes[0]?.css, 'body { font-family: serif; }')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('export carries the stylesheet back out, so a style round-trips', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-css3-'))
  try {
    const css = '.ob-app { --anything: 1; }'
    const result = exportPack(
      { name: 'Style Out', description: 'd', author: 'a', skills: [], theme: { appearance: { accent: 'rose' }, css } },
      [],
      root,
    )
    assert.ok(result.ok, result.ok ? '' : result.answer)
    if (!result.ok) return
    const written = JSON.parse(readFileSync(join(result.folder, 'themes/pack.json'), 'utf8'))
    assert.equal(written.css, css)
    assert.equal(written.appearance['accent'], 'rose')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a stylesheet is capped, not unlimited', () => {
  assert.equal(PACK_CSS_MAX, 200_000)
})
