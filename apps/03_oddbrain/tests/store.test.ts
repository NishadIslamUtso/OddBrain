import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createWorkspaceStore } from '../src/main/store'
import { emptyWorkspace, newProject } from '../src/shared/workspace'

const directories: string[] = []
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'oddbrain-store-'))
  directories.push(directory)
  return createWorkspaceStore(directory)
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('desktop workspace store', () => {
  it('persists validated revisions in a separate file and loads them after reopening', async () => {
    const store = await fixture()
    expect(await store.read()).toMatchObject({ ok: true, revision: 0, data: emptyWorkspace() })
    const first = await store.write(
      newProject(emptyWorkspace(), 'project1', 'Plan', new Date().toISOString()),
      0,
    )
    expect(first).toMatchObject({ ok: true, revision: 1 })
    expect(await createWorkspaceStore(dirname(store.path)).read()).toMatchObject({
      ok: true,
      revision: 1,
      data: first.ok ? first.data : undefined,
    })
    const disk = JSON.parse(await readFile(store.path, 'utf8'))
    expect(disk.revision).toBe(1)
    expect(disk.data.projects[0].name).toBe('Plan')
  })

  it('serializes competing writers; a stale revision cannot erase the first write', async () => {
    const store = await fixture()
    const left = newProject(emptyWorkspace(), 'left', 'Left', new Date().toISOString())
    const right = newProject(emptyWorkspace(), 'right', 'Right', new Date().toISOString())
    const [a, b] = await Promise.all([store.write(left, 0), store.write(right, 0)])
    expect(a.ok).toBe(true)
    expect(b).toMatchObject({ ok: false, error: expect.stringContaining('changed in another window') })
    expect(await store.read()).toMatchObject({ ok: true, revision: 1, data: left })
  })

  it('does not overwrite an unreadable on-disk workspace', async () => {
    const store = await fixture()
    const broken = '{ "revision":0,"data":'
    await writeFile(store.path, broken)
    expect(await store.read()).toMatchObject({
      ok: false,
      error: expect.stringContaining('Nothing was overwritten'),
    })
    expect(await store.write(emptyWorkspace(), 0)).toMatchObject({
      ok: false,
      error: expect.stringContaining('Nothing was overwritten'),
    })
    expect(await readFile(store.path, 'utf8')).toBe(broken)
  })

  it('rejects invalid writes without changing disk or revision', async () => {
    const store = await fixture()
    const invalid = { ...emptyWorkspace(), version: 2 } as unknown as ReturnType<typeof emptyWorkspace>
    expect(await store.write(invalid, 0)).toMatchObject({
      ok: false,
      error: expect.stringContaining('cannot be read safely'),
    })
    expect(await store.read()).toMatchObject({ ok: true, revision: 0 })
  })
})
