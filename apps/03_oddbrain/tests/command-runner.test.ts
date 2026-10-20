import { afterEach, expect, test, vi } from 'vitest'
// A cold PowerShell start on a busy Windows runner is seconds, not milliseconds.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCommandRunner, commandEnvironment, commandSpec } from '../src/main/commands/runner'
import { normalizePermissions } from '../src/shared/lib/permissions'
const roots: string[] = []
const dir = () => { const path = mkdtempSync(join(tmpdir(), 'oddbrain-command-')); roots.push(path); return path }
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); vi.restoreAllMocks() })
function fixture(options: Partial<Parameters<typeof createCommandRunner>[0]> = {}) {
  const cwd = dir(), root = join(cwd, 'records'); let authority = 'one', allowed = true, locked = false
  const runner = createCommandRunner({ root, deadlineMs: 60_000, scope: () => ({ cwd, authority, allowed: allowed && !locked, explanation: 'Access is off or busy' }),
    acquire: async (_request, expected, signal) => {
      if (!allowed || locked || expected !== authority) throw Error('Changed authority')
      locked = true
      return { recheck: () => { if (!allowed || authority !== expected || signal.aborted) throw Error('Revoked before spawn') }, release: () => { locked = false } }
    }, ...options })
  return { cwd, root, runner, revoke: () => { authority = 'changed'; allowed = false }, locked: () => locked }
}
const say = (text: string) => process.platform === 'win32' ? `[Console]::Write('${text.replaceAll("'", "''")}')` : `printf '%s' '${text.replaceAll("'", "'\\''")}'`
test('manual command permission is a separate opt-in, including malformed stored values', () => {
  expect(normalizePermissions({}).manualCommands).toBe(false)
  expect(normalizePermissions({ manualCommands: 'true' }).manualCommands).toBe(false)
  expect(normalizePermissions({ manualCommands: true }).manualCommands).toBe(true)
})
test('basic command environment never borrows app/model keys or preload/profile injection variables', () => {
  const env = commandEnvironment({ PATH: '/bin', HOME: '/home/example', ANTHROPIC_API_KEY: 'private', GOOGLE_API_KEY: 'private', NODE_OPTIONS: '--require evil', BASH_ENV: '/evil', LD_PRELOAD: '/evil', SECRET: 'private' })
  expect(env).toEqual({ PATH: '/bin', HOME: '/home/example' })
})
test('Windows launches the explicitly shown script without cmd wrappers or a profile', () => {
  const spec = commandSpec("Write-Output 'বাংলা; & literal'", 'win32', { SystemRoot: 'C:\\Windows', Path: 'C:\\tools', ANTHROPIC_API_KEY: 'private' })
  expect(spec.program).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  expect(spec.arguments).toContain('-NoProfile'); expect(spec.arguments).toContain('-NonInteractive')
  expect(Buffer.from(spec.arguments.at(-1)!, 'base64').toString('utf16le')).toBe(spec.script)
  expect(spec.script).toContain("Write-Output 'বাংলা; & literal'")
  expect(spec.environmentKeys).not.toContain('ANTHROPIC_API_KEY')
})
test('previews and denial do not execute or create command storage', async () => {
  const f = fixture(), preview = await f.runner.preview(1, { command: say('denied'), cwd: f.cwd })
  expect(preview.explanation).toContain('outside the engine')
  expect(existsSync(f.root)).toBe(false)
  expect(await f.runner.decide(1, preview.token, 'deny')).toEqual({ denied: true })
  expect(existsSync(f.root)).toBe(false)
})
test('a real OS command retains stdout, stderr and nonzero exit without an AI interpretation', async () => {
  const f = fixture(), command = process.platform === 'win32' ? "[Console]::WriteLine('hello'); [Console]::Error.WriteLine('warning'); exit 7" : "printf 'hello\\n'; printf 'warning\\n' >&2; exit 7"
  const review = await f.runner.preview(1, { command, cwd: f.cwd }), answer = await f.runner.decide(1, review.token, 'allow')
  if ('denied' in answer) throw Error('unexpected denial')
  expect(answer.exitCode).toBe(7); expect(answer.stdout.replaceAll('\r\n', '\n')).toBe('hello\n'); expect(answer.stderr.replaceAll('\r\n', '\n')).toBe('warning\n')
  expect(answer.outputComplete).toBe(true); expect(f.locked()).toBe(false)
  expect(f.runner.history().records[0].state).toBe('finished')
  expect(f.runner.read(answer.runId!).result.stdout).toBe(answer.stdout)
  expect(Buffer.from(f.runner.output(answer.runId!, 'stdout').base64, 'base64').toString()).toBe(answer.stdout)
  expect(JSON.parse(readFileSync(join(f.root, answer.runId!, 'record.json'), 'utf8')).request.command).toBe(command)
}, 15000)
test('unknown windows, changed authority and replay cannot execute', async () => {
  const f = fixture(), review = await f.runner.preview(1, { command: say('once'), cwd: f.cwd })
  await expect(f.runner.decide(2, review.token, 'allow')).rejects.toThrow(/expired|already used/)
  f.revoke(); await expect(f.runner.decide(1, review.token, 'allow')).rejects.toThrow(/off|busy/)
  await expect(f.runner.decide(1, review.token, 'allow')).rejects.toThrow(/already used/)
  expect(existsSync(f.root)).toBe(false)
})
test('unselected working folders are refused before review', async () => {
  const f = fixture()
  await expect(f.runner.preview(1, { command: say('wrong folder'), cwd: dir() })).rejects.toThrow(/selected working folder/)
})
test('the last authority check can refuse immediately before spawn', async () => {
  const spawnProcess = vi.fn(); let checks = 0
  const f = fixture({ spawnProcess: spawnProcess as never, acquire: async () => ({ recheck: () => { if (++checks === 2) throw Error('Changed at launch') }, release: () => {} }) })
  const review = await f.runner.preview(1, { command: say('not run'), cwd: f.cwd })
  await expect(f.runner.decide(1, review.token, 'allow')).rejects.toThrow('Changed at launch')
  expect(spawnProcess).not.toHaveBeenCalled()
  expect(f.runner.history().records[0].state).toBe('interrupted')
})
test('output overflow requests stop and retains a labelled incomplete prefix', async () => {
  const f = fixture({ maxBytes: 32 }), command = process.platform === 'win32' ? "[Console]::Write(('x' * 10000))" : say('x'.repeat(10000))
  const review = await f.runner.preview(1, { command, cwd: f.cwd }), result = await f.runner.decide(1, review.token, 'allow')
  if ('denied' in result) throw Error('unexpected denial')
  expect(result.outputComplete).toBe(false); expect(result.interrupted).toBe(true); expect(result.note).toContain('output limit')
  expect(Buffer.from(f.runner.output(result.runId!, 'stdout').base64, 'base64')).toHaveLength(32)
}, 15000)
test('deadline stops the owned command without retry', async () => {
  const f = fixture({ deadlineMs: 150 }), review = await f.runner.preview(1, { command: process.platform === 'win32' ? 'Start-Sleep -Seconds 30' : 'sleep 30', cwd: f.cwd })
  const result = await f.runner.decide(1, review.token, 'allow')
  if ('denied' in result) throw Error('unexpected denial')
  expect(result.interrupted).toBe(true); expect(result.note).toContain('time limit'); expect(result.outputComplete).toBe(false)
  expect(f.runner.history().records).toHaveLength(1); expect(f.locked()).toBe(false)
}, 15000)
test('a stop during reservation prevents launch', async () => {
  let release!: () => void; const spawnProcess = vi.fn()
  const f = fixture({ spawnProcess: spawnProcess as never, acquire: async () => { await new Promise<void>(resolve => { release = resolve }); return { recheck: () => {}, release: () => {} } } })
  const review = await f.runner.preview(1, { command: say('not launched'), cwd: f.cwd }), pending = f.runner.decide(1, review.token, 'allow')
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  expect(f.runner.cancel(2).requested).toBe(false); expect(f.runner.cancel(1).requested).toBe(true); release()
  await expect(pending).rejects.toThrow(); expect(spawnProcess).not.toHaveBeenCalled()
})
test('another command cannot start while an approved one holds the reservation', async () => {
  let release!: () => void
  const f = fixture({ acquire: async () => { await new Promise<void>(resolve => { release = resolve }); return { recheck: () => {}, release: () => {} } } })
  const first = await f.runner.preview(1, { command: say('first'), cwd: f.cwd }), second = await f.runner.preview(2, { command: say('second'), cwd: f.cwd })
  const pending = f.runner.decide(1, first.token, 'allow'); await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  await expect(f.runner.decide(2, second.token, 'allow')).rejects.toThrow(/Another app command/)
  f.runner.cancel(); release(); await expect(pending).rejects.toThrow()
})
test('saved output changes are refused instead of presented as confirmed command output', async () => {
  const f = fixture(), review = await f.runner.preview(1, { command: say('original'), cwd: f.cwd }), result = await f.runner.decide(1, review.token, 'allow')
  if ('denied' in result) throw Error('unexpected denial')
  writeFileSync(join(f.root, result.runId!, 'stdout.bin'), 'outside edit')
  expect(() => f.runner.output(result.runId!, 'stdout')).toThrow(/changed after recording/)
  expect(() => f.runner.read('../outside')).toThrow(/identifier|ID/)
}, 15000)
test('storage failure prevents any command process from spawning', async () => {
  const root = dir(), file = join(root, 'file'); writeFileSync(file, 'original')
  const spawnProcess = vi.fn(), f = fixture({ root: file, spawnProcess: spawnProcess as never })
  const review = await f.runner.preview(1, { command: say('not run'), cwd: f.cwd })
  await expect(f.runner.decide(1, review.token, 'allow')).rejects.toThrow()
  expect(spawnProcess).not.toHaveBeenCalled(); expect(readFileSync(file, 'utf8')).toBe('original')
})

