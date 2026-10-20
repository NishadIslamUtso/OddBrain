// @vitest-environment jsdom
import { createReviewedCheckpoints } from '../src/main/engine/checkpoints'
import test from 'node:test'
import { engineStore, resetEngineForTests } from '../src/renderer/src/state/engine'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  engineImages,
  engineSourceFiles,
  framePoints,
  MAX_ENGINE_ATTACHMENTS,
  MAX_ENGINE_IMAGE_BYTES,
  MAX_ENGINE_IMAGE_CHARS,
  ENGINE_IMAGE_MIMES,
} from '../src/shared/lib/media'
import {
  checkpointWorthTaking,
  copyName,
  snapshotFile,
  restoreCheckpoint,
  listCheckpoints,
  takeCheckpoint,
} from '../src/main/engine/checkpoints'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'

/**
 * Media and checkpoints: what the machine gives everyone, and the way back.
 * The media rule is his: pictures, voice and video work no matter the engine.
 * The checkpoint rule is Replit's and Claude Code's idea, app-side: the file's
 * old self is kept the instant before an allowed write, and one press returns.
 */

test('frame points are even, inside the clip, never at the edges', () => {
  assert.deepEqual(framePoints(0, 4), [])
  assert.deepEqual(framePoints(-3, 4), [])
  assert.deepEqual(framePoints(10, 1), [5])
  const four = framePoints(10, 4)
  assert.equal(four.length, 4)
  assert.ok(four[0] > 0.7 && four[0] < 0.9, 'first frame just inside the clip')
  assert.ok(four[3] > 9.1 && four[3] < 9.3, 'last frame just before the end')
  for (let i = 1; i < four.length; i += 1) assert.ok(four[i] > four[i - 1], 'strictly increasing')
  const ten = framePoints(100, 10)
  assert.equal(ten.length, 10)
})

test('the media boundary limits what can ride with one engine task without truncation', () => {
  assert.ok(MAX_ENGINE_ATTACHMENTS === 4, 'four attachments ride with one task')
  assert.deepEqual([...ENGINE_IMAGE_MIMES], ['image/png', 'image/jpeg', 'image/webp'])
  assert.equal(MAX_ENGINE_IMAGE_CHARS, Math.ceil(MAX_ENGINE_IMAGE_BYTES / 3) * 4)
  const tiny = { mime: 'image/png', data: Buffer.from('tiny').toString('base64') }
  assert.deepEqual(engineImages([tiny]), { ok: true, images: [tiny] })
  assert.match((engineImages(Array(5).fill(tiny)) as { ok: false; answer: string }).answer, /Nothing was silently dropped/)
  assert.match((engineImages([{ ...tiny, data: 'not base64!' }]) as { ok: false; answer: string }).answer, /invalid/)
  const over = Buffer.alloc(MAX_ENGINE_IMAGE_BYTES + 1).toString('base64')
  assert.match((engineImages([{ ...tiny, data: over }]) as { ok: false; answer: string }).answer, /larger than 2 MB/)
  assert.equal(engineImages('not a list').ok, false)
})

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

test('the native boundary accepts exact bounded source bytes and refuses omission-prone batches', () => {
  const file = { id: 'source-1', name: 'notes.bin', mime: 'application/octet-stream', data: new Uint8Array([0, 255, 10]) }
  const answer = engineSourceFiles([file]); assert.equal(answer.ok, true)
  if (answer.ok) { assert.deepEqual(answer.files[0].data, file.data); assert.notEqual(answer.files[0].data, file.data) }
  assert.equal(engineSourceFiles([{ ...file, data: new Uint8Array() }]).ok, false)
  assert.equal(engineSourceFiles([{ ...file, name: '../bad\u0000' }]).ok, false)
  assert.equal(engineSourceFiles(Array.from({ length: 9 }, (_, index) => ({ ...file, id: `source-${index}` }))).ok, false)
})

test('the composer carries the media front door, the ear, and honest titles', () => {
  const composer = read('../src/renderer/src/components/Composer.tsx')
    })

