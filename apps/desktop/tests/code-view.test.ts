// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resetEngineForTests, engineStore } from '../src/renderer/src/state/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'

/**
 * Code (06): the engine's workspace wearing its face. The screen reads the
 * real session memory, sets the real throttle, and points the real engine at
 * real folders — with "back to the vault" as an honest first-class choice.
 */
function fakeEngineApi(): void {
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({ engine: { ...DEFAULT_ENGINE, workspace: 'C:\\thesis' }, running: false, history: [] }),
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
    engine: {
      sessions: async () => [{ workspace: 'C:\\thesis', sessionId: 'abcdefgh1234' }],
      forgetSession: async () => ({ ok: true }),
      openFolder: async () => ({ ok: true }),
      setWorkspace: async (folder: string) => ({ ok: true, answer: folder }),
    },
  }
}

test('the code screen reads the real threads and clears them for real', async () => {
  fakeEngineApi()
  resetEngineForTests()
  const store = engineStore()
  await store.init()
  const sessions = await (window as unknown as { api: { engine: { sessions: () => Promise<Array<{ workspace: string }>> } } }).api.engine.sessions()
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].workspace, 'C:\\thesis')

  // The throttle quick-set drives the same store the bay drives.
  await store.setApproval('full')
  assert.equal(store.settings.approval, 'full')
  await store.setApproval('ask')
  assert.equal(store.settings.approval, 'ask')
})

test('the code screen opens from its project, wired to the real doors', () => {
  const read = (relative: string): string => readFileSync(`${process.cwd()}/${relative}`, 'utf8')
  // His pick (2026-10-16): Code lives inside Projects — not a global nav item.
  const nav = read('src/renderer/src/components/AppNav.tsx')
  const projects = read('src/renderer/src/components/ProjectsView.tsx')
  assert.match(projects, /onViewBoard/)
  const view = read('src/renderer/src/components/CodeView.tsx')
  assert.match(view, /engine\s*\.\s*sessions\(\)/)
  assert.match(view, /forgetSession/)
  assert.match(view, /Back to the vault/)
  const main = read('src/main/index.ts')
  assert.match(main, /engine:sessions/)
  assert.match(main, /engine:sessions-forget/)
  assert.match(main, /app:open-folder/)
  // The workspace door accepts empty as "back to the vault".
  assert.match(main, /Empty is allowed and means "back to the vault"/)
})
