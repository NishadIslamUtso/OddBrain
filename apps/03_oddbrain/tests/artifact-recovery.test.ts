// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { list, read, save } from '../src/main/artifacts/store'

const roots: string[] = []
function workspace() { const root = mkdtempSync(join(tmpdir(), 'ob-recovery-')); roots.push(root); return root }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function folder(root: string, id: string) { const path = join(root, 'items', id); mkdirSync(path, { recursive: true }); return path }
function index(root: string) { return JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) }

test('unindexed versions become readable history without replacing metadata or the current selection', () => {
  const root = workspace()
  save(root, { id: 'fixture', title: 'Keep my title', content: 'first', note: 'original note', chatId: 'chat1' })
  const before = index(root).items[0]
  writeFileSync(join(root, 'items', 'fixture', 'v2.html'), 'recovered work')
  const result = list(root)
  expect(result.ok && result.items[0].versionCount).toBe(2)
  const current = read(root, 'fixture'), recovered = read(root, 'fixture', 2)
  expect(current.ok && current.content).toBe('first')
  expect(recovered.ok && recovered.content).toBe('recovered work')
  const after = index(root).items[0]
  expect({ ...after, versions: before.versions }).toEqual(before)
  expect(after.versions[0].note).toBe('original note')
  const repaired = readFileSync(join(root, 'index.json'), 'utf8')
  list(root)
  expect(readFileSync(join(root, 'index.json'), 'utf8')).toBe(repaired)
})

test('recovered versions append without renumbering existing history slots', () => {
  const root = workspace(), path = folder(root, 'fixture')
  writeFileSync(join(path, 'v3.html'), 'existing history')
  list(root)
  writeFileSync(join(path, 'v1.html'), 'copied in later')
  const result = list(root)
  expect(result.ok && result.items[0].versionCount).toBe(2)
  const first = read(root, 'fixture', 1), second = read(root, 'fixture', 2)
  expect(first.ok && first.content).toBe('existing history')
  expect(second.ok && second.content).toBe('copied in later')
})

test('duplicate index identities cannot create competing cards or survive repair', () => {
  const root = workspace()
  save(root, { id: 'fixture', title: 'First title', content: 'original' })
  const data = index(root)
  data.items.push({ ...data.items[0], title: 'Conflicting title' })
  writeFileSync(join(root, 'index.json'), JSON.stringify(data))
  const result = list(root)
  expect(result.ok && result.items.map(item => item.title)).toEqual(['First title'])
  expect(index(root).items).toHaveLength(1)
})

test('directories with version-like names do not become phantom artifacts', () => {
  const root = workspace()
  mkdirSync(join(folder(root, 'bogus'), 'v1.html'))
  writeFileSync(join(folder(root, 'healthy'), 'v1.html'), 'real content')
  const result = list(root)
  expect(result.ok && result.items.map(item => item.id)).toEqual(['healthy'])
})

test.skipIf(process.platform === 'win32')('a broken version link cannot prevent recovery of healthy sibling artifacts', () => {
  const root = workspace()
  symlinkSync(join(root, 'missing'), join(folder(root, 'a-broken'), 'v1.html'))
  writeFileSync(join(folder(root, 'z-healthy'), 'v1.html'), 'real content')
  const result = list(root)
  expect(result.ok && result.items.map(item => item.id)).toEqual(['z-healthy'])
})

test.skipIf(process.platform === 'win32')('recovery does not import linked folders or version files outside the library', () => {
  const root = workspace(), outside = workspace()
  writeFileSync(join(outside, 'v1.html'), 'not library content')
  const path = folder(root, 'linked-version')
  symlinkSync(join(outside, 'v1.html'), join(path, 'v1.html'))
  symlinkSync(outside, join(root, 'items', 'linked-folder'))
  const result = list(root)
  expect(result.ok && result.items).toEqual([])
})