async function reviewedRestore(dir: string, copy: string, original: string) {
  const review = createReviewedCheckpoints(dir), preview = await review.preview(copy, original)
  return review.decide(preview.token, 'allow')
}

test('checkpoint rules: file tools only, honest names', () => {
  assert.equal(checkpointWorthTaking('Write'), true)
  assert.equal(checkpointWorthTaking('Edit'), true)
  assert.equal(checkpointWorthTaking('Bash'), false, 'a command can touch anything; no pretending')
  assert.equal(checkpointWorthTaking('WebFetch'), false)
  const name = copyName(join('C:', 'my notes', 'thesis a.md'), 1729075200000)
  assert.match(name, /^1729075200000-[0-9a-f]{8}-thesis_a\.md$/, 'epoch, a path hash, then a safe name')
})

test('a checkpoint keeps the old self; restore puts it back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ckpt-'))
  const file = join(dir, 'note.md')
  await writeFile(file, 'the first words')
  const kept = await takeCheckpoint(dir, file, 1729075200000)
  assert.ok(kept, 'a file with content is kept')
  await writeFile(file, 'the engine rewrote everything')
  const restored = await reviewedRestore(dir, kept?.copy ?? '', file)
  assert.equal(restored.ok, true, restored.answer)
  assert.equal(await readFile(file, 'utf8'), 'the first words', 'the old self came back')
  const listed = await listCheckpoints(dir)
  assert.equal(listed.length, 1, 'original snapshots remain available; approval tokens are one-use')
  await rm(dir, { recursive: true, force: true })
})

test('a file that does not exist yet is kept as a ghost; restoring removes it; a foreign copy is refused', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ckpt2-'))
  const ghost = join(dir, 'was-never-here.md')
  // A file the engine never had is kept as an honest ghost: no copy, existed:false.
  // Restoring it later removes the file instead of pretending an old self exists.
  const snap = await takeCheckpoint(dir, ghost, Date.now())
  assert.ok(snap, 'ghost recorded, not claimed as a kept copy')
  assert.equal(snap.existed, false)
  assert.equal(snap.copy, '')
  await writeFile(ghost, 'born later', 'utf8')
  const unmade = await reviewedRestore(dir, '', ghost)
  assert.equal(unmade.ok, true, unmade.answer)
  assert.match(unmade.answer, /removed; previous bytes retained/)
  await assert.rejects(() => stat(ghost), 'ghost restore removes the file')
  const kept = await takeCheckpoint(dir, join(dir, 'real.md'), Date.now())
  assert.equal(kept?.existed, false, 'a second never-existed path is a ghost too, not a kept copy')
  const foreign = await restoreCheckpoint(dir, join(tmpdir(), 'elsewhere-copy.md'))
  assert.equal(foreign.ok, false)
  assert.match(foreign.answer, /requires an exact diff review/)
  const empty = await mkdtemp(join(tmpdir(), 'ckpt3-'))
  const noRecord = await restoreCheckpoint(empty, join(empty, 'orphan-copy.md'))
  assert.equal(noRecord.ok, false)
  assert.match(noRecord.answer, /requires an exact diff review/)
  await rm(dir, { recursive: true, force: true })
  await rm(empty, { recursive: true, force: true })
})

