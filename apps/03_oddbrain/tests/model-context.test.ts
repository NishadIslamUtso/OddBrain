import { describe, expect, it } from 'vitest'
import {
  estimateModelTokens,
  modelContextKey,
  normalizeModelContextOverrides,
  packModelContext,
  parseContextOverflow,
  resolveModelContext,
  trimOneContextGroup,
  validModelContextReceipt,
} from '../src/shared/lib/modelContext'

const item = (id: string, role: string, content: string, required = false) => ({ id, required, message: { role, content } })

describe('model context profiles', () => {
  it('gives an unknown model Auto freedom instead of inventing a conservative limit', () => {
    const key = modelContextKey('custom', 'unlisted-model')
    expect(resolveModelContext({ key, label: 'unlisted-model' })).toEqual({ key, label: 'unlisted-model', mode: 'auto', capacityTokens: null, outputReserveTokens: 1024, source: 'unknown' })
  })

  it('lets the owner override any model and keeps observed limits in Auto mode', () => {
    const key = modelContextKey('ollama', 'model')
    expect(resolveModelContext({ key, label: 'model', reportedTokens: 8192, override: { mode: 'manual', limitTokens: 5000, outputReserveTokens: 700 } })).toMatchObject({ mode: 'manual', capacityTokens: 5000, outputReserveTokens: 700, source: 'owner' })
    expect(resolveModelContext({ key, label: 'model', override: { mode: 'auto', observedTokens: 7000 } })).toMatchObject({ mode: 'auto', capacityTokens: 7000, source: 'observed' })
    expect(normalizeModelContextOverrides({ bad: { mode: 'manual', limitTokens: 'anything' }, good: { mode: 'auto', observedTokens: 4096 } })).toEqual({ good: { mode: 'auto', observedTokens: 4096 } })
  })
})

describe('context packing and transparent overflow recovery', () => {
  const profile = resolveModelContext({ key: 'k', label: 'm', override: { mode: 'manual', limitTokens: 1400, outputReserveTokens: 100 } })
  it('keeps essential envelopes and newest complete user-led groups', () => {
    const old = 'a'.repeat(1700), recent = 'b'.repeat(800)
    const packed = packModelContext([
      item('system', 'system', 'rules', true),
      item('u1', 'user', old), item('a1', 'assistant', old),
      item('u2', 'user', recent), item('a2', 'assistant', recent),
      item('current', 'user', 'now', true),
    ], profile)
    expect(packed.messages.map(row => row.id)).toEqual(['system', 'u2', 'a2', 'current'])
    expect(packed.omitted).toEqual([{ id: 'u1', reason: 'model-context-budget' }, { id: 'a1', reason: 'model-context-budget' }])
  })

  it('refuses to clip essential content', () => {
    expect(() => packModelContext([item('system', 'system', 'x'.repeat(5000), true)], profile)).toThrow('Nothing essential was clipped')
  })

  it('recognizes only context overflow and reads an explicit provider limit', () => {
    expect(parseContextOverflow(Error('prompt too long: context window maximum 8192 tokens'))).toEqual({ overflow: true, limitTokens: 8192 })
    expect(parseContextOverflow(Error('connection timed out'))).toEqual({ overflow: false, limitTokens: null })
  })

  it('drops one oldest complete group when a provider gives no number', () => {
    const packed = trimOneContextGroup([item('system', 'system', 's', true), item('u1', 'user', 'one'), item('a1', 'assistant', 'answer'), item('u2', 'user', 'two'), item('current', 'user', 'now', true)])
    expect(packed.messages.map(row => row.id)).toEqual(['system', 'u2', 'current'])
    expect(packed.omitted.map(row => row.id)).toEqual(['u1', 'a1'])
  })

  it('validates durable receipts', () => {
    expect(estimateModelTokens('hello')).toBeGreaterThan(0)
    expect(validModelContextReceipt({ model: 'm', capacity: { source: 'unknown', tokens: null, mode: 'auto' }, estimate: { inputTokens: 4, exact: false, method: 'estimate' }, includedMessages: 2, omitted: [], attempts: 1, overflowRetry: false, note: 'No clipping.' })).toBe(true)
  })
})