test('app restart exposes recorded completion and does not execute anything again', async () => {
  const f = fixture(), review = await f.runner.preview(1, { command: say('kept across restart'), cwd: f.cwd })
  const result = await f.runner.decide(1, review.token, 'allow'); if ('denied' in result) throw Error('unexpected denial')
  const spawnProcess = vi.fn(), restarted = fixture({ root: f.root, spawnProcess: spawnProcess as never })
  expect(restarted.runner.history().records[0].id).toBe(result.runId)
  expect(restarted.runner.read(result.runId!).result.stdout).toBe('kept across restart')
  expect(spawnProcess).not.toHaveBeenCalled()
}, 15000)
test('a running record left by a lost process is interrupted evidence, not an automatic retry', async () => {
  const f = fixture(), review = await f.runner.preview(1, { command: say('prefix'), cwd: f.cwd })
  const result = await f.runner.decide(1, review.token, 'allow'); if ('denied' in result) throw Error('unexpected denial')
  const file = join(f.root, result.runId!, 'record.json'), record = JSON.parse(readFileSync(file, 'utf8'))
  record.state = 'running'; record.outputComplete = false; record.exitCode = null; delete record.stdoutHash; delete record.stderrHash; writeFileSync(file, JSON.stringify(record))
  const spawnProcess = vi.fn(), restarted = fixture({ root: f.root, spawnProcess: spawnProcess as never })
  expect(restarted.runner.history().records[0]).toMatchObject({ state: 'interrupted', outputComplete: false })
  expect(restarted.runner.read(result.runId!).result.stdout).toBe('prefix')
  expect(restarted.runner.output(result.runId!, 'stdout').name).toContain('-partial.bin')
  expect(spawnProcess).not.toHaveBeenCalled()
}, 15000)
test('the actual shell receives no inherited provider key', async () => {
  const previous = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = 'fixture-secret-not-for-command'
  try {
    const f = fixture(), command = process.platform === 'win32' ? '[Console]::Write([string]$env:ANTHROPIC_API_KEY)' : 'printf "%s" "$ANTHROPIC_API_KEY"'
    const review = await f.runner.preview(1, { command, cwd: f.cwd }), result = await f.runner.decide(1, review.token, 'allow')
    if ('denied' in result) throw Error('unexpected denial')
    expect(result.exitCode).toBe(0); expect(result.stdout).toBe('')
    expect(JSON.stringify(f.runner.history())).not.toContain('fixture-secret-not-for-command')
  } finally { if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous }
}, 15000)

