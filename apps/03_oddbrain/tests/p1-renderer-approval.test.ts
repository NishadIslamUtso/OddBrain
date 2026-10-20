// @vitest-environment jsdom
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { engineStore, resetEngineForTests } from '../src/renderer/src/state/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
let answer: ReturnType<typeof vi.fn>, approve: ReturnType<typeof vi.fn>
beforeEach(async () => {
  resetEngineForTests(); answer = vi.fn().mockResolvedValue({ ok: true }); approve = vi.fn().mockResolvedValue({ ok: true, answer: 'Saved project-folder Read approval.', view: { rules: [] } })
  Object.assign(window, { api: {}, engineApi: {
    read: async () => ({ engine: DEFAULT_ENGINE, running: false, history: [] }),
    send: async () => ({ ok: true, answer: 'started' }), answer,
    readTrust: { approve, list: async () => ({ ok: true, view: { rules: [] } }), revoke: async () => ({ ok: true, answer: '', view: { rules: [] } }), migrateLegacy: async () => ({ ok: true, answer: '', view: { rules: [] } }) },
    onEvent: () => () => {}, onPullEvent: () => () => {},
  } })
  await engineStore().init(); await engineStore().send('Task requiring a permission')
  engineStore().ingest({ kind: 'permission', requestId: 'request', tool: 'Bash', summary: 'pwd' })
})
afterEach(() => { resetEngineForTests(); delete (window as any).api; delete (window as any).engineApi })
test('a rejected backend acknowledgement does not remove the permission', async () => {
  answer.mockResolvedValue({ ok: false }); await engineStore().answer(true)
  expect(engineStore().turn!.permissions).toHaveLength(1)
  expect(engineStore().turn!.items.some(item => item.kind === 'status' && item.text.includes('no approval is assumed'))).toBe(true)
})
test('a thrown delivery error leaves the question and explains the uncertainty', async () => {
  answer.mockRejectedValue(Error('disconnected')); await engineStore().answer(true)
  expect(engineStore().turn!.permissions).toHaveLength(1)
  expect(engineStore().turn!.items.some(item => item.kind === 'status' && item.text.includes('could not be delivered'))).toBe(true)
})
test('repeated clicks deliver one decision and wait for acknowledgement', async () => {
  let finish!: (value: { ok: boolean }) => void
  answer.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = engineStore().answer(true); await engineStore().answer(false)
  expect(answer).toHaveBeenCalledTimes(1); expect(engineStore().turn!.permissions).toHaveLength(1)
  finish({ ok: true }); await pending; expect(engineStore().turn!.permissions).toHaveLength(0)
})
test('a late acknowledgement cannot consume a new turn’s same-named request', async () => {
  let finish!: (value: { ok: boolean }) => void
  answer.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const old = engineStore().answer(true)
  engineStore().ingest({ kind: 'done', text: 'old task ended' })
  await engineStore().send('Another task')
  engineStore().ingest({ kind: 'permission', requestId: 'request', tool: 'Bash', summary: 'another tool' })
  finish({ ok: true }); await old
  expect(engineStore().turn!.permissions).toHaveLength(1)
  expect(engineStore().turn!.permissions[0].summary).toBe('another tool')
})
test('broader read approval uses the main-process ticket and named scope', async () => {
  engineStore().turn!.permissions = []
  engineStore().ingest({ kind: 'permission', requestId: 'read-ticket', tool: 'Read', summary: 'notes.txt', file: 'notes.txt', readScopes: { file: 'C:\\work\\notes.txt', folder: 'C:\\work', workspace: 'C:\\work', project: true } })
  await engineStore().rememberAndAnswerRead('project')
  expect(approve).toHaveBeenCalledExactlyOnceWith('read-ticket', 'project')
  expect(answer).not.toHaveBeenCalled()
  expect(engineStore().turn!.permissions).toEqual([])
  expect(engineStore().turn!.items).toContainEqual({ kind: 'status', text: 'Saved project-folder Read approval.' })
})
