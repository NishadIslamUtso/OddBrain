import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDownloadManager } from '../src/main/engine/downloads'

/**
 * Regression law, owner's bug #2 through its real path: the app records the
 * pid IT spawned into `userData/ollama/serve.pid`, and Stop kills exactly
 * that pid — never an unrelated process the person started themselves.
 * The start side and the death of the recorded pid are pinned in
 * engine-downloads.test.ts; this test pins the OTHER HALF: what the app did
 * not start survives.
 *
 * Real processes, real kill — POSIX only, like the sibling test (Windows'
 * taskkill tree path is pinned by stopArguments tests).
 */
test('ollama Stop kills the app-started pid and leaves an unrelated process alone', async (t) => {
  if (process.platform === 'win32') return
  const root = mkdtempSync(join(tmpdir(), 'serve-ctl-'))
  const appDir = join(root, 'ollama', 'app')
  mkdirSync(appDir, { recursive: true })
  // The stand-in runtime the app will own: a long-lived process.
  const binary = join(appDir, 'ollama')
  writeFileSync(binary, '#!/usr/bin/env node\nsetInterval(() => {}, 1000)\n', 'utf8')
  chmodSync(binary, 0o755)

  // A person's own process — not started by the app, not in the pid file.
  const control = spawn('sleep', ['300'], { stdio: 'ignore' })
  t.after(() => {
    try { process.kill(control.pid!, 'SIGKILL') } catch { /* already gone */ }
  })

  const manager = createDownloadManager({ root, probe: async () => false })
  const started = await manager.ollamaStart()
  assert.equal(started.ok, true)
  const pid = Number((await readFile(join(root, 'ollama', 'serve.pid'), 'utf8')).trim())
  assert.ok(Number.isInteger(pid) && pid > 0, 'a real pid was recorded')
  assert.notEqual(pid, control.pid, 'the pid file names the app spawn, not the person process')

  const stopped = await manager.ollamaStop()
  assert.equal(stopped.ok, true)
  await new Promise(resolve => setTimeout(resolve, 300))

  let appStartedAlive = true
  try { process.kill(pid, 0) } catch { appStartedAlive = false }
  assert.equal(appStartedAlive, false, 'the process the app started is gone')

  let controlAlive = true
  try { process.kill(control.pid!, 0) } catch { controlAlive = false }
  assert.equal(controlAlive, true, 'the unrelated process the app did NOT start keeps running')

  assert.equal(existsSync(join(root, 'ollama', 'serve.pid')), false, 'the pid file is cleared')
})

/**
 * The same law at the IPC seam the window actually calls:
 * `engine:download:serve-stop` refuses when there is no pid file (the app
 * never started anything, so it stops nothing) and never guesses a pid.
 */
test('serve-stop without an app-written pid file refuses instead of killing by guess', async () => {
  const root = mkdtempSync(join(tmpdir(), 'serve-nopid-'))
  const manager = createDownloadManager({ root, probe: async () => false })
  const stopped = await manager.ollamaStop()
  assert.equal(stopped.ok, false)
  assert.match(stopped.answer, /has not started the runtime/)
  // And a garbage pid file is refused too — no guessed kill.
  mkdirSync(join(root, 'ollama'), { recursive: true })
  writeFileSync(join(root, 'ollama', 'serve.pid'), 'not-a-pid', 'utf8')
  const again = await manager.ollamaStop()
  assert.equal(again.ok, false)
  assert.match(again.answer, /not usable/)
  assert.ok(existsSync(join(root, 'ollama', 'serve.pid')), 'a bad pid file is not silently deleted')
})
