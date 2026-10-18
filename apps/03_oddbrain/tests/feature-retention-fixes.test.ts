import { test, expect, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { adopt, list, listTrash, read, remove, restoreTrash, save } from '../src/main/artifacts/store'
import { createMemoryManager } from '../src/main/memoryFiles'
import { EMPTY_SETTINGS, readSettings, writeSettings } from '../src/main/settings'
import { compileFor, DEFAULT_HOUSE_RULES } from '../src/shared/lib/houseRules'
import { buildMemoryOrder } from '../src/shared/lib/memory'

const temp = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix))

test('Trash recovery preserves the title and every version without overwriting an active artifact', () => {
  const root = temp('artifact-recovery-')
  try {
    expect(save(root, { id: 'test-art', title: 'Original title', type: 'html', content: '<h1>one</h1>' }).ok).toBe(true)
    expect(save(root, { id: 'test-art', content: '<h1>two</h1>' }).ok).toBe(true)
    expect(remove(root, 'test-art').ok).toBe(true)
    const trashed = listTrash(root)
    expect(trashed.items).toHaveLength(1)
    expect(trashed.items[0]).toMatchObject({ title: 'Original title', versionCount: 2 })

    expect(save(root, { id: 'test-art', title: 'New active', type: 'html', content: '<p>do not overwrite</p>' }).ok).toBe(true)
    const recovered = restoreTrash(root, trashed.items[0].key)
    expect(recovered.ok).toBe(true)
    if (!recovered.ok) throw Error(recovered.error)
    expect(recovered.item.id).not.toBe('test-art')
    expect(recovered.item.versionCount).toBe(2)
    expect(recovered.item.title).toBe('Original title')
    expect(read(root, recovered.item.id, 1)).toMatchObject({ ok: true, content: '<h1>one</h1>' })
    expect(read(root, recovered.item.id)).toMatchObject({ ok: true, content: '<h1>two</h1>' })
    expect(read(root, 'test-art')).toMatchObject({ ok: true, content: '<p>do not overwrite</p>' })
    expect(listTrash(root).items).toHaveLength(0)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Trash refuses traversal, version links, and a symlinked Trash directory', (t) => {
  const root = temp('trash-guard-'), outside = temp('outside-guard-')
  try {
    save(root, { id: 'guard', type: 'svg', content: '<svg></svg>' })
    expect(remove(root, 'guard').ok).toBe(true)
    const entry = listTrash(root).items[0]
    expect(restoreTrash(root, '../outside').ok).toBe(false)
    const file = join(root, '.trash', entry.key, 'v1.svg'), privateFile = join(outside, 'private.svg')
    writeFileSync(privateFile, 'PRIVATE')
    rmSync(file)
    try { symlinkSync(privateFile, file) } catch { t.skip('this filesystem denies symlinks'); return }
    expect(listTrash(root).items).toHaveLength(0)
    expect(restoreTrash(root, entry.key).ok).toBe(false)
    expect(readFileSync(privateFile, 'utf8')).toBe('PRIVATE')
    rmSync(join(root, '.trash'), { recursive: true, force: true })
    try { symlinkSync(outside, join(root, '.trash'), 'dir') } catch { t.skip('this filesystem denies directory symlinks'); return }
    save(root, { id: 'another', type: 'html', content: 'safe' })
    expect(remove(root, 'another').ok).toBe(false)
    expect(existsSync(join(root, 'items', 'another', 'v1.html'))).toBe(true)
    expect(readFileSync(privateFile, 'utf8')).toBe('PRIVATE')
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }) }
})

test('active artifact folders and versions cannot follow links outside the library', (t) => {
  const root = temp('artifact-active-'), outside = temp('artifact-outside-')
  try {
    mkdirSync(join(root, 'items'), { recursive: true })
    try { symlinkSync(outside, join(root, 'items', 'escape'), 'dir') } catch { t.skip('this filesystem denies symlinks'); return }
    expect(save(root, { id: 'escape', type: 'html', content: 'private write' }).ok).toBe(false)
    expect(existsSync(join(outside, 'v1.html'))).toBe(false)
    expect(save(root, { id: 'safe', type: 'html', content: 'old' }).ok).toBe(true)
    const secret = join(outside, 'secret.html'), version = join(root, 'items', 'safe', 'v1.html')
    writeFileSync(secret, 'PRIVATE')
    rmSync(version)
    try { symlinkSync(secret, version) } catch { t.skip('this filesystem denies file symlinks'); return }
    expect(read(root, 'safe').ok).toBe(false)
    expect(save(root, { id: 'safe', type: 'html', content: 'new' }).ok).toBe(false)
    expect(readFileSync(secret, 'utf8')).toBe('PRIVATE')
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }) }
})

