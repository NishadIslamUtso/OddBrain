import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DEFAULT_ENGINE, normalizeEngine, modelLabel, OWN_CHOICE_MODEL_LABEL } from '../src/shared/lib/engine'
import { engineArguments } from '../src/main/engine/claudeCode'

/**
 * The owner's verdict on the last build: "fake green dots, fake model names".
 * `gemma4:cloud` was shipped as the DEFAULT model — a name this app invented,
 * shown as if the machine had said it. These pins make the lying impossible:
 * the default model is EMPTY (the engine's own choice), the fabricated name
 * migrates away, nothing forces --model when the choice is empty, and the
 * launch never points claude-code at a door when no brain was picked.
 */

test('the default model is empty — the engine runs as itself', () => {
  assert.equal(DEFAULT_ENGINE.model, '')
})

test('the fabricated default migrates away from saved settings', () => {
  assert.equal(normalizeEngine({ model: 'gemma4:cloud' }).model, '')
  assert.equal(normalizeEngine({ model: 'qwen2.5-coder:3b' }).model, 'qwen2.5-coder:3b')
  assert.equal(normalizeEngine({ model: 'not a model!' }).model, '')
})

test('an empty model never becomes a --model flag', () => {
  assert.ok(!engineArguments('', 'ask').includes('--model'), JSON.stringify(engineArguments('', 'ask')))
  assert.deepEqual(engineArguments('sonnet', 'ask').slice(-2), ['--model', 'sonnet'])
})

test('launch points claude-code at a brain door ONLY when a brain was actually picked', () => {
  const source = readFileSync(new URL('../src/main/engine/claudeCode.ts', import.meta.url), 'utf8')
  assert.match(source, /input\.settings\.model\s*\n\s*\? brainEnvironment\(input\.settings\.baseUrl\)/)
  assert.doesNotMatch(source, /: brainEnvironment\(input\.settings\.baseUrl\)\),\s*\n\s*\.\.\.\(enginePathSync/)
})

test("an empty model is called what it is: the engine's own choice", () => {
  assert.equal(modelLabel(''), OWN_CHOICE_MODEL_LABEL)
  assert.equal(modelLabel('sonnet'), 'sonnet')
})

test('no UI shows the invented name as a default', () => {
  for (const file of [
    '../src/renderer/src/components/EnginePanel.tsx',
    '../src/renderer/src/components/Composer.tsx',
    '../src/renderer/src/components/TitleBar.tsx',
  ]) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.ok(!text.includes('gemma4:cloud'), `${file} hardcodes a model name`)
  }
})

test('the engine picker states installation in words, not a green dot', () => {
  const composer = readFileSync(new URL('../src/renderer/src/components/Composer.tsx', import.meta.url), 'utf8')
  assert.ok(!composer.includes("entry.found ? 'bg-ok'"), 'the fake green dot is gone')
  assert.match(composer, /not installed/)
})

test('the title bar has no decorative status claims', () => {
  const title = readFileSync(new URL('../src/renderer/src/components/TitleBar.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(title.slice(title.indexOf('  return ')), /engineAlive|bg-ok|bg-warn|bg-muted|Live|Local/)
})

test('the engine strip is collapsible and never hides a permission question', () => {
  const panel = readFileSync(new URL('../src/renderer/src/components/EnginePanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /ai-assistant\.engine-panel-open/)
  assert.match(panel, /panelOpen \|\| turn\.permissions\.length > 0/)
})

test('thinking follows the owner once he opens it', () => {
  const row = readFileSync(new URL('../src/renderer/src/components/MessageRow.tsx', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('../src/renderer/src/components/EnginePanel.tsx', import.meta.url), 'utf8')
  assert.match(row, /thinkingOpenNow\(\)/)
  assert.match(row, /setThinkingOpen\(/)
  assert.match(panel, /THINKING_OPEN_EVENT/)
})

test('every SHIPPED theme carries a real stylesheet, not a bare accent', () => {
  const base = new URL('../store/packs/', import.meta.url)
  let checked = 0
  for (const pack of readdirSync(base)) {
    const themesDir = new URL(`${pack}/themes/`, base)
    let names: string[] = []
    try {
      names = readdirSync(themesDir)
    } catch {
      continue
    }
    for (const name of names) {
      const theme = JSON.parse(readFileSync(new URL(name, themesDir), 'utf8')) as { css?: string }
      assert.ok(
        typeof theme.css === 'string' && theme.css.length > 100,
        `${pack}/${name} ships without a stylesheet — the skeleton the owner rejected`,
      )
      checked += 1
    }
  }
  assert.ok(checked >= 6, `expected at least six shipped themes, walked ${checked}`)
})
