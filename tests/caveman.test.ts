import test from 'node:test'
import assert from 'node:assert/strict'
import { modelHints, isSmallLocalBrain, instructionBlock } from '../src/shared/lib/houseRules'

/**
 * Track D: the caveman hint — the token-cut idea, minus the bloat that made
 * the original repo its own best counterargument (its rules cost ~1,160
 * tokens; ours is two sentences, and only for the brains that need it).
 */
test('small local brains are told to answer in bare facts', () => {
  assert.equal(isSmallLocalBrain('qwen2.5-coder:3b'), true)
  assert.equal(isSmallLocalBrain('llama3.2:3b-instruct'), true)
  assert.equal(isSmallLocalBrain('phi4:latest'), true)
  assert.equal(isSmallLocalBrain('deepseek-r1:32b'), false, 'a 32b brain needs no crutch')
  assert.equal(isSmallLocalBrain('gemma4:cloud'), false, 'cloud brains are not small')
  assert.equal(isSmallLocalBrain('gpt-4o-mini'), false, 'provider names with mini are not local size tags')

  const hints = modelHints('qwen2.5-coder:3b')
  assert.match(hints, /bare facts/)
  // Both a family hint and the caveman hint apply, once each.
  assert.match(hints, /full path/)
  assert.equal(hints.match(/bare facts/g)?.length, 1)

  // And it rides the deployed instruction block, so the engine wears it
  // without anyone re-prompting.
  const block = instructionBlock('claude-code', 'llama3.2:3b-instruct')
  assert.match(block, /bare facts/)
  const big = instructionBlock('claude-code', 'claude-opus-4')
  assert.doesNotMatch(big, /bare facts/)
})