test('invisible control characters and oversized Windows encodings refuse instead of changing the command', () => {
  expect(() => commandSpec('echo visible\u202eevil', 'linux')).toThrow(/valid command/)
  expect(() => commandSpec('echo hidden\btext', 'linux')).toThrow(/valid command/)
  expect(() => commandSpec('x'.repeat(20000), 'win32', { SystemRoot: 'C:\\Windows' })).toThrow(/encoded command-line budget/)
  expect(commandSpec("printf 'বাংলা'", 'linux').script).toBe("printf 'বাংলা'")
})

test('turning on command access cannot restore a stale cloud or capture permission', async () => {
  const { DEFAULT_PERMISSIONS, permissionChanges, applyPermissionPatch } = await import('../src/shared/lib/permissions')
  const oldView = { ...DEFAULT_PERMISSIONS, cloud: { openai: true } }
  const newerServer = { ...oldView, browserCapture: false, cloud: { openai: false } }
  const patch = permissionChanges(oldView, { ...oldView, manualCommands: true })
  expect(patch).toEqual({ manualCommands: true })
  expect(applyPermissionPatch(newerServer, patch)).toMatchObject({ manualCommands: true, browserCapture: false, cloud: { openai: false } })
  expect(() => applyPermissionPatch(newerServer, { manualCommands: 'true' })).toThrow()
  expect(() => applyPermissionPatch(newerServer, { cloud: { openai: 'true' } })).toThrow()
})

