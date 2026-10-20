import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BLOCK_END,
  BLOCK_START,
  deployHouseRules,
  extractBlock,
  houseRulesBlock,
  houseRulesFile,
  upsertBlock,
} from '../src/main/engine/houseRulesDeploy'

/**
 * The rulebook delivered where engines actually read it — a marked block in
 * each engine's own global file, never the owner's whole file. Deploying
 * twice changes only the block; the owner's own words around it are sacred.
 */
test('the block: rules plus the brain footnote, marker-bounded', () => {
  const block = houseRulesBlock('claude-code', 'gemma4:cloud')
  assert.match(block, /oddbrain:house-rules:start/)
  assert.match(block, /do nothing unnecessary/)
  assert.match(block, /Notes for this brain/)
  assert.match(block, /short, concrete steps/)
  const quiet = houseRulesBlock('claude-code', 'unknown-brain')
  assert.doesNotMatch(quiet, /Notes for this brain/)
})

test('upsert: a fresh file gains the block; a second deploy replaces only the block', () => {
  const once = upsertBlock('', houseRulesBlock('claude-code', 'gemma4:cloud'))
  const twice = upsertBlock(once, `${BLOCK_START}\nNEW RULES\n${BLOCK_END}`)
  assert.match(twice, /NEW RULES/)
  assert.doesNotMatch(twice, /House rules \(OddBrain\)/, 'the old block is gone, not stacked')
  assert.equal(twice.split(BLOCK_START).length - 1, 1)
})

test('upsert: the words around the block are never touched', () => {
  const mine = 'My own notes.\n\nKeep these.'
  const result = upsertBlock(mine, `${BLOCK_START}\nRULES\n${BLOCK_END}`)
  assert.match(result, /My own notes\.\n\nKeep these\./)
  assert.ok(result.indexOf('My own notes') < result.indexOf(BLOCK_START))
})

test('deploy: both engines get the same rules, each in its own global file', () => {
  const home = mkdtempSync(join(tmpdir(), 'oddbrain-hr-'))
  try {
    const written = deployHouseRules('claude-code', 'gemma4:cloud', home)
    assert.equal(written.length, 2)
    const claudeFile = houseRulesFile('claude-code', home)
    const agyFile = houseRulesFile('agy', home)
    assert.match(claudeFile, /[\\/]\.claude[\\/]CLAUDE\.md$/)
    assert.match(agyFile, /[\\/]\.gemini[\\/]GEMINI\.md$/)
    assert.equal(readFileSync(claudeFile, 'utf8'), readFileSync(agyFile, 'utf8'))
    assert.match(readFileSync(claudeFile, 'utf8'), /never sweep the workspace/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('deploy: a re-deploy never damages the words the owner wrote around the block', () => {
  const home = mkdtempSync(join(tmpdir(), 'oddbrain-hr2-'))
  try {
    const claudeFile = houseRulesFile('claude-code', home)
    mkdirSync(dirname(claudeFile), { recursive: true })
    writeFileSync(claudeFile, '# My own CLAUDE.md\n\nAlways answer in Bengali.\n', 'utf8')
    deployHouseRules('claude-code', 'gemma4:cloud', home)
    const once = readFileSync(claudeFile, 'utf8')
    deployHouseRules('claude-code', 'qwen2.5-coder:3b', home)
    const twice = readFileSync(claudeFile, 'utf8')
    assert.match(twice, /Always answer in Bengali\./, 'the owner lines survive every deploy')
    assert.equal(twice.split(BLOCK_END).length - 1, 1, 'still exactly one block')
    assert.match(twice, /full path/, 'the brain footnote updated to the new brain')
    // And the block is extractable, which is what the Settings screen edits.
    assert.match(extractBlock(twice), /House rules/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('the rulebook is editable in Settings and rides every send', () => {
  const settings = readFileSync(new URL('../src/renderer/src/components/SettingsView.tsx', import.meta.url), 'utf8')
  assert.match(settings, /'house'/)
  assert.match(settings, /HouseRulesSection/)
  const section = readFileSync(new URL('../src/renderer/src/components/HouseRulesSection.tsx', import.meta.url), 'utf8')
  assert.match(section, /houseRules\.write/)
  assert.match(section, /Save app instructions/)
  const main = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  assert.match(main, /houserules:read/)
  assert.match(main, /houserules:write/)
  assert.match(main, /instructionBlock\(usedEngine.id/, 'every send carries the app rules without automatic global-file writes')
  assert.match(main, /rules:preview-global/)
  assert.match(main, /rules:preview-project/)
  assert.ok(!main.includes('deployRulesNow()'))
})