test('the Allow answer leaves only AFTER the checkpoint finished (no race)', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { EventEmitter } = await import('node:events')
  const { startClaudeCodeSession } = await import('../src/main/engine/claudeCode')
  const dir = mkdtempSync(join(tmpdir(), 'ckpt-race-'))
  const target = join(dir, 'notes.md')
  writeFileSync(target, 'the old self', 'utf8')
  const sent: string[] = []
  const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess & {
    stdout: EventEmitter; stderr: EventEmitter; stdin: { write(data: string): boolean }
    pid: number; killed: boolean; exitCode: number | null; signalCode: null
  }
  ;(child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter()
  ;(child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter()
  ;(child as unknown as { stdin: unknown }).stdin = {
    write: (line: string) => { sent.push(line); return true },
  }
  ;(child as unknown as { pid: number }).pid = 4242
  ;(child as unknown as { killed: boolean }).killed = false
  ;(child as unknown as { signalCode: null }).signalCode = null
  ;(child as unknown as { exitCode: number | null }).exitCode = null
  const session = startClaudeCodeSession({
    cwd: dir,
    settings: { ...DEFAULT_ENGINE, workspace: dir, approval: 'ask' },
    checkpointDir: join(dir, 'checkpoints'),
    onEvent: () => undefined,
    spawnProcess: (() => child) as unknown as typeof spawn,
  })
  assert.equal(session.send('Update notes'), true)
  // the engine asks to Write; the owner allows
  ;(child as unknown as { stdout: EventEmitter }).stdout.emit('data', Buffer.from(
    JSON.stringify({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: target } } }) + '\n',
  ))
  session.answer('r1', true)
  await new Promise(resolve => setTimeout(resolve, 60))
  // the control_response must be the LAST thing on the wire, and the kept
  // copy must already be on disk when it left
  const responseLine = sent.find(line => line.includes('control_response'))
  assert.ok(responseLine, 'the allow was answered on the wire')
  assert.ok(existsSync(join(dir, 'checkpoints')), 'the checkpoint folder exists')
  assert.match(readFileSync(join(dir, 'checkpoints', 'index.json'), 'utf8'), /notes\.md/)
  assert.equal(sent.indexOf(responseLine), sent.length - 1)
})

test('a ghost checkpoint is listed and its restore is the undo of a creation', async () => {
  const { mkdtempSync, writeFileSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'ckpt-ghost-'))
  const target = join(dir, 'fresh.md')
  await takeCheckpoint(dir, target) // nothing there yet: a ghost
  const listed = await listCheckpoints(dir)
  assert.ok(listed.some(record => record.original === target && record.existed === false), 'the ghost is listed')
  writeFileSync(target, 'the engine made this', 'utf8')
  const ghost = listed.find(record => record.original === target)!
  const answer = await reviewedRestore(dir, ghost.copy, target) // copy === ''
  assert.equal(answer.ok, true)
  assert.equal(existsSync(target), false)
})

test('two files with the same basename never collide in the checkpoint folder', () => {
  const epoch = 1700000000000
  const a = copyName('/vault/alpha/notes.md', epoch)
  const b = copyName('/vault/beta/notes.md', epoch)
  assert.notEqual(a, b)
})

test('the engine takes the checkpoint the instant an Allow would change a file', async () => {
  // The real adapter, a scripted child: the permission line names the file,
  // the Allow answers, and the old self must already be in the folder.
  const { startClaudeCodeSession } = await import('../src/main/engine/claudeCode')
  const { EventEmitter } = await import('node:events')
  const dir = await mkdtemp(join(tmpdir(), 'ckpt-live-'))
  const workspace = await mkdtemp(join(tmpdir(), 'ckpt-ws-'))
  const target = join(workspace, 'draft.md')
  await writeFile(target, 'before the engine')
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    stdin: { writes: string[]; write(data: string): boolean }
    pid: number
    killed: boolean
    exitCode: number | null
    signalCode: null
    kill(): void
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { writes: [], write(data: string) { child.stdin.writes.push(data); return true } }
  child.pid = 4242
  child.killed = false
  child.exitCode = null
  child.signalCode = null
  child.kill = () => { child.killed = true }
  // Deterministic waits, not fixed sleeps: on a loaded CI machine the
  // checkpoint's async keep can outrun a 10/20 ms nap, and the test then read
  // undefined (the flake that hit windows three times). Wait for the real
  // things: the permission event, then the answer line.
  const events: Array<{ kind: string; requestId?: string }> = []
  const session = startClaudeCodeSession({
    cwd: workspace,
    settings: { id: 'claude-code', model: 'm', baseUrl: '', workspace, approval: 'ask' },
    checkpointDir: dir,
    spawnProcess: (() => child) as never,
    onEvent: (event) => events.push(event as { kind: string; requestId?: string }),
  })
  const waitFor = async (predicate: () => boolean, what: string): Promise<void> => {
    let waited = 0
    while (!predicate() && waited < 10_000) {
      await new Promise((r) => setTimeout(r, 5))
      waited += 5
    }
    assert.ok(predicate(), `the engine never ${what}`)
  }
  assert.equal(session.send('Update the draft'), true)
  child.stdout.emit('data', Buffer.from(JSON.stringify({
    type: 'control_request',
    request_id: 'w-1',
    request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: target, content: 'x' } },
  }) + '\n'))
  await waitFor(() => events.some((event) => event.kind === 'permission' && event.requestId === 'w-1'), 'report the permission')
  session.answer('w-1', true)
  await waitFor(() => child.stdin.writes.some((line) => line.includes('control_response')), 'answer the engine')
  const reply = JSON.parse(child.stdin.writes.find(line => line.includes('control_response')) ?? '{}')
  assert.equal(reply.response.response.behavior, 'allow', 'the engine still got its answer')
  const kept = await listCheckpoints(dir)
  assert.equal(kept.length, 1, 'the old self was kept BEFORE the answer went out')
  assert.equal(kept[0].original, target)
  const before = await readFile(kept[0].copy, 'utf8')
  assert.equal(before, 'before the engine')
  child.kill()
  await rm(dir, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
})

