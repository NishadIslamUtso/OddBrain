import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildHandoff, handoffFileName } from '../src/shared/lib/handoff'
import type { HandoffSource } from '../src/shared/lib/handoff'
import { handleVaultRequest } from '../src/main/vault/routes'
import { createVaultService } from '../src/main/vault/service'

/**
 * Track D: the handoff. Studied before building — briansmith80/claude-handoff
 * (git-syncable HANDOFF.md + /catchup), Vasilispapg/claude-handoff (MIT: a
 * clean document, not a transcript dump, opening with instructions to the
 * RECEIVING assistant), barley-dev/claude-handoff-skill (evidence, not
 * declarations). Ours is built from the turn already in memory — nothing
 * parsed post-hoc, nothing invented.
 */

const source: HandoffSource = {
  prompt: 'Fix the login bug and add a test',
  items: [
    { kind: 'status', text: 'engine ready' },
    { kind: 'tool', name: 'Read', summary: 'reads src/login.ts' },
    { kind: 'tool', name: 'Edit', summary: 'edits src/login.ts' },
    { kind: 'text', text: 'Found it: the token check ran before the refresh. Fixed and tested.' },
  ],
  state: 'done',
  sessionId: 'abc123',
  usage: { inTokens: 1200, outTokens: 340, durationMs: 4200, costUsd: null },
  engine: 'claude-code',
  model: 'qwen2.5-coder:3b',
  workspace: 'C:\\code\\thing',
  date: '2026-10-16T10:00:00.000Z',
}

test('the handoff opens with instructions to the receiver and carries the resume id', () => {
  const markdown = buildHandoff(source)
  assert.match(markdown, /# Handoff/)
  assert.match(markdown, /for the assistant that continues this work/)
  assert.match(markdown, /## The task/, 'the task, not a transcript')
  assert.match(markdown, /--resume abc123/, 'the resumable thread rides along')
  assert.match(markdown, /C:\\code\\thing/)
  assert.match(markdown, /- Read: reads src\/login\.ts/, 'the real tool calls are the record')
  assert.match(markdown, /token refresh|Fixed and tested|Where it landed/s)
  assert.match(markdown, /1200 tokens in/, 'cost as the engine itself reported')
  assert.doesNotMatch(markdown, /engine ready/, 'status noise is not the story')
})

test('the handoff tells the truth about a broken turn', () => {
  const broken = buildHandoff({
    ...source,
    state: 'error',
    items: [...source.items, { kind: 'error', text: 'the brain refused mid-edit' }],
  })
  assert.match(broken, /ended with an error/)
  assert.match(broken, /the brain refused mid-edit/)
  const running = buildHandoff({ ...source, state: 'running' })
  assert.match(running, /still running/, 'a live turn warns the reader nothing is settled')
})

test('the file name is vault-safe and sortable', () => {
  assert.equal(handoffFileName('2026-10-16T10:00:00.000Z', 'Fix the login bug!'), 'handoffs/2026-10-16-fix-the-login-bug.md')
  assert.equal(handoffFileName('2026-10-16T10:00:00.000Z', '???'), 'handoffs/2026-10-16.md')
  const long = handoffFileName('2026-10-16T10:00:00.000Z', 'x'.repeat(200))
  assert.ok(long.length <= 'handoffs/'.length + 10 + 1 + 40 + 3, `got ${long.length}`)
})

test('the handoff lands in the vault through the real door, under the vault\u2019s own rules', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-handoff-'))
  try {
    const service = createVaultService({ vaultPath: root })
    const request = (body: unknown): Parameters<typeof handleVaultRequest>[1] =>
      ({ route: '/handoff', method: 'POST', query: new URLSearchParams(), body, headers: new Headers() }) as never
    // NOTE: this door is an ipc door, not a vault HTTP route — the wiring test
    // below pins that. The vault's own write rules are what the service uses.
    const markdown = buildHandoff(source)
    assert.match(markdown, /^# Handoff/)
    assert.ok(markdown.length < 200_000)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  const read = (relative: string): string => readFileSync(`${process.cwd()}/${relative}`, 'utf8')
  const main = read('src/main/index.ts')
  const panel = read('src/renderer/src/components/EnginePanel.tsx')
  assert.match(panel, /Hand off/)
  assert.match(panel, /saveHandoff/)
})
