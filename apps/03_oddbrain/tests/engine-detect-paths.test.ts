import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkBinary, defaultCandidates } from '../src/main/engine/availability'
import { engineCandidates, resolveEngineCommand, shellSafeCommand } from '../src/main/engine/enginePath'
import type { EngineAvailability } from '../src/shared/lib/engine'

/**
 * The owner's machine: engines installed while the app's PATH snapshot was
 * stale, so a bare-name spawn answered "'agy' is not recognized as an
 * internal or external command". Three guards are pinned here: the known
 * install spots are listed at all, detection probes them by absolute path
 * when the PATH answer fails, and a launch prefers an absolute binary.
 */

const fakeEnv = (dir: string): NodeJS.ProcessEnv => ({ APPDATA: dir, USERPROFILE: dir, LOCALAPPDATA: join(dir, 'local') })

test('engineCandidates lists the npm folder and .local/bin on Windows-shaped envs', () => {
  const spots = engineCandidates('claude-code', fakeEnv('\\Users\\nishad\\home'))
  assert.ok(spots.some(p => p.includes('npm') && p.endsWith('claude.cmd')), JSON.stringify(spots))
  assert.ok(spots.some(p => p.includes('.local') && p.includes('bin')), JSON.stringify(spots))
  const agySpots = engineCandidates('agy', fakeEnv('\\Users\\nishad\\home'))
  assert.ok(agySpots.some(p => p.endsWith('agy.exe')), JSON.stringify(agySpots))
})

test('checkBinary falls back to an absolute probe and reports where it found the engine', async () => {
  const asked: string[] = []
  const runner = (command: string, _args: string[], onDone: (error: unknown, stdout: string) => void) => {
    asked.push(command)
    if (command.endsWith('.cmd') || command === 'claude') onDone(new Error('not recognized'), '')
    else onDone(null, '2.1.0 (Claude Code)')
  }
  const answer: EngineAvailability = await checkBinary('claude', 'claude-code', {
    runner,
    exists: () => true,
    candidates: ['/users/nishad/npm/claude.cmd', '/users/nishad/.local/bin/claude.exe'],
  })
  assert.equal(answer.found, true)
  assert.equal(answer.version, '2.1.0 (Claude Code)')
  assert.equal(answer.path, '/users/nishad/.local/bin/claude.exe')
  assert.ok(asked.includes('claude'), 'the PATH answer is tried first')
  assert.deepEqual(asked, ['claude', '/users/nishad/npm/claude.cmd', '/users/nishad/.local/bin/claude.exe'], 'spots are probed in order, PATH first')
})

test('checkBinary stays honest when nothing exists: not found, no invented path', async () => {
  const runner = (_command: string, _args: string[], onDone: (error: unknown, stdout: string) => void) =>
    onDone(new Error('not recognized'), '')
  const answer = await checkBinary('agy', 'agy', { runner, exists: () => false })
  assert.equal(answer.found, false)
  assert.equal(answer.path, undefined)
})

test('resolveEngineCommand prefers a binary that really exists on disk', () => {
  const root = mkdtempSync(join(tmpdir(), 'engine-detect-'))
  try {
    mkdirSync(join(root, 'npm'), { recursive: true })
    writeFileSync(join(root, 'npm', 'claude.cmd'), 'echo ok\r\n')
    const env = { APPDATA: root, USERPROFILE: join(root, 'home'), LOCALAPPDATA: join(root, 'local') }
    const command = resolveEngineCommand('claude-code', env)
    assert.equal(command, join(root, 'npm', 'claude.cmd'))
    // ...and hands back the bare name when the machine has none of the spots.
    const bare = resolveEngineCommand('claude-code', { APPDATA: join(root, 'nothing') })
    assert.equal(bare, 'claude')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('defaultCandidates mirrors engineCandidates for both engines', () => {
  const env = fakeEnv('/x')
  assert.deepEqual(defaultCandidates('claude-code', env), engineCandidates('claude-code', env))
  assert.deepEqual(defaultCandidates('agy', env), engineCandidates('agy', env))
})

test('a Windows absolute path with spaces is quoted exactly once — the trap his terminal proved', () => {
  const native = 'C:\\Users\\Nishad Islam Utso\\.local\\bin\\claude.exe'
  assert.equal(shellSafeCommand(native, 'win32'), `"${native}"`)
  // bare names and space-free paths go through untouched
  assert.equal(shellSafeCommand('claude', 'win32'), 'claude')
  assert.equal(shellSafeCommand('C:\\Users\\nishad\\.local\\bin\\claude.exe', 'win32'), 'C:\\Users\\nishad\\.local\\bin\\claude.exe')
})

test('off Windows the helper is a no-op — the array form needs no quoting', () => {
  assert.equal(shellSafeCommand('/home/nishad islam utso/.local/bin/claude', 'linux'), '/home/nishad islam utso/.local/bin/claude')
})

test('every place that shells out an engine command quotes it first', () => {
  // Source pins: a new engine spawn or probe that forgets the quoting
  // re-creates the exact "'claude' is not recognized" his machine showed.
  const claude = readFileSync(new URL('../src/main/engine/claudeCode.ts', import.meta.url), 'utf8')
  const agy = readFileSync(new URL('../src/main/engine/agy.ts', import.meta.url), 'utf8')
  const detect = readFileSync(new URL('../src/main/engine/availability.ts', import.meta.url), 'utf8')
  assert.match(claude, /start\(shellSafeCommand\(resolveEngineCommand\('claude-code'\)\)/)
  // Native agy now bypasses the shell entirely; quoting would become part of the filename.
  assert.ok(agy.includes('child = start(command, args, {'))
  assert.ok(agy.includes('shell: false'))
  assert.ok(detect.includes('run(shellSafeCommand(command)'))
  assert.ok(detect.includes('run(shellSafeCommand(candidates[index])'))
})
