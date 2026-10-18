// @vitest-environment node
import { test, expect, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMarketplaceService, marketplaceArgs, readMarketplace, repository } from '../src/main/engine/marketplace'

const index = { name: 'fixture-market', plugins: [{ name: 'notes', description: 'A fixture', author: { name: 'Fixture author' } }] }
const raw = JSON.stringify(index)

test('catalogs carry provenance; command arguments cannot be injected through repository or plugin names', () => {
  const catalog = readMarketplace('owner/repository', raw)
  expect(catalog.plugins[0].author).toBe('Fixture author')
  expect(marketplaceArgs(catalog, 'install', 'notes')).toEqual(['plugin', 'install', 'notes', '--marketplace', 'owner/repository', '--scope', 'user', '--json'])
  expect(marketplaceArgs(catalog, 'uninstall', 'notes')).toContain('--keep-data')
  for (const value of ['--help', 'https://github.com/o/r', 'o/r;whoami', 'o/../r', 'o/r\n--yes']) expect(() => repository(value)).toThrow()
  expect(() => marketplaceArgs(catalog, 'install', 'notes;whoami')).toThrow()
  expect(() => readMarketplace('o/r', JSON.stringify({ name: '--name', plugins: [] }))).toThrow()
  expect(() => readMarketplace('o/r', JSON.stringify({ ...index, plugins: [...index.plugins, ...index.plugins] }))).toThrow(/duplicate/)
})
test('catalog browsing does not execute an engine or install; construction does not fetch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-'))
  try {
    let fetches = 0, executions = 0
    const service = createMarketplaceService({ file: join(root, 'sources.json'), fetchImpl: (async (url, init) => { fetches++; expect(String(url)).toBe('https://api.github.com/repos/o/r/contents/.claude-plugin/marketplace.json'); expect(init?.redirect).toBe('error'); return new Response(raw) }) as typeof fetch, run: async () => { executions++; return '' } })
    expect(fetches).toBe(0); expect(service.sources()).toEqual([])
    await service.browse('o/r'); expect(service.sources()).toEqual(['o/r']); expect(executions).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('exact displayed command requires a one-use owner-bound approval, never -y', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-'))
  try {
    const commands: string[][] = []
    const service = createMarketplaceService({ file: join(root, 'sources.json'), command: () => '/chosen/claude', fetchImpl: (async () => new Response(raw)) as typeof fetch, run: async (binary, args) => { commands.push([binary, ...args]); return args.includes('--help') ? 'Usage: plugin marketplace add --marketplace --scope --json --keep-data' : 'Installed fixture' } })
    await service.browse('o/r')
    const plan = await service.plan(1, 'o/r', 'install', 'notes')
    expect(commands).toHaveLength(1); expect(commands[0]).toContain('--help')
    await expect(service.confirm(2, plan.token)).rejects.toThrow(/belong/)
    expect(await service.confirm(1, plan.token)).toBe('Installed fixture')
    expect(commands[1]).toEqual(plan.command); expect(commands[1]).not.toContain('-y'); expect(commands[1]).not.toContain('--yes')
    await expect(service.confirm(1, plan.token)).rejects.toThrow()
    const denied = await service.plan(1, 'o/r', 'add'); service.cancel(1)
    await expect(service.confirm(1, denied.token)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('expired approvals and changed executables are refused before installation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-'))
  try {
    let binary = '/first/claude', executions = 0
    const service = createMarketplaceService({ file: join(root, 'sources.json'), command: () => binary, fetchImpl: (async () => new Response(raw)) as typeof fetch, run: async () => { executions++; return 'Usage: plugin marketplace add --marketplace --scope --json --keep-data' } })
    await service.browse('o/r'); const first = await service.plan(1, 'o/r', 'add'); binary = '/other/claude'
    await expect(service.confirm(1, first.token)).rejects.toThrow(/changed/)
    const second = await service.plan(1, 'o/r', 'add')
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000)
    try { await expect(service.confirm(1, second.token)).rejects.toThrow(/expired/) } finally { clock.mockRestore() }
    expect(executions).toBe(2)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('an old or unsupported CLI is a capability failure, not an invented command fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-'))
  try {
    const service = createMarketplaceService({ file: join(root, 'sources.json'), fetchImpl: (async () => new Response(raw)) as typeof fetch, run: async () => 'Unknown command plugin' })
    await service.browse('o/r'); await expect(service.probe(1)).rejects.toThrow(/lacks/)
    await expect(service.plan(1, 'o/r', 'install', 'notes')).rejects.toThrow(/does not expose/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('non-install actions verify the installed marketplace repository, including again at confirmation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-'))
  try {
    let repo = 'other/source'; const actions: string[][] = []
    const service = createMarketplaceService({ file: join(root, 'sources.json'), fetchImpl: (async () => new Response(raw)) as typeof fetch, run: async (_binary, args) => {
      actions.push(args)
      return args.includes('--help') ? '--scope --json --keep-data' : JSON.stringify([{ name: index.name, source: 'github', repo }])
    } })
    await service.browse('o/r')
    await expect(service.plan(1, 'o/r', 'update', 'notes')).rejects.toThrow(/does not match/)
    repo = 'o/r'; const plan = await service.plan(1, 'o/r', 'update', 'notes')
    repo = 'other/source'; await expect(service.confirm(1, plan.token)).rejects.toThrow(/does not match/)
    expect(actions.filter(args => args[1] === 'update' && !args.includes('--help'))).toHaveLength(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('browse is cancellable and rejects concurrent operations instead of multiplying downloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-'))
  try {
    const service = createMarketplaceService({ file: join(root, 'sources.json'), fetchImpl: ((_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(Error('Cancelled.'))))) as typeof fetch })
    const pending = service.browse('o/r', 7)
    await expect(service.browse('o/other', 8)).rejects.toThrow(/running/)
    service.cancel(7); await expect(pending).rejects.toThrow(/Cancelled/)
    expect(service.sources()).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
