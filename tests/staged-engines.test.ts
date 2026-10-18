import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  binaryOverride,
  engineCandidates,
  registerStagingRoot,
  resetBinaryOverrides,
  resetStagingRoots,
  resolveEngineCommand,
  setBinaryOverride,
} from '../src/main/engine/enginePath'
import { readFileSync } from 'node:fs'

/**
 * The owner's machine: he put engines where the APP stages them
 * (engines/<id>/app under the app's data folder) and the probe ignored that
 * folder — "still not detected". These pins make the app's own staging
 * ground first-class for probing AND spawning.
 */

const env = { APPDATA: '/x/npm-root', USERPROFILE: '/x/home', LOCALAPPDATA: '/x/local' }

test('a registered staging root is probed first, before the machine spots', () => {
  resetStagingRoots()
  registerStagingRoot('/staged')
  const candidates = engineCandidates('agy', env)
  assert.ok(candidates[0] === join('/staged', 'agy', 'app', 'agy.exe'), candidates[0])
  assert.ok(candidates.some((p) => p === join('/staged', 'agy', 'agy.exe')), JSON.stringify(candidates))
  // claude-code gets its staged spots too, ahead of npm and .local/bin
  const claude = engineCandidates('claude-code', env)
  assert.ok(claude[0] === join('/staged', 'claude-code', 'app', 'claude.exe'))
  assert.ok(claude.some((p) => p.includes('npm')), 'machine spots still listed after the staged ones')
})

test('a binary dropped in the staged folder is what launches', () => {
  const root = mkdtempSync(join(tmpdir(), 'staged-'))
  try {
    const appDir = join(root, 'agy', 'app')
    mkdirSync(appDir, { recursive: true })
    writeFileSync(join(appDir, 'agy.exe'), 'binary', { mode: 0o755 })
    resetStagingRoots()
    registerStagingRoot(root)
    assert.equal(resolveEngineCommand('agy', env), join(appDir, 'agy.exe'))
  } finally {
    resetStagingRoots()
    rmSync(root, { recursive: true, force: true })
  }
})

test('registering the same root twice does not duplicate candidates', () => {
  resetStagingRoots()
  registerStagingRoot('/once')
  registerStagingRoot('/once')
  const candidates = engineCandidates('agy', env)
  // Counted through join, not a literal slash: on Windows join makes
  // backslash paths and a '/once' prefix would match nothing (the owner's
  // CI caught this test being Linux-shaped — the code was right, the pin
  // was not).
  const fromOnce = candidates.filter((p) => p.startsWith(join('/once', 'agy')) || p === join('/once', 'agy.exe') || p === join('/once', 'agy'))
  assert.equal(fromOnce.length, 5, JSON.stringify(candidates))
})

test('the boot registers the app data engines folder, and retries name the actual fix', () => {
  const index = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  assert.match(index, /registerStagingRoot\(join\(app\.getPath\('userData'\), 'engines'\)\)/)
  const stream = readFileSync(new URL('../src/main/engine/stream.ts', import.meta.url), 'utf8')
  assert.match(stream, /run `claude` once in a terminal and sign in/)
})

test('every directory on the PATH is probed by name — installers drop binaries anywhere', () => {
  resetStagingRoots()
  resetBinaryOverrides()
  const env = { APPDATA: '', USERPROFILE: '', LOCALAPPDATA: '', PATH: 'C:\\a;C:\\b with spaces;C:\\c' }
  const candidates = engineCandidates('agy', env)
  for (const dir of ['C:\\a', 'C:\\b with spaces', 'C:\\c']) {
    for (const ext of ['exe', 'cmd', 'bat']) {
      assert.ok(candidates.includes(join(dir, `agy.${ext}`)), `${dir} agy.${ext} missing from ${JSON.stringify(candidates)}`)
    }
  }
})

test('an owner-pointed binary beats every probe and launch', () => {
  resetStagingRoots()
  resetBinaryOverrides()
  const pointed = 'C:\\Users\\Nishad Islam Utso\\Downloads\\agy.exe'
  setBinaryOverride('agy', pointed)
  assert.equal(binaryOverride('agy'), pointed)
  assert.equal(resolveEngineCommand('agy', { PATH: '' }), pointed)
  const candidates = engineCandidates('agy', { PATH: '' })
  assert.equal(candidates[0], pointed, 'the override is the first probe candidate')
  resetBinaryOverrides()
  assert.equal(binaryOverride('agy'), '')
})
