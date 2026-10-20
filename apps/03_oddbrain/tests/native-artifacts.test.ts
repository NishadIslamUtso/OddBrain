import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { snapshotNativeArtifacts, collectNativeArtifacts } from '../src/main/engine/nativeArtifacts'
import { read, list } from '../src/main/artifacts/store'
const roots: string[] = []
function root() { const p = mkdtempSync(join(tmpdir(), 'oddbrain-native-artifacts-')); roots.push(p); return p }
afterEach(() => roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })))
test('only changed output files enter the library; previous unrelated files are not adopted', () => {
  const workspace = root(), library = root(); mkdirSync(join(workspace, 'artifacts'))
  writeFileSync(join(workspace, 'artifacts', 'old.html'), '<html>Old private output</html>')
  const before = snapshotNativeArtifacts(workspace)
  writeFileSync(join(workspace, 'artifacts', 'new.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text>New</text></svg>')
  const observed = collectNativeArtifacts(library, workspace, before, 'chat-one')
  expect(observed.links).toHaveLength(1); expect(observed.links[0]).toMatchObject({ type: 'svg', version: 1, source: 'artifacts/new.svg' })
  const saved = read(library, observed.links[0].id, 1)
  expect(saved.ok && saved.item.chatId).toBe('chat-one')
  expect(readFileSync(join(workspace, 'artifacts', 'old.html'), 'utf8')).toContain('Old private output')
})
test('changed outputs retain exact earlier versions and never substitute a requested missing version', () => {
  const workspace = root(), library = root(), before = snapshotNativeArtifacts(workspace); mkdirSync(join(workspace, 'artifacts'))
  const file = join(workspace, 'artifacts', 'page.html'); writeFileSync(file, '<html>Version one</html>')
  const first = collectNativeArtifacts(library, workspace, before, 'chat-one').links[0], secondBefore = snapshotNativeArtifacts(workspace)
  writeFileSync(file, '<html>Version two</html>')
  const second = collectNativeArtifacts(library, workspace, secondBefore, 'chat-one').links[0]
  expect(second.id).toBe(first.id); expect(second.version).toBe(2)
  expect(read(library, first.id, 1)).toMatchObject({ ok: true, content: '<html>Version one</html>' })
  expect(read(library, first.id, 999)).toMatchObject({ ok: false })
})
test('links are refused rather than reading another directory or pretending the baseline was empty', () => {
  const workspace = root(), outside = root(), library = root()
  writeFileSync(join(outside, 'private.html'), '<html>Private</html>'); symlinkSync(outside, join(workspace, 'artifacts'), 'junction')
  const before = snapshotNativeArtifacts(workspace)
  expect(before.ok).toBe(false)
  const observed = collectNativeArtifacts(library, workspace, before, 'chat-one')
  expect(observed.links).toEqual([]); expect(observed.notices.length).toBeGreaterThan(0)
  expect(list(library)).toMatchObject({ ok: true, items: [] })
})
test('unsupported or unstable output does not become a successful preview', () => {
  const workspace = root(), library = root(), before = snapshotNativeArtifacts(workspace); mkdirSync(join(workspace, 'artifacts'))
  writeFileSync(join(workspace, 'artifacts', 'not-a-page.html'), 'This is not HTML')
  const observed = collectNativeArtifacts(library, workspace, before, 'chat-one')
  expect(observed.links).toHaveLength(0); expect(observed.notices.join(' ')).toContain('not a recognizable')
})
