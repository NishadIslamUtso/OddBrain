import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDownloadManager } from '../src/main/engine/downloads'

/**
 * The owner installed the Ollama DESKTOP app — which quits fully and does
 * NOT keep `ollama serve` resident. The app must therefore (1) FIND his
 * installed copy (Programs/Ollama, PATH) and (2) START it itself, with an
 * honest answer about which copy was started. These pins prove both, plus
 * the boot auto-start wiring.
 */

const fakeSpawnCapturing = () => {
  const calls: Array<{ binary: string; args: string[]; opts: Record<string, unknown> }> = []
  const spawn = ((binary: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ binary, args, opts })
    return { pid: 4242, unref: () => {}, exitCode: null }
  }) as never
  return { spawn, calls }
}

test('the owner\u2019s installed Ollama (Programs/Ollama) is found without any staging', () => {
  const root = mkdtempSync(join(tmpdir(), 'ollama-found-'))
  const local = mkdtempSync(join(tmpdir(), 'local-'))
  try {
    mkdirSync(join(local, 'Programs', 'Ollama'), { recursive: true })
    writeFileSync(join(local, 'Programs', 'Ollama', 'ollama.exe'), 'binary')
    const realEnv = process.env
    process.env = { ...realEnv, LOCALAPPDATA: local, PATH: '' }
    try {
      const manager = createDownloadManager({ root, probe: async () => true })
      assert.equal(manager.ollamaBinary(), join(local, 'Programs', 'Ollama', 'ollama.exe'))
    } finally {
      process.env = realEnv
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(local, { recursive: true, force: true })
  }
})

test('ollamaStart starts the INSTALLED copy (serve) and says so honestly', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ollama-start-'))
  const local = mkdtempSync(join(tmpdir(), 'local2-'))
  try {
    mkdirSync(join(local, 'Programs', 'Ollama'), { recursive: true })
    const installed = join(local, 'Programs', 'Ollama', 'ollama.exe')
    writeFileSync(installed, 'binary')
    const realEnv = process.env
    process.env = { ...realEnv, LOCALAPPDATA: local, PATH: '' }
    let knocks = 0
    const { spawn, calls } = fakeSpawnCapturing()
    try {
      const manager = createDownloadManager({ root, probe: async () => ++knocks >= 2, spawnImpl: spawn })
      const answer = await manager.ollamaStart()
      assert.equal(calls.length, 1, JSON.stringify(calls))
      assert.equal(calls[0]!.binary, installed)
      assert.deepEqual(calls[0]!.args, ['serve'])
      assert.match(answer.answer, /your installed Ollama/, answer.answer)
      const pid = (readFileSync(join(root, 'ollama', 'serve.pid'), 'utf8') || '').trim()
      assert.equal(pid, '4242', 'the started pid is recorded so the app can stop only what it started')
    } finally {
      process.env = realEnv
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(local, { recursive: true, force: true })
  }
})

test('no binary anywhere: the answer names the install command instead of blaming', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ollama-none-'))
  const realEnv = process.env
  process.env = { ...realEnv, LOCALAPPDATA: '', PATH: '' }
  try {
    const manager = createDownloadManager({ root, probe: async () => false })
    const answer = await manager.ollamaStart()
    assert.equal(answer.ok, false)
    assert.match(answer.answer, /winget install Ollama\.Ollama/)
  } finally {
    process.env = realEnv
    rmSync(root, { recursive: true, force: true })
  }
})

test('the boot starts the door by itself (the desktop app quits fully)', () => {
  const index = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  assert.match(index, /void downloads\.ollamaStart\(\)/)
})

test('the Connectors card offers Start + Point-to-exe, and the doors exist', () => {
  const section = readFileSync(new URL('../src/renderer/src/components/ConnectorsSection.tsx', import.meta.url), 'utf8')
  assert.match(section, /Start the brain door/)
  assert.match(section, /Point to the exe/)
  const preload = readFileSync(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
  for (const door of ['engine:pick-binary', 'engine:clear-binary', 'engine:binary-override']) {
    assert.ok(preload.includes(`'${door}'`), door)
  }
})