test('legacy Trash without metadata admits only the recoverable title from its file id', () => {
  const root = temp('legacy-trash-')
  try {
    save(root, { id: 'legacy', type: 'html', content: '<p>old</p>' })
    remove(root, 'legacy')
    let entry = listTrash(root).items[0]
    rmSync(join(root, '.trash', entry.key, '.oddbrain-trash.json'))
    entry = listTrash(root).items[0]
    expect(entry.recoveredMetadata).toBe(true)
    expect(entry.title).toBe('legacy')
    expect(restoreTrash(root, entry.key).ok).toBe(true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('re-adopting a chat cannot undo deletion, even when the Trash metadata is damaged', () => {
  const root = temp('trash-adopt-')
  try {
    save(root, { id: 'deleted', type: 'html', content: '<p>original</p>' })
    remove(root, 'deleted')
    const entry = listTrash(root).items[0]
    rmSync(join(root, '.trash', entry.key, '.oddbrain-trash.json'))
    rmSync(join(root, '.trash', entry.key, 'v1.html'))
    const answer = adopt(root, [{ id: 'deleted', title: 'old chat copy', type: 'html', content: '<p>original</p>' }])
    expect(answer.adopted).toBe(0)
    const active = list(root)
    expect(active.ok && active.items).toHaveLength(0)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('selected memory directory controls real reads/removals, refuses stale and linked files', async () => {
  const root = temp('memory-location-'), selected = join(root, 'chosen'), outside = join(root, 'outside.md')
  let custom = ''
  mkdirSync(selected)
  writeFileSync(join(selected, 'engine-notes.md'), 'chosen memory')
  writeFileSync(outside, 'PRIVATE')
  let linked = false
  try { symlinkSync(outside, join(selected, 'linked.md')); linked = true } catch { /* Windows may deny link creation; other path guards still run. */ }
  const memory = createMemoryManager(() => root, () => custom)
  try {
    custom = selected
    const listed = await memory.list()
    expect(listed.folder).toBe(selected)
    expect(listed.files?.map(file => file.content)).toEqual(['chosen memory'])
    if (linked) {
      expect(listed.answer).toContain('not read')
      expect((await memory.remove('06 Review/Memory/linked.md', selected)).ok).toBe(false)
    }
    expect((await memory.remove('06 Review/Memory/engine-notes.md', 'C:\\stale')).ok).toBe(false)
    expect((await memory.remove('06 Review/Memory/../../outside.md', selected)).ok).toBe(false)
    expect((await memory.remove('06 Review/Memory/engine-notes.md', selected)).ok).toBe(true)
    expect(readFileSync(outside, 'utf8')).toBe('PRIVATE')
    custom = join(root, 'missing-selected')
    expect((await memory.list()).ok).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the selected memory directory survives settings writes and does not become a movable vault path', () => {
  const root = temp('memory-settings-'), file = join(root, 'settings.json'), selected = join(root, 'notes')
  try {
    writeSettings(file, { ...EMPTY_SETTINGS, memoryFolder: selected })
    expect(readSettings(file).memoryFolder).toBe(selected)
    writeSettings(file, { ...readSettings(file), cloud: { baseUrl: '', model: '' } })
    expect(readSettings(file).memoryFolder).toBe(selected)
    expect(readSettings(file).vaultPath).toBe(EMPTY_SETTINGS.vaultPath)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a memory pass uses the current local date, including after midnight', () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0, 0))
    expect(buildMemoryOrder()).toContain("'## 2026-10-18'")
    vi.setSystemTime(new Date(2026, 9, 19, 10, 0, 0))
    expect(buildMemoryOrder()).toContain("'## 2026-10-19'")
    expect(buildMemoryOrder()).not.toContain('2026-10-16')
  } finally { vi.useRealTimers() }
})

test('selected memory folder appears in both rules and pass without mutating the owner rules', () => {
  const path = 'C:\\my notes\\dedicated-memory', before = JSON.stringify(DEFAULT_HOUSE_RULES)
  const rules = compileFor('claude-code', DEFAULT_HOUSE_RULES, path)
  const pass = buildMemoryOrder(path)
  expect(rules).toContain('dedicated-memory/engine-notes.md')
  expect(pass).toContain('dedicated-memory/engine-notes.md')
  expect(JSON.stringify(DEFAULT_HOUSE_RULES)).toBe(before)
})

test('core controls are wired into main IPC and the existing renderer screens', () => {
  const src = (name: string): string => readFileSync(new URL('../src/' + name, import.meta.url), 'utf8')
  const main = src('main/index.ts'), app = src('renderer/src/App.tsx')
  const settings = src('renderer/src/components/SettingsView.tsx')
  expect(main).toContain("handle('automation:update'")
  expect(main).toContain("handle('memory:choose-folder'")
  expect(main).toContain("deployHouseRules(settings.engine.id, settings.engine.model, home, clean, settings.memoryFolder || '')")
  expect(main).toContain("handle('engine:checkpoint:inspect'")
  expect(settings).toContain('scope="keep"')
  expect(settings).toContain('scope="review"')
  expect(settings).toContain('scope="access"')
  expect(app).toContain('onQueryChange={setArtifactQuery}')
  expect(app).toContain('onLibraryChanged={() => void library.refresh()}')
  expect(app).toContain('consumeSeed(pendingBrief)')
  expect(src('renderer/src/components/ProjectsView.tsx')).toContain('aria-label="Project name"')
  expect(src('renderer/src/components/MemorySection.tsx')).toContain('chooseMemoryFolder()')
  expect(src('renderer/src/components/EnginePanel.tsx')).toContain('CopyText')
  expect(src('renderer/src/components/EnginePanel.tsx')).toContain('token usage not reported this window')
})
