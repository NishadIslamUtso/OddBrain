import { describe, expect, test } from 'vitest'
import {
  DEFAULT_HOUSE_RULES,
  HOUSE_RULES_FILENAME,
  compileFor,
  instructionBlock,
  modelHints,
} from '../src/shared/lib/houseRules'

/**
 * House rules: one rulebook, projected into every engine's own channel.
 * These tests pin the contract that makes results consistent across brains:
 * same body everywhere, native filename per engine, per-brain footnotes.
 */
describe('house rules', () => {
  test('every engine has an official channel to project into', () => {
    expect(HOUSE_RULES_FILENAME['claude-code']).toBe('CLAUDE.md')
    expect(HOUSE_RULES_FILENAME.agy).toBe('GEMINI.md')
  })

  test('compiling for both engines yields the same body, only the wrapper differs', () => {
    const cc = compileFor('claude-code')
    const agy = compileFor('agy')
    expect(cc).toContain('# House rules (OddBrain)')
    expect(agy).toContain('# House rules (OddBrain)')
    // The portable core: every section appears in both projections.
    for (const section of ['Who you are', 'Artifacts', 'Approvals', 'Memory and searching', 'What you keep', 'How you write']) {
      expect(cc).toContain(`## ${section}`)
      expect(agy).toContain(`## ${section}`)
    }
    expect(cc).toBe(agy)
  })

  test('auto-keep is in the rulebook: the engine knows its memory file during normal work', () => {
    const cc = compileFor('claude-code')
    expect(cc).toContain('06 Review/Memory/engine-notes.md')
    expect(cc).toContain('## 2026-10-16')
    expect(cc).toContain('Never delete or rewrite lines that are already there')
    expect(cc).toContain('if nothing is worth keeping, write nothing')
    expect(cc).toContain('approval channel')
  })

  test('the artifact contract is in the rules: build real files, never describe', () => {
    const text = compileFor('claude-code')
    expect(text).toMatch(/artifacts\//)
    expect(text).toMatch(/build the file/)
  })

  test('his standing instructions ride every engine: ask when unsure, nothing unnecessary', () => {
    const text = compileFor('claude-code')
    expect(text).toMatch(/not sure.*ask the owner/)
    expect(text).toMatch(/do nothing unnecessary/)
  })

  test('memory discipline: no sweeping the workspace for a simple ask', () => {
    const text = compileFor('agy')
    expect(text).toMatch(/never sweep the workspace/)
    expect(text).toMatch(/Memory and context files are background/)
  })

  test('no rule section is ever empty in the defaults', () => {
    for (const value of Object.values(DEFAULT_HOUSE_RULES)) {
      expect(value.trim().length).toBeGreaterThan(20)
    }
  })

  test('compiling is deterministic — same rules in, same file out', () => {
    expect(compileFor('claude-code')).toBe(compileFor('claude-code'))
    expect(compileFor('agy', DEFAULT_HOUSE_RULES)).toBe(compileFor('agy'))
  })

  test('a custom rulebook flows through unchanged in meaning', () => {
    const mine = { ...DEFAULT_HOUSE_RULES, style: 'Always answer in Bengali first.' }
    const text = compileFor('claude-code', mine)
    expect(text).toContain('Always answer in Bengali first.')
    expect(text).not.toContain('Plain words over jargon')
  })

  test('an engine with no channel is refused loudly, not silently dropped', () => {
    expect(() => compileFor('mystery' as never)).toThrow(/no house-rules channel/)
  })

  test('per-brain hints: known brains get a footnote, unknown get silence', () => {
    expect(modelHints('gemma4:cloud')).toMatch(/short, concrete steps/)
    expect(modelHints('qwen2.5-coder:3b')).toMatch(/full path/)
    expect(modelHints('some-future-brain:70b')).toBe('')
  })

  test('the full instruction block is rules + footnote, and stable', () => {
    const withHints = instructionBlock('claude-code', 'gemma4:cloud')
    expect(withHints).toContain('# House rules (OddBrain)')
    expect(withHints).toContain('Notes for this brain')
    expect(instructionBlock('claude-code', 'unknown-brain')).toBe(compileFor('claude-code'))
  })
})
