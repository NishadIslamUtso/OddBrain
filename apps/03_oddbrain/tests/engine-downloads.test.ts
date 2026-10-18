// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ENGINE_DOWNLOADS,
  MAX_DOWNLOAD_BYTES,
  isOfficialDownloadHost,
  isOfficialUrl,
  parseShaLine,
} from '../src/shared/lib/engineDownloads'
import { createDownloadManager, unzipArchive } from '../src/main/engine/downloads'
import { createZip } from '../src/shared/lib/zip'

/**
 * Bringing a brain home: official endpoints only, app-owned folders, capped
 * and verified, the installer a separate permission, and agy honestly a page
 * until Google publishes something verifiable. Every rule here was a way a
 * downloader could lie; each is now a test.
 */

test('the endpoint table is official, exact and https', () => {
  const claude = ENGINE_DOWNLOADS['claude-code']
  const ollama = ENGINE_DOWNLOADS.ollama
  const agy = ENGINE_DOWNLOADS.agy
  assert.equal(claude?.windows, 'https://claude.ai/install.ps1', 'Anthropic\u2019s own native installer')
  assert.equal(ollama?.windows, 'https://ollama.com/download/ollama-windows-amd64.zip', 'the headless runtime zip, no desktop app')
  assert.equal(agy?.kind, 'page', 'no invented URL for agy')
  assert.equal(agy?.page, 'https://antigravity.google')
  for (const info of [claude, ollama]) {
    assert.ok(info && isOfficialUrl(info === claude ? 'claude-code' : 'ollama', info.windows), 'each endpoint passes its own gate')
  }
})

test('the URL gate refuses everything but the exact official address', () => {
  assert.equal(isOfficialUrl('claude-code', 'http://claude.ai/install.ps1'), false, 'no plain http')
  assert.equal(isOfficialUrl('claude-code', 'https://mirror.example/claude/install.ps1'), false, 'no mirrors')
  assert.equal(isOfficialUrl('claude-code', 'https://claude.ai/install.sh'), false, 'the wrong platform file is not the Windows one')
  assert.equal(isOfficialUrl('ollama', 'https://ollama.com/download/ollama-windows-amd64.exe'), false, 'not the desktop installer either')
  assert.equal(isOfficialUrl('agy', 'https://antigravity.google/anything'), false, 'agy has no downloader to abuse')
  assert.equal(isOfficialUrl('nonsense', 'https://claude.ai/install.ps1'), false)
})

test('a download stages into the app\u2019s own folder with a full record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl-'))
  const ticks: Array<{ phase: string; got: number }> = []
  const manager = createDownloadManager({
    root,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'content-length' ? '11' : null) },
      arrayBuffer: async () => new TextEncoder().encode('hello brain').buffer,
    }),
    onTick: (tick) => ticks.push({ phase: tick.phase, got: tick.got }),
  })
  const answer = await manager.start('claude-code')
  assert.equal(answer.ok, true, answer.answer)
  const staged = await readFile(join(root, 'claude-code', 'install.ps1'), 'utf8')
  assert.equal(staged, 'hello brain')
  const record = JSON.parse(await readFile(join(root, 'claude-code', 'install-record.json'), 'utf8'))
  assert.equal(record.endpoint, 'https://claude.ai/install.ps1')
  assert.match(record.sha256, /^[a-f0-9]{64}$/, 'the digest is recorded, not guessed')
  assert.ok(ticks.some(t => t.phase === 'staged'), 'the card hears the stages')
  const status = await manager.status()
  assert.equal(status['claude-code']?.engine, 'claude-code')
  await rm(root, { recursive: true, force: true })
})

test('refusals: a dying endpoint, an oversized offer, an empty reply', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl2-'))
  const dead = createDownloadManager({ root, fetchImpl: async () => { throw new Error('no route') } })
  const deadAnswer = await dead.start('claude-code')
  assert.equal(deadAnswer.ok, false)
  assert.match(deadAnswer.answer, /Could not reach claude\.ai/)
  const big = createDownloadManager({
    root,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: (name) => (name === 'content-length' ? String(MAX_DOWNLOAD_BYTES + 1) : null) },
    }),
  })
  const bigAnswer = await big.start('claude-code')
  assert.match(bigAnswer.answer, /cap/)
  const empty = createDownloadManager({
    root,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => '0' },
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  })
  const emptyAnswer = await empty.start('claude-code')
  assert.match(emptyAnswer.answer, /sent nothing/)
  const error = await createDownloadManager({ root, fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null } }) }).start('claude-code')
  assert.match(error.answer, /answered 404/)
  const agy = await createDownloadManager({ root }).start('agy')
  assert.match(agy.answer, /antigravity\.google/, 'agy refuses with the official page, never an invented URL')
  await rm(root, { recursive: true, force: true })
})

