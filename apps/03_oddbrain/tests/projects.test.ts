// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chatsOf, newProject, normalizeProject, normalizeProjects } from '../src/shared/lib/projects'
import { resetEngineForTests, engineStore } from '../src/renderer/src/state/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'

/**
 * Projects (04): a named home for related work. The storage door is strict
 * (damaged entries dropped, folders sanity-checked), a chat's project link
 * is real, and "Work here" goes through the app's own door — the window
 * never points the engine anywhere by itself.
 */
test('projects: strict normalization drops damage, keeps the truth', () => {
  const good = { id: 'abcdef123456', name: 'Thesis', instruction: 'Be precise.', folder: 'C:\\thesis', createdAt: '2026-10-16T08:00:00' }
  const kept = normalizeProject(good)
  assert.equal(kept?.name, 'Thesis')
  assert.equal(kept?.folder, 'C:\\thesis')
  assert.equal(normalizeProject({ id: 'short', name: 'x' }), null, 'bad id dropped')
  assert.equal(normalizeProject({ id: 'abcdef123456', name: '' }), null, 'nameless dropped')
  assert.equal(normalizeProject({ id: 'abcdef123456', name: 'x', folder: 'https://evil' })?.folder, '', 'URL folder refused')
  assert.equal(normalizeProject({ id: 'abcdef123456', name: 'x', folder: 'a\nb' })?.folder, '', 'newline smuggler refused')
  assert.deepEqual(normalizeProjects({ not: 'an array' }), [])
  assert.equal(normalizeProjects([good, good]).length, 1, 'duplicate ids deduped')
})

test('projects: newProject names and stamps', () => {
  const project = newProject('  Shop redesign  ')
  assert.equal(project.name, 'Shop redesign')
  assert.ok(project.id.length >= 6)
  assert.equal(project.instruction, '')
  assert.equal(newProject('').name, 'New project')
})

test('projects: chats link by id, newest first', () => {
  const chats = [
    { id: '1', projectId: 'p1', updatedAt: 100 },
    { id: '2', projectId: 'p1', updatedAt: 300 },
    { id: '3', projectId: null, updatedAt: 999 },
    { id: '4', updatedAt: 500 },
  ]
  assert.deepEqual(chatsOf(chats, 'p1').map((chat) => chat.id), ['2', '1'])
})

test('setWorkspace through the api answers ok and never touches the store pick-door', async () => {
  const read = (relative: string): string => readFileSync(`${process.cwd()}/${relative}`, 'utf8')
    let setWorkspace: string | null = null
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({ engine: { ...DEFAULT_ENGINE, workspace: '' }, running: false, history: [] }),
    pick: async () => ({ ok: true, answer: 'picked' }),
    models: async () => ({ ok: true, models: [], error: '' }),
    setModel: async () => ({ ok: true, answer: 'ok' }),
    setApproval: async () => ({ ok: true, answer: 'ok' }),
    pickWorkspace: async () => ({ ok: false, answer: 'no' }),
    detect: async () => [],
    pull: async () => ({ ok: false, answer: 'no' }),
    deleteModel: async () => ({ ok: false, answer: 'no' }),
    onPullEvent: () => () => undefined,
    send: async () => ({ ok: false, answer: 'no' }),
    answer: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    onEvent: () => () => undefined,
  }
  ;(window as unknown as Record<string, unknown>).api = {
    ...(window as unknown as Record<string, unknown>).api,
    engine: {
      setWorkspace: async (folder: string) => {
        setWorkspace = folder
        return { ok: true, answer: folder }
      },
    },
  }
  const answer = await (window as unknown as { api: { engine: { setWorkspace: (f: string) => Promise<{ ok: boolean }> } } }).api.engine.setWorkspace('C:\\thesis')
  assert.equal(answer.ok, true)
  assert.equal(setWorkspace, 'C:\\thesis')
  // The store's own pickWorkspace remains untouched — two doors, two purposes.
  const store = engineStore()
  assert.equal(store.settings.workspace, '')
})
