import { describe, expect, it } from 'vitest'
import { chatsOf, normalizeProject, type Project } from '../src/shared/lib/projects'
import { resolveProjectContext } from '../src/shared/lib/projectContext'

/**
 * p2 — project isolation (NOT RUN by the implementing agent).
 * One project's context bundle must contain that project's material only:
 * no sibling project's instruction, goals, or references, and no chats at
 * all (chats are related work, never context by association).
 */

const project = (overrides: Partial<Project> = {}): Project =>
  normalizeProject({
    id: 'proj-a1',
    name: 'Alpha',
    instruction: 'Alpha instruction',
    folder: '',
    createdAt: '2026-10-19T00:00:00.000Z',
    goals: ['Alpha goal'],
    references: [
      { id: 'ref-a1', path: '/alpha/paper.pdf', label: 'paper.pdf', addedAt: '2026-10-19T00:00:00.000Z', includeInContext: true },
    ],
    ...overrides,
  }) as Project

describe('p2 project isolation', () => {
  it('a bundle carries only its own project sources', () => {
    const alpha = project()
    const beta = project({ id: 'proj-b2', name: 'Beta', instruction: 'Beta secret', goals: ['Beta goal'], references: [] })
    const bundle = resolveProjectContext(alpha)
    const titles = bundle.sources.map((source) => source.title).join(' ')
    expect(bundle.projectId).toBe('proj-a1')
    expect(titles).toContain('Project instruction')
    expect(titles).not.toContain('Beta')
    expect(bundle.sources.some((source) => source.origin === '/alpha/paper.pdf')).toBe(true)
    expect(resolveProjectContext(beta).sources.every((source) => source.origin !== '/alpha/paper.pdf')).toBe(true)
  })

  it('chats are related by projectId only, never by folder accident', () => {
    const chats = [
      { id: 'c1', projectId: 'proj-a1', updatedAt: 2 },
      { id: 'c2', projectId: 'proj-b2', updatedAt: 3 },
      { id: 'c3', projectId: null, updatedAt: 4 },
      { id: 'c4', projectId: 'proj-a1', updatedAt: 5 },
    ]
    expect(chatsOf(chats, 'proj-a1').map((chat) => chat.id)).toEqual(['c4', 'c1'])
    expect(chatsOf(chats, 'proj-b2').map((chat) => chat.id)).toEqual(['c2'])
  })

  it('revisions differ between projects with different instructions', async () => {
    const { projectRevision } = await import('../src/shared/lib/projectContext')
    expect(projectRevision(project())).not.toBe(projectRevision(project({ instruction: 'Changed' })))
    expect(projectRevision(project())).toBe(projectRevision(project({ name: 'Renamed' })))
  })
})