test('plan mode rides the engine\u2019s own flag, and the throttle lists it', async () => {
  const { engineArguments } = await import('../src/main/engine/claudeCode')
  assert.deepEqual(
    engineArguments('m', 'plan').join(' ').includes('--permission-mode plan'),
    true,
    'plan first is the CLI\\u2019s own plan mode, not a prompt',
  )
})

test('the repetition inspector: the third identical step cries once, then stays quiet', async () => {
  type FakeApi = { listener: null | ((event: { kind: string; text?: string; name?: string; summary?: string }) => void) }
  const fake: FakeApi = { listener: null }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'm', baseUrl: '', workspace: '', approval: 'ask' },
      running: true,
      history: [],
    }),
    send: async () => ({ ok: true, answer: 'started' }),
    onEvent: (listener: FakeApi['listener']) => { fake.listener = listener; return () => undefined },
    onPullEvent: () => () => undefined,
  }
  resetEngineForTests()
  const store = engineStore()
  await store.send('loop the same step')
  const same = { kind: 'tool' as const, name: 'Bash', summary: 'npm test' }
  fake.listener?.(same)
  fake.listener?.({ ...same })
  const turn = store.turn
  assert.ok(turn)
  assert.equal(turn.items.filter(item => item.kind === 'status').length, 0, 'two repeats stay quiet')
  fake.listener?.({ ...same })
  const cries = turn.items.filter(item => item.kind === 'status' && item.text.includes('three times'))
  assert.equal(cries.length, 1, 'one honest cry at the third')
  fake.listener?.({ ...same })
  assert.equal(turn.items.filter(item => item.kind === 'status' && item.text.includes('three times')).length, 1, 'never spammed')
  fake.listener?.({ kind: 'tool', name: 'Bash', summary: 'npm build' })
  fake.listener?.({ ...same })
  fake.listener?.({ ...same })
  fake.listener?.({ ...same })
  const criesAfter = turn.items.filter(item => item.kind === 'status' && item.text.includes('three times'))
  assert.equal(criesAfter.length, 2, 'a NEW loop, after a different step, may say it again')
  fake.listener?.({ kind: 'done', text: 'ok' })
})

test('two created files are undone one at a time, each by its own name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ckpt-multi-'))
  const first = join(dir, 'alpha.md')
  const second = join(dir, 'beta.md')
  await takeCheckpoint(dir, first, Date.now())
  await takeCheckpoint(dir, second, Date.now() + 1)
  await writeFile(first, 'created')
  await writeFile(second, 'created')
  // Undo the SECOND ghost by name: the first file must survive untouched.
  const unmade = await reviewedRestore(dir, '', second)
  assert.equal(unmade.ok, true, unmade.answer)
  assert.ok(unmade.recoveryPath); assert.equal(await readFile(unmade.recoveryPath!, 'utf8'), 'created')
  await assert.rejects(() => stat(second), 'the named file is gone')
  assert.equal(await readFile(first, 'utf8'), 'created', 'the other creation is untouched')
  const listed = await listCheckpoints(dir)
  assert.equal(listed.length, 2, 'both original checkpoint records are retained')
  assert.ok(listed.some(entry => entry.original === first))
  await rm(dir, { recursive: true, force: true })
})