test('saving reusable commands never executes them or persists an approval', async () => {
  const spawnProcess = vi.fn(), f = fixture({ spawnProcess: spawnProcess as never })
  f.revoke() // Execution access is off; saving text is still not an execution.
  const saved = f.runner.save({ name: 'Useful command', command: say('saved'), cwd: f.cwd })
  expect(f.runner.saved().items[0].command).toBe(saved.command)
  expect(f.runner.history().records).toHaveLength(0); expect(spawnProcess).not.toHaveBeenCalled()
  await expect(f.runner.previewSaved(1, saved.id)).rejects.toThrow(/off|busy/)
})
test('a saved command uses the same one-use review and records its inspected provenance', async () => {
  const f = fixture(), saved = f.runner.save({ name: 'Repeatable echo', command: say('saved output'), cwd: f.cwd })
  const review = await f.runner.previewSaved(1, saved.id)
  expect(review.source).toEqual({ id: saved.id, name: saved.name, digest: saved.digest })
  expect(f.runner.history().records).toHaveLength(0)
  const result = await f.runner.decide(1, review.token, 'allow'); if ('denied' in result) throw Error('unexpected denial')
  expect(result.stdout).toBe('saved output')
  expect(f.runner.read(result.runId!).record.request.source?.digest).toBe(saved.digest)
  await expect(f.runner.decide(1, review.token, 'allow')).rejects.toThrow(/already used/)
}, 15000)
test('archiving a saved command revokes a pending review without deleting its text', async () => {
  const f = fixture(), saved = f.runner.save({ name: 'Held command', command: say('must not run'), cwd: f.cwd })
  const review = await f.runner.previewSaved(1, saved.id)
  f.runner.archiveSaved(saved.id, true)
  await expect(f.runner.decide(1, review.token, 'allow')).rejects.toThrow(/archived/)
  expect(f.runner.saved().items[0]).toMatchObject({ archived: true, command: saved.command })
  f.runner.archiveSaved(saved.id, false)
  expect((await f.runner.previewSaved(1, saved.id)).command).toBe(saved.command)
  expect(f.runner.history().records).toHaveLength(0)
})
test('saved text changed after preview is never substituted at execution', async () => {
  const f = fixture(), saved = f.runner.save({ name: 'Original', command: say('original'), cwd: f.cwd })
  const review = await f.runner.previewSaved(1, saved.id), file = join(f.root, 'saved-commands', saved.id + '.json')
  const value = JSON.parse(readFileSync(file, 'utf8')); value.command = say('changed')
  writeFileSync(file, JSON.stringify(value))
  await expect(f.runner.decide(1, review.token, 'allow')).rejects.toThrow(/changed|invalid/)
  expect(f.runner.saved().notice).toContain('could not be read')
  expect(f.runner.history().records).toHaveLength(0)
})
test('a normal command request cannot forge saved-command provenance', async () => {
  const f = fixture(), review = await f.runner.preview(1, { command: say('manual'), cwd: f.cwd, source: { id: 'forged', name: 'Saved trusted check', digest: 'a'.repeat(64) } })
  expect(review.source).toBeUndefined()
  expect(await f.runner.decide(1, review.token, 'deny')).toEqual({ denied: true })
})
test('revisions create distinct retained definitions instead of overwriting the old command', () => {
  const f = fixture(), first = f.runner.save({ name: 'Same name', command: say('first'), cwd: f.cwd }), second = f.runner.save({ name: 'Same name', command: say('second'), cwd: f.cwd })
  expect(second.id).not.toBe(first.id)
  expect(f.runner.saved().items.map(item => item.command)).toContain(first.command)
  expect(f.runner.saved().items.map(item => item.command)).toContain(second.command)
})

test('a saved command for another OS is not treated as portable execution authority', async () => {
  const { createCommandLibrary } = await import('../src/main/commands/library')
  const f = fixture(), library = createCommandLibrary(join(f.root, 'saved-commands'))
  const saved = library.save({ name: 'Other OS', command: 'echo example', cwd: f.cwd, platform: process.platform === 'win32' ? 'linux' : 'win32' })
  await expect(f.runner.previewSaved(1, saved.id)).rejects.toThrow(/another OS/)
  expect(f.runner.history().records).toHaveLength(0)
})
test('saved commands remain pageable and no older text is pruned', () => {
  const f = fixture()
  for (let i = 0; i < 24; i++) f.runner.save({ name: `Command ${i}`, command: say(`text ${i}`), cwd: f.cwd })
  const first = f.runner.saved(), next = f.runner.saved(first.next)
  expect(first.items).toHaveLength(20); expect(next.items).toHaveLength(4)
  expect(new Set([...first.items, ...next.items].map(item => item.id)).size).toBe(24)
})
