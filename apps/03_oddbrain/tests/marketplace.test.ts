// @vitest-environment node
import { test, expect, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMarketplaceService, marketplaceArgs, readMarketplace, repository, runMarketplace } from '../src/main/engine/marketplace'

const index = { name: 'fixture-market', plugins: [{ name: 'notes', description: 'A fixture', author: { name: 'Fixture author' } }] }
const raw = JSON.stringify(index)

test('catalogs carry provenance; command arguments cannot be injected through repository or plugin names', () => {
  const catalog = readMarketplace('owner/repository', raw)
  expect(catalog.plugins[0].author).toBe('Fixture author')
  expect(marketplaceArgs(catalog, 'install', 'notes')).toEqual(['plugin', 'install', 'notes@fixture-market', '--scope', 'user', '--json'])
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
    const service = createMarketplaceService({ file: join(root, 'sources.json'), command: () => '/chosen/claude', fetchImpl: (async () => new Response(raw)) as typeof fetch, run: async (binary, args) => { commands.push([binary, ...args]); return args.includes('--help') ? 'Usage: plugin marketplace add --scope --json --keep-data' : args[1] === 'marketplace' && args[2] === 'list' ? JSON.stringify([{ name: index.name, source: 'github', repo: 'o/r' }]) : 'Installed fixture' } })
    await service.browse('o/r')
    const plan = await service.plan(1, 'o/r', 'install', 'notes')
    expect(commands).toHaveLength(2); expect(commands[0]).toContain('--help')
    await expect(service.confirm(2, plan.token)).rejects.toThrow(/belong/)
    expect(await service.confirm(1, plan.token)).toBe('Installed fixture')
    expect(commands.at(-1)).toEqual(plan.command); expect(commands.at(-1)).not.toContain('-y'); expect(commands.at(-1)).not.toContain('--yes')
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

test('install and other plugin actions verify the installed marketplace repository, including again at confirmation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-'))
  try {
    let repo = 'other/source'; const actions: string[][] = []
    const service = createMarketplaceService({ file: join(root, 'sources.json'), fetchImpl: (async () => new Response(raw)) as typeof fetch, run: async (_binary, args) => {
      actions.push(args)
      return args.includes('--help') ? '--scope --json --keep-data' : JSON.stringify([{ name: index.name, source: 'github', repo }])
    } })
    await service.browse('o/r')
    await expect(service.plan(1, 'o/r', 'update', 'notes')).rejects.toThrow(/does not match/)
    await expect(service.plan(1, 'o/r', 'install', 'notes')).rejects.toThrow(/does not match/)
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

// Six real child processes with the host's own Node. Windows CI under load can
// spend more than the 5 s default starting them, which says nothing about the
// behaviour being tested.
test('real fixture process installs and uninstalls only after confirmation; cancellation changes nothing', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-process-'))
  const script = join(root, 'cli.cjs'), state = join(root, 'installed.json')
  try {
    await writeFile(state, JSON.stringify({ installed: false, commands: [] }))
    await writeFile(script, `
      const fs = require('node:fs'); const path = process.argv[2]; const args = process.argv.slice(3);
      if (args.includes('--help')) { console.log('Usage: plugin install <plugin> --scope --json --keep-data'); process.exit(0); }
      if (args[1] === 'marketplace' && args[2] === 'list') { console.log(JSON.stringify([{name:'fixture-market',source:'github',repo:'o/r'}])); process.exit(0); }
      if (!['install','uninstall'].includes(args[1]) || args[2] !== 'notes@fixture-market') process.exit(2);
      const value = JSON.parse(fs.readFileSync(path,'utf8')); value.installed = args[1] === 'install'; value.commands.push(args);
      fs.writeFileSync(path,JSON.stringify(value)); console.log(JSON.stringify(value));
    `)
    const service = createMarketplaceService({ file: join(root,'sources.json'), command: () => process.execPath, fetchImpl: (async () => new Response(raw)) as typeof fetch,
      run: (binary,args,signal) => runMarketplace(binary,[script,state,...args],signal) })
    await service.browse('o/r')
    for (const action of ['install','uninstall'] as const) {
      const before = await readFile(state,'utf8')
      const denied = await service.plan(7,'o/r',action,'notes'); service.cancel(7)
      await expect(service.confirm(7,denied.token)).rejects.toThrow()
      expect(await readFile(state,'utf8')).toBe(before)
      const allowed = await service.plan(7,'o/r',action,'notes')
      expect(await readFile(state,'utf8')).toBe(before)
      const result = JSON.parse(await service.confirm(7,allowed.token))
      expect(result.installed).toBe(action === 'install')
      expect(result.commands.at(-1)).toEqual(allowed.command.slice(1))
      await expect(service.confirm(7,allowed.token)).rejects.toThrow()
    }
    expect(JSON.parse(await readFile(state,'utf8')).commands.map((args: string[]) => args[1])).toEqual(['install','uninstall'])
  } finally { await rm(root,{recursive:true,force:true}) }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

test('cancelled catalog download cannot persist a late response even when transport ignores abort', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-late-'))
  try {
    const reply = deferred<Response>()
    const service = createMarketplaceService({ file: join(root, 'sources.json'), fetchImpl: (() => reply.promise) as typeof fetch })
    const pending = service.browse('o/r', 7)
    service.cancel(7)
    const rejected = expect(pending).rejects.toThrow()
    reply.resolve(new Response(raw)); await rejected
    expect(service.sources()).toEqual([])
    await expect(service.plan(7, 'o/r', 'add')).rejects.toThrow(/Fetch/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('cancel during capability check cannot resurrect an approval; the operation lease stays held until settlement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-late-'))
  try {
    const reply = deferred<string>(); let calls = 0
    const service = createMarketplaceService({ file: join(root, 'sources.json'), fetchImpl: (async () => new Response(raw)) as typeof fetch,
      run: async () => { calls++; return reply.promise } })
    await service.browse('o/r')
    const pending = service.plan(7, 'o/r', 'install', 'notes')
    service.cancel(7)
    await expect(service.installed(8)).rejects.toThrow(/running/)
    const rejected = expect(pending).rejects.toThrow()
    reply.resolve('--scope --json'); await rejected
    expect(calls).toBe(1) // No source check or mutation after cancellation.
    await expect(service.installed(8)).resolves.toBe('--scope --json')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('cancel during confirmation source revalidation prevents the approved mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-market-late-'))
  try {
    const reply = deferred<string>(); const actions: string[][] = []; let delay = false
    const source = JSON.stringify([{ name: index.name, source: 'github', repo: 'o/r' }])
    const service = createMarketplaceService({ file: join(root, 'sources.json'), fetchImpl: (async () => new Response(raw)) as typeof fetch,
      run: async (_binary, args) => { actions.push(args); return delay ? reply.promise : args.includes('--help') ? '--scope --json' : source } })
    await service.browse('o/r'); const plan = await service.plan(7, 'o/r', 'install', 'notes')
    delay = true; const pending = service.confirm(7, plan.token)
    service.cancelAll(); const rejected = expect(pending).rejects.toThrow()
    reply.resolve(source); await rejected
    expect(actions.filter(args => args[1] === 'install' && !args.includes('--help'))).toEqual([])
    await expect(service.confirm(7, plan.token)).rejects.toThrow(/belong/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