test('a zip unpacks into the app\u2019s engines folder, round-trip through the export zip', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl3-'))
  const archive = createZip([
    { name: 'ollama.exe', content: new TextEncoder().encode('MZ fake binary') },
    { name: 'lib/extra.dll', content: new TextEncoder().encode('dll bytes') },
  ])
  const manager = createDownloadManager({
    root,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => String(archive.length) },
      arrayBuffer: async () => archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.length),
    }),
  })
  const answer = await manager.start('ollama')
  assert.equal(answer.ok, true, answer.answer)
  assert.match(answer.answer, /unpacked/)
  const unpacked = await readFile(join(root, 'ollama', 'app', 'ollama.exe'), 'utf8')
  assert.equal(unpacked, 'MZ fake binary')
  assert.equal(manager.ollamaBinary()?.includes(join('ollama', 'app')), true, 'the runtime is found for headless serve')
  await rm(root, { recursive: true, force: true })
})

test('a poisoned archive path is refused, never written', async () => {
  const bytes = new Uint8Array(128)
  const view = new DataView(bytes.buffer)
  // A central-directory entry whose name tries to escape.
  const name = new TextEncoder().encode('../escape.dll')
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(10, 0, true) // stored
  view.setUint32(20, 0, true) // compressed size
  view.setUint16(28, name.length, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint32(42, 0, true)
  bytes.set(name, 46)
  const end = 46 + name.length
  view.setUint32(end, 0x06054b50, true)
  view.setUint16(end + 10, 1, true)
  view.setUint32(end + 16, 0, true)
  const target = await mkdtemp(join(tmpdir(), 'slip-'))
  const refused = await unzipArchive(bytes, target)
  assert.equal(refused.ok, false)
  assert.match(refused.answer, /unsafe path/)
  await rm(target, { recursive: true, force: true })
})

test('the staged ollama runtime: started by the app, pid recorded, stopped for real', async () => {
  if (process.platform === 'win32') {
    // Windows cannot exec an extensionless shebang script, so this real
    // process lifecycle is pinned on POSIX; the Windows stop path (taskkill
    // tree-kill) is pinned separately in the stopArguments tests.
    return
  }
  const { mkdtempSync, writeFileSync, mkdirSync, chmodSync, existsSync } = await import('node:fs')
  const { readFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = mkdtempSync(join(tmpdir(), 'serve-'))
  const appDir = join(root, 'ollama', 'app')
  mkdirSync(appDir, { recursive: true })
  // a stand-in runtime: a long-lived process for the app to own
  const binary = join(appDir, 'ollama')
  writeFileSync(binary, '#!/usr/bin/env node\nsetInterval(() => {}, 1000)\n', 'utf8')
  chmodSync(binary, 0o755)
  // the door never answers in this sandbox: the app starts the process anyway
  // and says honestly that the door is quiet yet
  const manager = createDownloadManager({ root, probe: async () => false })
  const started = await manager.ollamaStart()
  assert.equal(started.ok, true)
  assert.match(started.answer, /not answering yet/)
  const pid = Number((await readFile(join(root, 'ollama', 'serve.pid'), 'utf8')).trim())
  assert.ok(Number.isInteger(pid) && pid > 0, 'a real pid was recorded')
  const stopped = await manager.ollamaStop()
  assert.equal(stopped.ok, true)
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal(existsSync(join(root, 'ollama', 'serve.pid')), false)
  let alive = true
  try { process.kill(pid, 0) } catch { alive = false }
  assert.equal(alive, false, 'the process the app started is gone')
})

test('a runtime already answering is never started twice', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = mkdtempSync(join(tmpdir(), 'serve2-'))
  const appDir = join(root, 'ollama', 'app')
  mkdirSync(appDir, { recursive: true })
  const binary = join(appDir, 'ollama')
  writeFileSync(binary, '#!/usr/bin/env node\nsetInterval(() => {}, 1000)\n', 'utf8')
  chmodSync(binary, 0o755)
  const manager = createDownloadManager({ root, probe: async () => true })
  const answer = await manager.ollamaStart()
  assert.match(answer.answer, /already answering/)
  assert.equal(existsSync(join(root, 'ollama', 'serve.pid')), false, 'no process was started')
})

test('the staged installer runs only on Windows, and the command is shown in full', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl4-'))
  const manager = createDownloadManager({
    root,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => '4' },
      arrayBuffer: async () => new TextEncoder().encode('test').buffer,
    }),
  })
  const early = manager.runInstaller('claude-code')
  assert.equal(early.ok, false, 'nothing staged, nothing runs')
  await manager.start('claude-code')
  const here = manager.runInstaller('claude-code', 'linux')
  assert.equal(here.ok, false)
  assert.match(here.answer, /Windows/)
  const win = manager.runInstaller('claude-code', 'win32')
  assert.equal(win.ok, true)
  assert.deepEqual(win.command, ['powershell', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'claude-code', 'install.ps1')])
  const other = manager.runInstaller('ollama', 'win32')
  assert.equal(other.ok, false, 'a zip has no installer to run')
  await rm(root, { recursive: true, force: true })
})

test('a redirect may not outrank the endpoint pin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl6-'))
  const manager = createDownloadManager({
    root,
    fetchImpl: async () => ({
      ok: false,
      status: 302,
      headers: { get: (name) => (name === 'location' ? 'https://mirror.example/steal.ps1' : null) },
    }),
    onTick: () => undefined,
  })
  const answer = await manager.start('claude-code')
  assert.equal(answer.ok, false, answer.answer)
  assert.match(answer.answer, /redirect/)
  assert.equal(existsSync(join(root, 'claude-code')), false, 'nothing staged from a hijacked hop')
  await rm(root, { recursive: true, force: true })
})

