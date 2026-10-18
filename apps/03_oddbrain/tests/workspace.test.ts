import { describe, expect, it } from 'vitest'
import {
  MAX_ARTIFACT_BYTES,
  emptyWorkspace,
  importArtifact,
  kindFromName,
  newChat,
  newProject,
  removeArtifact,
  renameChat,
  renameProject,
  restoreArtifact,
  reviseArtifact,
  saveNote,
  validateWorkspace,
} from '../src/shared/workspace'

const at = '2026-10-18T10:00:00.000Z'

describe('workspace validation', () => {
  it('starts empty and sanitizes unknown fields rather than persisting them', () => {
    const workspace = emptyWorkspace()
    expect(validateWorkspace({ ...workspace, injected: 'not saved' })).toEqual(workspace)
  })

  it('refuses unknown versions, malformed records and missing project references', () => {
    expect(() => validateWorkspace({ ...emptyWorkspace(), version: 2 })).toThrow('cannot be read safely')
    expect(() =>
      validateWorkspace({ ...emptyWorkspace(), chats: [{ id: 'x', role: 'assistant' }] }),
    ).toThrow('chat is damaged')
    const orphan = newChat(emptyWorkspace(), 'chat1', at)
    orphan.chats[0].projectId = 'missing'
    expect(() => validateWorkspace(orphan)).toThrow('missing project')
  })

  it('refuses duplicate artifact/trash IDs, duplicate note IDs and oversized Unicode source', () => {
    const saved = importArtifact(emptyWorkspace(), 'artifact1', 'art.svg', 'svg', 'hello', at)
    expect(() => validateWorkspace({ ...saved, trash: [...saved.artifacts] })).toThrow('duplicate')
    const noted = saveNote(newChat(emptyWorkspace(), 'chat1', at), 'chat1', 'note1', 'hello', at)
    expect(() =>
      validateWorkspace({
        ...noted,
        chats: [{ ...noted.chats[0], messages: [noted.chats[0].messages[0], noted.chats[0].messages[0]] }],
      }),
    ).toThrow('duplicate')
    const wide = '界'.repeat(Math.ceil(MAX_ARTIFACT_BYTES / 3) + 1)
    expect(() =>
      validateWorkspace({
        ...saved,
        artifacts: [{ ...saved.artifacts[0], versions: [{ content: wide, at }] }],
      }),
    ).toThrow('version is damaged')
  })

  it('refuses a record limit and invalid timestamps', () => {
    expect(() => validateWorkspace({ ...emptyWorkspace(), projects: Array(501).fill(null) })).toThrow(
      'record limit',
    )
    expect(() =>
      validateWorkspace({
        ...emptyWorkspace(),
        projects: [{ id: 'p1', name: 'Folder', createdAt: 'next Tuesday' }],
      }),
    ).toThrow('project is damaged')
  })
})

describe('local workspace operations', () => {
  it('creates project-linked notes and renames without fabricating replies', () => {
    let data = newProject(emptyWorkspace(), 'p1', '  Alpha  ', at)
    data = newChat(data, 'c1', at, 'p1')
    data = saveNote(data, 'c1', 'n1', '  Write a test. ', at)
    data = renameChat(data, 'c1', 'Real note', at)
    data = renameProject(data, 'p1', 'New name')
    expect(data.projects[0].name).toBe('New name')
    expect(data.chats[0]).toMatchObject({
      title: 'Real note',
      projectId: 'p1',
      messages: [{ id: 'n1', role: 'note', text: 'Write a test.' }],
    })
    expect(validateWorkspace(data)).toEqual(data)
    expect(() => newChat(data, 'missing-chat', at, 'absent')).toThrow('no longer here')
  })

  it('imports, versions, recovers and never overwrites an existing artifact', () => {
    expect(kindFromName('story.md')).toBe('text')
    expect(kindFromName('virus.exe')).toBeNull()
    let data = importArtifact(emptyWorkspace(), 'a1', 'card.html', 'html', '<h1>1</h1>', at)
    data = reviseArtifact(data, 'a1', '<h1>2</h1>', at)
    expect(data.artifacts[0].versions).toHaveLength(2)
    expect(() => reviseArtifact(data, 'a1', '<h1>2</h1>', at)).toThrow('no changes')
    data = removeArtifact(data, 'a1')
    expect(data.artifacts).toHaveLength(0)
    expect(data.trash[0].versions).toHaveLength(2)
    data = restoreArtifact(data, 'a1', 'replacement')
    expect(data.artifacts[0]).toMatchObject({
      id: 'a1',
      versions: [{ content: '<h1>1</h1>' }, { content: '<h1>2</h1>' }],
    })
    expect(data.trash).toHaveLength(0)
    expect(validateWorkspace(data)).toEqual(data)
    const conflicting = { ...data, trash: [{ ...data.artifacts[0] }] }
    expect(() => restoreArtifact(conflicting, 'a1', 'a1')).toThrow('without overwriting')
  })
})
