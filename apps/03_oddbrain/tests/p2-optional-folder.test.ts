import { describe, expect, it } from 'vitest'
import { normalizeProject, normalizeProjects, newProject } from '../src/shared/lib/projects'
import { resolveProjectContext } from '../src/shared/lib/projectContext'

/**
 * p2 — optional folders and stored-project migration (NOT RUN by the
 * implementing agent). A non-coding project needs no folder, no Git and
 * no GitHub; projects stored before goals/references existed must load
 * with honest empty lists, and damaged attachments must drop individually
 * without taking the project down with them.
 */

describe('p2 optional folder', () => {
  it('a project without any folder is valid and resolves context', () => {
    const project = normalizeProject({
      id: 'proj-d4',
      name: 'Reading group',
      instruction: 'Track themes.',
      folder: '',
      createdAt: '2026-10-19T00:00:00.000Z',
    })
    expect(project).not.toBeNull()
    expect(project?.folder).toBe('')
    const bundle = resolveProjectContext(project as NonNullable<typeof project>)
    expect(bundle.sources.map((source) => source.kind)).toEqual(['instruction'])
  })

  it('old stored projects gain empty goals/references, never invented ones', () => {
    const stored = JSON.stringify([
      { id: 'proj-e5', name: 'Old', instruction: 'Legacy', folder: '/work/old', createdAt: '2025-01-01T00:00:00.000Z' },
    ])
    const [project] = normalizeProjects(JSON.parse(stored))
    expect(project.goals).toEqual([])
    expect(project.references).toEqual([])
  })

  it('damaged references drop one by one; the project survives', () => {
    const project = normalizeProject({
      id: 'proj-f6',
      name: 'Mixed',
      instruction: '',
      folder: '',
      createdAt: '2026-10-19T00:00:00.000Z',
      goals: ['Keep me', 42, ''],
      references: [
        { id: 'ref-ok', path: '/docs/ok.md', label: 'ok.md', addedAt: '2026-10-19T00:00:00.000Z', includeInContext: true },
        { id: 'bad', path: '', label: 'broken' },
        'not-an-object',
        { id: 'ref-no-flag', path: '/docs/no-flag.md', addedAt: '2026-10-19T00:00:00.000Z' },
      ],
    })
    expect(project).not.toBeNull()
    expect(project?.goals).toEqual(['Keep me'])
    expect(project?.references.map((reference) => reference.id)).toEqual(['ref-ok', 'ref-no-flag'])
    // A missing inclusion flag is a no, never a silent yes.
    expect(project?.references[1].includeInContext).toBe(false)
  })

  it('new projects start with no folder, goals or references', () => {
    const project = newProject('Fresh')
    expect(project.folder).toBe('')
    expect(project.goals).toEqual([])
    expect(project.references).toEqual([])
  })
})
