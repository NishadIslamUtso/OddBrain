import { describe, expect, it } from 'vitest'
import { normalizeProject, type Project } from '../src/shared/lib/projects'
import { PROJECT_CONTEXT_LIMITS, resolveProjectContext } from '../src/shared/lib/projectContext'

/**
 * p2 — context scope and honest limits (NOT RUN by the implementing agent).
 * The resolver must say exactly what is included, what is left out and
 * why, and must mark partial/over-limit material explicitly instead of
 * silently clipping it. Originals are never modified by resolving.
 */

const base = (overrides: Record<string, unknown> = {}): Project =>
  normalizeProject({
    id: 'proj-c3',
    name: 'Context',
    instruction: 'Be precise.',
    folder: '',
    createdAt: '2026-10-19T00:00:00.000Z',
    goals: [],
    references: [],
    ...overrides,
  }) as Project

describe('p2 project context scope', () => {
  it('a reference joins only by the owner explicit yes', () => {
    const project = base({
      references: [
        { id: 'ref-x1', path: '/docs/a.md', label: 'a.md', addedAt: '2026-10-19T00:00:00.000Z', includeInContext: false },
        { id: 'ref-x2', path: '/docs/b.md', label: 'b.md', addedAt: '2026-10-19T00:00:00.000Z', includeInContext: true },
      ],
    })
    const bundle = resolveProjectContext(project, { '/docs/b.md': { extractedText: 'hello' } })
    const a = bundle.sources.find((source) => source.id === 'reference:ref-x1')
    const b = bundle.sources.find((source) => source.id === 'reference:ref-x2')
    expect(a?.included).toBe(false)
    expect(a?.extraction).toBe('excluded')
    expect(b?.included).toBe(true)
    expect(b?.text).toBe('hello')
  })

  it('an included reference without facts is metadata-only, never invented', () => {
    const project = base({
      references: [{ id: 'ref-y1', path: '/docs/big.pdf', label: 'big.pdf', addedAt: '2026-10-19T00:00:00.000Z', includeInContext: true }],
    })
    const bundle = resolveProjectContext(project)
    const source = bundle.sources.find((entry) => entry.id === 'reference:ref-y1')
    expect(source?.extraction).toBe('metadata-only')
    expect(source?.included).toBe(false)
    expect(source?.text).toBeNull()
    expect(bundle.warnings.join(' ')).toMatch(/not read yet/)
  })

  it('oversized material is partial and explicit, with both counts stated', () => {
    const big = 'x'.repeat(PROJECT_CONTEXT_LIMITS.perReferenceChars + 500)
    const project = base({
      references: [{ id: 'ref-z1', path: '/docs/huge.txt', label: 'huge.txt', addedAt: '2026-10-19T00:00:00.000Z', includeInContext: true }],
    })
    const bundle = resolveProjectContext(project, { '/docs/huge.txt': { extractedText: big } })
    const source = bundle.sources.find((entry) => entry.id === 'reference:ref-z1')
    expect(source?.extraction).toBe('partial')
    expect(source?.totalChars).toBe(big.length)
    expect(source?.chars).toBeLessThan(big.length)
    expect(bundle.coverage.overLimit).toBe(true)
    expect(bundle.coverage.chars).toBeLessThanOrEqual(bundle.coverage.limitChars)
  })

  it('linked and unreadable references are refused with reasons', () => {
    const project = base({
      references: [
        { id: 'ref-l1', path: '/docs/link.txt', label: 'link.txt', addedAt: '2026-10-19T00:00:00.000Z', includeInContext: true },
        { id: 'ref-l2', path: '/docs/gone.txt', label: 'gone.txt', addedAt: '2026-10-19T00:00:00.000Z', includeInContext: true },
      ],
    })
    const bundle = resolveProjectContext(project, {
      '/docs/link.txt': { linked: true, extractedText: 'should never travel' },
      '/docs/gone.txt': { readable: false },
    })
    expect(bundle.sources.find((s) => s.id === 'reference:ref-l1')?.extraction).toBe('linked')
    expect(bundle.sources.find((s) => s.id === 'reference:ref-l2')?.extraction).toBe('unreadable')
    expect(bundle.sources.every((s) => s.text !== 'should never travel')).toBe(true)
  })
})
