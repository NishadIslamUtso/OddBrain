import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  buildRepoMapText,
  humanBytes,
  mapContextBlock,
  REPO_MAP_IGNORES,
  REPO_MAP_MAX_CHARS,
  type RepoEntry,
} from '../src/shared/lib/repoMap'
import { buildRepoMap } from '../src/main/repoMap'

/**
 * The repo map: the folder's structure on one page. Bounded on purpose
 * (ignores, depth, count, characters) and honest about cuts; the door reads
 * only the folder the engine already works in — no path comes from the
 * window. Aider plants the flag; the honesty is ours.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

test('the map: dirs first, sizes honest, cuts announced', () => {
  const entries: RepoEntry[] = [
    { path: 'src', dir: true, bytes: null },
    { path: 'src/small.ts', dir: false, bytes: 40 },
    { path: 'src/state', dir: true, bytes: null },
    { path: 'README.md', dir: false, bytes: 2048 },
    { path: 'src/state/engine.ts', dir: false, bytes: 15 * 1024 },
  ]
  const built = buildRepoMapText('my-app', entries)
  assert.equal(built.files, 3)
  assert.equal(built.dirs, 2)
  assert.equal(built.truncated, false)
  const lines = built.map.split('\n')
  assert.match(lines[0] ?? '', /^my-app\/ — 3 files, 2 folders$/)
  assert.match(lines[1] ?? '', /^src\/$/, 'equal depth: folders first')
  assert.match(lines[2] ?? '', /^README\.md · 2\.0 KB$/)
  assert.match(lines[5] ?? '', /^    engine\.ts · 15\.0 KB$/, 'depth becomes indentation')
  assert.equal(humanBytes(999), '999 B')
  assert.equal(humanBytes(1024 * 1024 * 3), '3.0 MB')
})

test('the bounds: too many entries are cut, and the map SAYS so', () => {
  const many: RepoEntry[] = Array.from({ length: 3_000 }, (_, index) => ({
    path: `f${index}.txt`,
    dir: false,
    bytes: 10,
  }))
  const built = buildRepoMapText('big', many)
  assert.equal(built.truncated, true)
  assert.match(built.map, /the rest did not fit/)
  assert.ok(built.map.length <= REPO_MAP_MAX_CHARS + 200, 'the character bound holds even with the cut line')
})

test('the context block: the map rides labelled as structure, never as contents', () => {
  const block = mapContextBlock('x/')
  assert.match(block, /^\[Map of the folder I chose/)
  assert.match(block, /read the files themselves/)
})

test('the walk: ignores skip, depth holds, an empty or missing folder refuses honestly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repop-'))
  await mkdir(join(root, 'node_modules'), { recursive: true })
  await writeFile(join(root, 'node_modules', 'heavy.js'), 'x')
  await mkdir(join(root, 'deep', 'a', 'b', 'c', 'd', 'e', 'f'), { recursive: true })
  await writeFile(join(root, 'deep', 'a', 'b', 'c', 'd', 'e', 'f', 'too-far.txt'), 'x')
  await writeFile(join(root, 'deep', 'near.md'), 'real')
  await writeFile(join(root, 'empty.txt'), '')
  const answer = await buildRepoMap(root)
  assert.ok(answer.ok)
  if (!answer.ok) return
  assert.doesNotMatch(answer.map, /heavy\.js/, 'node_modules is ignored, never mapped')
  assert.doesNotMatch(answer.map, /too-far/, 'the depth bound holds')
  assert.doesNotMatch(answer.map, /empty\.txt/, 'an empty file says nothing on a map')
  assert.match(answer.map, /near\.md/)
  assert.ok(answer.files >= 1)
  await rm(root, { recursive: true, force: true })

  const missing = await buildRepoMap(join(root, 'gone'))
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.match(missing.answer, /does not exist|nothing to map/)
  for (const ignored of ['node_modules', '.git', 'dist', 'build', '__pycache__']) {
    assert.ok(REPO_MAP_IGNORES.has(ignored), `${ignored} stays on the ignore list`)
  }
})

test('the wiring: the map door reads the WORKING folder, and the composer can add it to a message', () => {
  const main = read('../src/main/index.ts')
  const composer = read('../src/renderer/src/components/Composer.tsx')
  assert.match(composer, /MapButton/, 'the composer has the map door')
  assert.match(composer, /Add to message/, 'the map can ride with the next work order')
  assert.match(composer, /getEngineApi\(\)\.repoMap\(\)/, 'it asks the engine bridge, like every engine tool')
  const preload = read('../src/preload/index.ts')
  assert.match(preload, /repo:map/)
  const bridge = read('../src/renderer/src/platform/bridge.ts')
  assert.match(bridge, /repoMap: \(\)/, 'the bridge type carries the map')
  assert.match(bridge, /The map is drawn in the desktop app\./, 'the preview fallback refuses honestly')
  const walker = read('../src/main/repoMap.ts')
  assert.match(walker, /REPO_MAP_IGNORES/, 'the walker honours the ignores')
})
