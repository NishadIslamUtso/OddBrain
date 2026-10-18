import { test, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startClaudeCodeSession } from '../src/main/engine/claudeCode'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import { listCheckpoints, restoreCheckpoint } from '../src/main/engine/checkpoints'
import type { spawn } from 'node:child_process'
const wait = async (check: () => boolean): Promise<void> => { for (let n = 0; n < 100 && !check(); n++) await new Promise(r => setTimeout(r, 5)); expect(check()).toBe(true) }
function child() { const c: any = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.written = []; c.stdin = { write: (s: string) => { c.written.push(s); return true }, on: () => {} }; c.exitCode = null; c.signalCode = null; c.killed = false; c.kill = () => { c.killed = true }; return c }
function permission(c: any, id: string, file: string) { c.stdout.emit('data', Buffer.from(JSON.stringify({ type: 'control_request', request_id: id, request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: file, content: 'new' } } }) + '\n')) }
test('a saved-key provider model uses its raw model id when the approved CLI session launches', () => {
  const c = child(), args: string[] = []
  const spawnProcess = ((_command: string, commandArgs: string[]) => {
    args.push(...commandArgs)
    return c
  }) as unknown as typeof spawn
  startClaudeCodeSession({
    cwd: '.', settings: { ...DEFAULT_ENGINE, model: 'anthropic/claude-3-5-sonnet-20241022' },
    auth: { provider: 'anthropic', apiKey: 'test-key' },
    onEvent: () => {}, spawnProcess,
  })
  expect(args[args.indexOf('--model') + 1]).toBe('claude-3-5-sonnet-20241022')
})

test('Auto-keep On/Off is read at each approval in the same live session; old copies still restore', async () => {
  const root = mkdtempSync(join(tmpdir(), 'keep-toggle-')), file = join(root, 'note.md'), dir = join(root, 'copies'), c = child(); let on = true
  writeFileSync(file, 'before')
  try {
    const session = startClaudeCodeSession({ cwd: root, settings: DEFAULT_ENGINE, checkpointDir: dir, shouldCheckpoint: () => on, onEvent: () => {}, spawnProcess: (() => c) as unknown as typeof spawn })
    permission(c, 'one', file); session.answer('one', true); await wait(() => c.written.length === 1); const kept = await listCheckpoints(dir); expect(kept).toHaveLength(1); expect(readFileSync(kept[0].copy, 'utf8')).toBe('before')
    on = false; writeFileSync(file, 'next state'); permission(c, 'two', file); session.answer('two', true); await wait(() => c.written.length === 2); expect(await listCheckpoints(dir)).toHaveLength(1)
    expect((await restoreCheckpoint(dir, kept[0].copy)).ok).toBe(true); expect(readFileSync(file, 'utf8')).toBe('before')
    const remaining = (await listCheckpoints(dir)).length; on = true; permission(c, 'three', file); session.answer('three', false); expect(c.written.at(-1)).toContain('deny'); expect(await listCheckpoints(dir)).toHaveLength(remaining)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('backup failure still fails closed when Auto-keep is On', async () => {
  const root = mkdtempSync(join(tmpdir(), 'keep-fail-')), blocker = join(root, 'not-a-directory'), file = join(root, 'note.md'), c = child();writeFileSync(blocker, 'x');writeFileSync(file, 'original')
  try { const s = startClaudeCodeSession({ cwd: root, settings: DEFAULT_ENGINE, checkpointDir: blocker, shouldCheckpoint: () => true, onEvent: () => {}, spawnProcess: (() => c) as unknown as typeof spawn }); permission(c, 'fail', file); s.answer('fail', true); await wait(() => c.written.length > 0); expect(c.written[0]).toContain('deny'); expect(c.written[0]).not.toContain('"behavior":"allow"'); expect(readFileSync(file, 'utf8')).toBe('original') }
  finally { rmSync(root, { recursive: true, force: true }) }
})