test('the publisher\u2019s own redirect is followed — the pin follows the publisher', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl7-'))
  const hops: string[] = []
  const manager = createDownloadManager({
    root,
    fetchImpl: async (url) => {
      hops.push(url)
      if (url === 'https://claude.ai/install.ps1') {
        // The REAL chain, verified live 2026-10-17: claude.ai hands the
        // script to its own download host.
        return { ok: false, status: 302, headers: { get: (name) => (name === 'location' ? 'https://downloads.claude.ai/claude-code-releases/bootstrap.ps1' : null) } }
      }
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name === 'content-length' ? '11' : null) },
        arrayBuffer: async () => new TextEncoder().encode('hello brain').buffer,
      }
    },
    onTick: () => undefined,
  })
  const answer = await manager.start('claude-code')
  assert.equal(answer.ok, true, answer.answer)
  assert.deepEqual(hops, ['https://claude.ai/install.ps1', 'https://downloads.claude.ai/claude-code-releases/bootstrap.ps1'])
  await rm(root, { recursive: true, force: true })
})

test('an allowed hop that then points somewhere strange is still refused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl9-'))
  let hop = 0
  const manager = createDownloadManager({
    root,
    fetchImpl: async () => {
      hop += 1
      if (hop === 1) return { ok: false, status: 302, headers: { get: (name) => (name === 'location' ? 'https://downloads.claude.ai/one' : null) } }
      return { ok: false, status: 302, headers: { get: (name) => (name === 'location' ? 'https://mirror.example/two' : null) } }
    },
    onTick: () => undefined,
  })
  const answer = await manager.start('claude-code')
  assert.equal(answer.ok, false)
  assert.match(answer.answer, /redirect/)
  await rm(root, { recursive: true, force: true })
})

test('the host rule: publisher hosts pass, user-info tricks and strangers do not', () => {
  assert.equal(isOfficialDownloadHost('claude-code', 'https://downloads.claude.ai/claude-code-releases/bootstrap.ps1'), true)
  assert.equal(isOfficialDownloadHost('claude-code', 'https://claude.ai/install.ps1'), true)
  assert.equal(isOfficialDownloadHost('ollama', 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip'), true)
  assert.equal(isOfficialDownloadHost('ollama', 'https://objects.githubusercontent.com/x'), true)
  assert.equal(isOfficialDownloadHost('claude-code', 'https://mirror.example/steal.ps1'), false)
  assert.equal(isOfficialDownloadHost('claude-code', 'https://downloads.claude.ai@evil.example/x'), false, 'user-info never passes')
  assert.equal(isOfficialDownloadHost('claude-code', 'http://downloads.claude.ai/x'), false, 'no plain http')
  assert.equal(isOfficialDownloadHost('nonsense', 'https://claude.ai/x'), false)
})

test('the run button\u2019s door: the staged installer executes only when told, and says so', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl8-'))
  const spawned: Array<{ command: string; args: string[] }> = []
  const manager = createDownloadManager({
    root,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'content-length' ? '11' : null) },
      arrayBuffer: async () => new TextEncoder().encode('hello brain').buffer,
    }),
    spawnImpl: ((command: string, args: string[]) => {
      spawned.push({ command, args })
      return { pid: 4321 }
    }) as never,
    onTick: () => undefined,
  })
  const early = await manager.executeInstaller('claude-code', 'win32')
  assert.equal(early.ok, false, 'nothing staged, nothing runs')
  await manager.start('claude-code')
  const posix = await manager.executeInstaller('claude-code', 'linux')
  assert.equal(posix.ok, false)
  assert.match(posix.answer, /Windows/)
  const win = await manager.executeInstaller('claude-code', 'win32')
  assert.equal(win.ok, true, win.answer)
  assert.deepEqual(spawned[0]?.command, 'powershell')
  assert.deepEqual(spawned[0]?.args, ['-ExecutionPolicy', 'Bypass', '-File', join(root, 'claude-code', 'install.ps1')])
  await rm(root, { recursive: true, force: true })
})

test('checksum lines and the size cap are pure', () => {
  assert.equal(parseShaLine('abc12345  file.zip'), '')
  assert.equal(
    parseShaLine('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  ollama.zip'),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
  assert.ok(MAX_DOWNLOAD_BYTES === 2_500 * 1024 * 1024, 'the cap admits Ollama\u2019s real installer')
})

test('removal forgets the engine and its record together', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl5-'))
  const manager = createDownloadManager({
    root,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => '4' },
      arrayBuffer: async () => new TextEncoder().encode('test').buffer,
    }),
  })
  await manager.start('claude-code')
  const gone = await manager.remove('claude-code')
  assert.equal(gone.ok, true)
  const status = await manager.status()
  assert.equal(status['claude-code'], undefined, 'the record left with the folder')
  await rm(root, { recursive: true, force: true })
})