test('a file that cannot be READ fails the checkpoint — it is not "not there"', async () => {
  if (process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0)) {
    return // chmod does not bind on Windows, and root reads everything
  }
  const { chmod } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'ckpt-denied-'))
  const sealed = join(dir, 'sealed.md')
  await writeFile(sealed, 'secret')
  await chmod(sealed, 0o000)
  try {
    await assert.rejects(() => takeCheckpoint(dir, sealed), 'EACCES is not a ghost; it is a failure')
  } finally {
    await chmod(sealed, 0o644)
    await rm(dir, { recursive: true, force: true })
  }
})

test('a checkpoint that cannot be saved DENIES the change — the guarantee fails closed', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { EventEmitter } = await import('node:events')
  const { startClaudeCodeSession } = await import('../src/main/engine/claudeCode')
  const dir = mkdtempSync(join(tmpdir(), 'ckpt-shut-'))
  const target = join(dir, 'notes.md')
  writeFileSync(target, 'the old self', 'utf8')
  const sent: string[] = []
  const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess & {
    stdout: EventEmitter; stderr: EventEmitter; stdin: { write(data: string): boolean }
    pid: number; killed: boolean; exitCode: number | null; signalCode: null
  }
  ;(child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter()
  ;(child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter()
  ;(child as unknown as { stdin: unknown }).stdin = {
    write: (line: string) => { sent.push(line); return true },
  }
  ;(child as unknown as { pid: number }).pid = 4243
  ;(child as unknown as { killed: boolean }).killed = false
  ;(child as unknown as { signalCode: null }).signalCode = null
  ;(child as unknown as { exitCode: number | null }).exitCode = null
  // The checkpoint folder's path is a FILE: every save inside it must fail.
  writeFileSync(join(dir, 'checkpoints'), 'not a folder')
  const session = startClaudeCodeSession({
    cwd: dir,
    settings: { ...DEFAULT_ENGINE, workspace: dir, approval: 'ask' },
    checkpointDir: join(dir, 'checkpoints'),
    onEvent: () => undefined,
    spawnProcess: (() => child) as unknown as typeof spawn,
  })
  assert.equal(session.send('Update notes'), true)
  ;(child as unknown as { stdout: EventEmitter }).stdout.emit('data', Buffer.from(
    JSON.stringify({ type: 'control_request', request_id: 'r9', request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: target } } }) + '\n',
  ))
  session.answer('r9', true)
  await new Promise(resolve => setTimeout(resolve, 80))
  const responseLine = sent.find(line => line.includes('control_response'))
  assert.ok(responseLine, 'the engine still got an answer — silence would wedge the CLI')
  assert.match(responseLine ?? '', /"behavior":"deny"/, 'the answer is a DENY, not a swallowed allow')
  assert.match(responseLine ?? '', /could not keep the file/, 'the deny says why')
  await rm(dir, { recursive: true, force: true })
})

test('thirty concurrent checkpoints leave thirty records, not one', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { rememberCheckpoint, listCheckpoints } = await import('../src/main/engine/checkpoints')
  const dir = await mkdtemp(join(tmpdir(), 'ckpt-race-'))
  // All at once, exactly how concurrent permission approvals arrive.
  await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      rememberCheckpoint(dir, { copy: '', original: `src/file-${i}.ts`, at: new Date(2026, 9, 17, i).toISOString(), existed: false }),
    ),
  )
  const listed = await listCheckpoints(dir, 50)
  assert.equal(listed.length, 30, 'every concurrent record survives; the last write erased none')
  await rm(dir, { recursive: true, force: true })
})
