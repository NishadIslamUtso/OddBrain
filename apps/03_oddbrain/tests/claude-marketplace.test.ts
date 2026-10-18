import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClaudeMarketplace, type CliRunner } from '../src/main/engine/claudeMarketplace'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const fixture = () => { const root = mkdtempSync(join(tmpdir(), 'ob-cli-market-')); roots.push(root); return root }
const detected = async () => ({ found: true, version: '2.1.302 (Claude Code)', path: '/installed/claude' })

function createRunner(root: string) {
  const calls: string[][] = []
  let installed = false
  let declareCommand = false
  const run: CliRunner = vi.fn(async (_bin, args, _timeout, cwd) => {
    expect(cwd).toBe(root)
    calls.push(args)
    if (args.join(' ').includes('marketplace list')) return { code: 0, stdout: JSON.stringify([{ name: 'test-market', source: 'directory', installLocation: root }]), stderr: '' }
    if (args.join(' ').includes('list --available')) return { code: 0, stdout: JSON.stringify({
      available: installed ? [] : [{ pluginId: 'plain@test-market', description: 'A verified CLI fixture', version: '1.0.0' }],
      installed: installed ? [{ id: 'plain@test-market', version: '1.0.0', enabled: true, scope: 'user' }] : [],
    }), stderr: '' }
    if (args.includes('install') && declareCommand && !args.includes('--accept-command')) return {
      code: 1, stdout: JSON.stringify({ outcome: 'needs-approval', shownCommand: { command: 'printf approved-install', sha256: 'a'.repeat(64) } }), stderr: '',
    }
    if (args.includes('install')) installed = true
    return { code: 0, stdout: JSON.stringify({ outcome: 'ok', message: 'Claude Code completed it.' }), stderr: '' }
  })
  return { run, calls, declare: () => { declareCommand = true } }
}

describe('Claude Code marketplace is an engine-owned source, never an OddBrain pack', () => {
  it('reads its real CLI listing only on request, labels marketplace and author, and uses a strict version gate', async () => {
    const root = fixture()
    const path = join(root, '.claude-plugin')
    mkdirSync(path)
    writeFileSync(join(path, 'marketplace.json'), JSON.stringify({ plugins: [{ name: 'plain', author: { name: 'Test Writer' }, description: 'For fixture testing' }] }))
    const { run, calls } = createRunner(root)
    const service = createClaudeMarketplace({ cwd: root, detect: detected, run })
    expect(calls).toHaveLength(0) // opening Settings does not browse or sync
    const listing = await service.list()
    expect(listing).toMatchObject({ ok: true, version: '2.1.302 (Claude Code)', marketplaces: [{ name: 'test-market' }],
      plugins: [{ id: 'plain@test-market', marketplace: 'test-market', author: 'Test Writer', installed: false }] })
    expect(calls).toHaveLength(2)
    const old = createClaudeMarketplace({ cwd: root, detect: async () => ({ found: true, version: '2.1.200', path: '/installed/claude' }), run })
    expect((await old.list()).reason).toMatch(/Upgrade to 2\.1\.300/)
    expect(calls).toHaveLength(2)
  })

  it('refuses untrusted shell characters, old cards, unknown plugin ids and silent installer fallback', async () => {
    const root = fixture(), { run, calls } = createRunner(root)
    const service = createClaudeMarketplace({ cwd: root, detect: detected, run })
    expect((await service.preview('add', 'some/repo && echo bad')).ok).toBe(false)
    expect((await service.preview('install', 'whatever@test-market')).ok).toBe(false)
    expect((await service.execute('add', 'some/repo', 'a different command')).answer).toMatch(/changed after the permission card/)
    expect(calls.every(args => args[0] === 'plugin' && (args[1] === 'marketplace' && args[2] === 'list' || args[1] === 'list'))).toBe(true)
    const shown = await service.preview('add', 'some/repo')
    expect(shown.command).toBe('/installed/claude plugin marketplace add some/repo --scope user --json')
    expect(await service.execute('add', 'some/repo', shown.command!)).toMatchObject({ ok: true, answer: 'Claude Code completed it.' })
    expect(calls.at(-1)).toEqual(['plugin', 'marketplace', 'add', 'some/repo', '--scope', 'user', '--json'])
  })

  it('installs an item only after approval; a marketplace-declared command needs a SECOND explicit approval with a pinned digest', async () => {
    const root = fixture(), runner = createRunner(root)
    const service = createClaudeMarketplace({ cwd: root, detect: detected, run: runner.run })
    const card = await service.preview('install', 'plain@test-market')
    expect(card).toMatchObject({ ok: true, source: 'test-market' })
    runner.declare()
    const first = await service.execute('install', 'plain@test-market', card.command!)
    expect(first.ok).toBe(false)
    expect(first.needsCommand).toMatchObject({ command: 'printf approved-install', sha256: 'a'.repeat(64) })
    expect(runner.calls.filter(args => args.includes('install'))).toHaveLength(1)
    expect(await service.execute('install', 'plain@test-market', first.needsCommand!.confirmationLine, 'a'.repeat(64)))
      .toMatchObject({ ok: true })
    expect(runner.calls.at(-1)).toContain('--accept-command')
    expect((await service.list()).plugins).toMatchObject([{ installed: true, scope: 'user' }])
    const update = await service.preview('update', 'plain@test-market')
    expect(update.command).toContain('plugin update plain@test-market --scope user --json')
  })

  it('refuses malformed CLI catalogues instead of hiding unknown entries or installing from them', async () => {
    const root = fixture()
    const bad: CliRunner = async (_bin, args) => ({ code: 0, stdout: args.includes('marketplace') ? '[]' : JSON.stringify({
      installed: [], available: [{ pluginId: 'a@b;rm -rf', name: 'bad' }],
    }), stderr: '' })
    const service = createClaudeMarketplace({ cwd: root, detect: detected, run: bad })
    expect(await service.list()).toMatchObject({ ok: false, reason: expect.stringMatching(/cannot validate/) })
    expect((await service.preview('install', 'a@b;rm -rf')).ok).toBe(false)
  })
})
