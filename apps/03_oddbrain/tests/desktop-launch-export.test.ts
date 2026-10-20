import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createLaunchGate } from '../src/main/uiLaunch'
import { readUiPreview } from '../src/main/uiPreview'

test('launch belongs to the process, not each recreated renderer or quick window', () => {
  const process = createLaunchGate(); assert.equal(process(), true)
  assert.equal(process(), false); assert.equal(process(), false)
  const nextProcess = createLaunchGate(); assert.equal(nextProcess(), true)
  const main = readFileSync(resolve('src/main/index.ts'), 'utf8')
  assert.match(main, /^const claimUiLaunch = createLaunchGate\(\)/m)
  assert.match(main, /handle\('app:claim-launch', \(\) => claimUiLaunch\(\)\)/)
  const app = readFileSync(resolve('src/renderer/src/App.tsx'), 'utf8')
  const quick = app.slice(app.indexOf('function QuickMode'), app.indexOf('export default function App'))
  assert.doesNotMatch(quick, /<LaunchOverlay/)
  assert.match(quick, /await engine\.send\(prompt\)/)
  assert.match(quick, /else setProblem\(answer\.answer\)/)
  assert.doesNotMatch(quick, /setDraft\(''\)/, 'a refused send never discards the draft')
})
test('read-only export asset has fixed developer/packaged paths and fails honestly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oddbrain-ui-export-'))
  try {
    const app = join(root, 'app'), resources = join(root, 'installed')
    await mkdir(join(app, 'resources'), { recursive: true }); await mkdir(resources)
    await writeFile(join(app, 'resources', 'oddbrain-preview.html'), '<!doctype html><title>dev</title>')
    await writeFile(join(resources, 'oddbrain-preview.html'), '<!doctype html><title>installed</title>')
    assert.equal((await readUiPreview(app, resources, false)).html, '<!doctype html><title>dev</title>')
    assert.equal((await readUiPreview(app, resources, true)).html, '<!doctype html><title>installed</title>')
    const missing = await readUiPreview(join(root, 'missing'), resources, false)
    assert.equal(missing.ok, false); assert.match(missing.error || '', /missing/)
    await writeFile(join(resources, 'oddbrain-preview.html'), 'x'.repeat(8_000_001))
    assert.equal((await readUiPreview(app, resources, true)).ok, false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('offline HTML is generated from this renderer and keeps executable source out of HTML parsing', () => {
  const source = readFileSync(resolve('scripts/build-ui-preview.mjs'), 'utf8')
  assert.match(source, /src\/renderer\/src\/main\.tsx/)
  assert.match(source, /toString\('base64'\)/)
  assert.match(source, /application\/octet-stream/)
  assert.match(source, /gzipSync/); assert.match(source, /new DecompressionStream\('gzip'\)/)
  assert.match(source, /connect-src 'none'/)
  assert.match(source, /__oddbrainEphemeralStorage/)
  assert.match(source, /prefix='oddbrain-ui-preview-'/)
  const helper = readFileSync(resolve('src/renderer/src/ui/exportPreview.ts'), 'utf8')
  assert.match(helper, /doc\.querySelector\('#root'\)\?\.replaceChildren\(\)/)
  assert.match(helper, /oddbrain-preview-runtime/)
  assert.match(helper, /JSON\.stringify\(safe\)\.replace/)
  assert.match(helper, /importLook\(snapshot\)/)
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  assert.match(pkg.scripts.build, /scripts\/build-ui-preview\.mjs/)
  assert.match(readFileSync(resolve('electron-builder.yml'), 'utf8'), /from: resources\/oddbrain-preview\.html/)
})

test('a stored false quick-window preference remains false at the next boot', async () => {
  const { readQuickPreference } = await import('../src/renderer/src/state/quickPreference')
  const global = globalThis as unknown as { localStorage?: Storage }
  const original = global.localStorage
  let value: string | null = 'false'
  global.localStorage = { getItem: () => value } as unknown as Storage
  try {
    assert.equal(readQuickPreference(), false)
    value = 'true'; assert.equal(readQuickPreference(), true)
    value = null; assert.equal(readQuickPreference(), true)
  } finally { if (original) global.localStorage = original; else delete global.localStorage }
})
