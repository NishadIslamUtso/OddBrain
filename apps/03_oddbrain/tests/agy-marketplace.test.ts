// @vitest-environment node
import { test, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAgyMarketplaceService, agyMarketplaceArgs, readAgyMarketplace, readAgyInstalled, type AgyInstalledPlugin } from '../src/main/engine/agyMarketplace'
import { AGY_MARKETPLACE as source, AGY_MARKETPLACE_URL, installedPluginSummaries } from '../src/shared/lib/marketplace'

// Synthetic schema/CLI fixtures, not a recorded live marketplace/install.
const raw = JSON.stringify({ name: source, plugins: [{ name: 'notes', description: 'Read notes', author: { name: 'Fixture' }, source: { url: 'https://untrusted.invalid/package.zip' } }] })
function fixture(overrides: Parameters<typeof createAgyMarketplaceService>[0] = {}) {
  let binary = '/chosen/agy'
  let list: AgyInstalledPlugin[] = []
  const calls: string[][] = []
  const fetchImpl = vi.fn(async () => new Response(raw))
  const service = createAgyMarketplaceService({ fetchImpl: fetchImpl as typeof fetch, command: () => binary, run: async (command, args) => {
    calls.push([command, ...args])
    if (args.includes('--help')) return `Usage: agy plugin ${args[1]} [name]${args[1] === 'list' ? ' --json' : ''}`
    if (args[1] === 'list') return JSON.stringify(list)
    if (args[1] === 'install') list = [{ name: 'notes', source, enabled: false, skills: ['notes'], mcpServers: ['notes-api'] }]
    if (args[1] === 'enable') list[0].enabled = true
    if (args[1] === 'disable') list[0].enabled = false
    if (args[1] === 'uninstall') list = []
    return 'Command completed'
  }, ...overrides })
  return { service, calls, fetchImpl, binary: (v: string) => { binary = v }, list: (v: AgyInstalledPlugin[]) => { list = v } }
}
test('agy uses its official feed, never catalog-supplied archive URLs; browse never runs CLI', async () => {
  const f = fixture(); expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.service.sources()).toEqual([source])
  const catalog = await f.service.browse(source)
  expect(f.fetchImpl).toHaveBeenCalledWith(AGY_MARKETPLACE_URL, expect.objectContaining({ redirect: 'error' }))
  expect(catalog.plugins).toEqual([{ name: 'notes', description: 'Read notes', author: 'Fixture' }]); expect(f.calls).toEqual([])
  await expect(f.service.browse('https://attacker.invalid')).rejects.toThrow(/official/)
})
test('catalog and installed-list parsers reject malformed, duplicated and shell-sensitive names', () => {
  for (const name of ['--help', 'x;whoami', 'x\ny', 'x/foo', 'x%PATH%']) {
    expect(() => readAgyMarketplace(JSON.stringify({ plugins: [{ name }] }))).toThrow()
    expect(() => agyMarketplaceArgs('install', name)).toThrow()
  }
  expect(() => readAgyMarketplace(JSON.stringify({ name: 'wrong', plugins: [] }))).toThrow()
  expect(() => readAgyMarketplace(JSON.stringify({ plugins: [{ name: 'A' }, { name: 'a' }] }))).toThrow(/duplicate/)
  expect(() => readAgyInstalled('{}')).toThrow()
  expect(() => readAgyInstalled('[{"name":"x","enabled":"yes","source":"official"}]')).toThrow()
  expect(() => readAgyInstalled(JSON.stringify([{ name: 'x', enabled: true, source }, { name: 'X', enabled: false, source }]))).toThrow()
})
test('agy argv never borrows Claude scope/json/update flags', () => {
  expect(agyMarketplaceArgs('install', 'notes')).toEqual(['plugin', 'install', `notes@${source}`])
  for (const action of ['enable', 'disable', 'uninstall'] as const) expect(agyMarketplaceArgs(action, 'notes')).toEqual(['plugin', action, 'notes'])
  for (const action of ['add', 'update'] as const) expect(() => agyMarketplaceArgs(action, 'notes')).toThrow(/does not expose/)
})
test('a reviewed install is owner-bound, single-use and read back as disabled, never ready', async () => {
  const f = fixture(); await f.service.browse(source)
  const plan = await f.service.plan(1, source, 'install', 'notes')
  expect(f.calls.every(args => args.includes('--help') || args[2] === 'list')).toBe(true)
  await expect(f.service.confirm(2, plan.token)).rejects.toThrow(/belong/)
  const result = await f.service.confirm(1, plan.token)
  expect(f.calls).toContainEqual(plan.command); expect(f.calls.at(-1)?.slice(1)).toEqual(['plugin', 'list', '--json'])
  expect(result).toContain('installed and disabled'); expect(result).toContain('does not mean')
  await expect(f.service.confirm(1, plan.token)).rejects.toThrow(/belong/)
})
test('installed official packages can be enabled, disabled and removed without a catalog fetch', async () => {
  const f = fixture(); f.list([{ name: 'notes', source, enabled: false }])
  for (const action of ['enable', 'disable', 'uninstall'] as const) {
    const p = await f.service.plan(1, source, action, 'notes')
    expect(await f.service.confirm(1, p.token)).toContain(action === 'uninstall' ? 'not installed' : action === 'enable' ? 'and enabled' : 'and disabled')
  }
  expect(f.fetchImpl).not.toHaveBeenCalled()
})
test('cancel, expiry and binary changes invalidate approvals before mutation', async () => {
  const f = fixture(); await f.service.browse(source)
  const a = await f.service.plan(1, source, 'install', 'notes'); f.service.cancel(1)
  await expect(f.service.confirm(1, a.token)).rejects.toThrow()
  const b = await f.service.plan(1, source, 'install', 'notes'); f.binary('/new/agy')
  await expect(f.service.confirm(1, b.token)).rejects.toThrow(/changed/)
  const c = await f.service.plan(1, source, 'install', 'notes')
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000)
  try { await expect(f.service.confirm(1, c.token)).rejects.toThrow(/expired/) } finally { clock.mockRestore() }
  expect(f.calls.filter(c => c[2] === 'install' && !c.includes('--help'))).toEqual([])
})
test('cross-source collisions are rejected at plan time and checked again at confirmation', async () => {
  const f = fixture(); await f.service.browse(source)
  const p = await f.service.plan(1, source, 'install', 'notes')
  f.list([{ name: 'notes', source: 'local-folder', enabled: true }])
  await expect(f.service.confirm(1, p.token)).rejects.toThrow(/another source/)
  await expect(f.service.plan(1, source, 'disable', 'notes')).rejects.toThrow(/another source/)
})
test('unsupported installed CLI and unbrowsed/unknown plugins fail closed', async () => {
  const f = fixture({ run: async () => 'Unknown command plugin' })
  await expect(f.service.probe(1)).rejects.toThrow(/lacks/)
  await expect(f.service.plan(1, source, 'install', 'notes')).rejects.toThrow(/Browse/)
  await f.service.browse(source)
  await expect(f.service.plan(1, source, 'install', 'notes')).rejects.toThrow(/lacks/)
  const supported = fixture(); await supported.service.browse(source)
  await expect(supported.service.plan(1, source, 'install', 'invented')).rejects.toThrow(/Browse/)
})
test('zero exit code without matching installed state never claims success', async () => {
  const f = fixture({ run: async (_b, args) => args.includes('--help') ? 'Usage: agy plugin install' : args[1] === 'list' ? '[]' : 'Success!' })
  await f.service.browse(source); const p = await f.service.plan(1, source, 'install', 'notes')
  await expect(f.service.confirm(1, p.token)).rejects.toThrow(/does not confirm/)
})
test('read-back failure after a mutation clearly says it may already have happened', async () => {
  let changed = false
  const f = fixture({ run: async (_b, args) => {
    if (args.includes('--help')) return 'Usage: agy plugin install'
    if (args[1] === 'list') { if (changed) throw Error('unavailable'); return '[]' }
    changed = true; return 'Installed'
  } })
  await f.service.browse(source); const p = await f.service.plan(1, source, 'install', 'notes')
  await expect(f.service.confirm(1, p.token)).rejects.toThrow(/do not assume the change was undone/)
})
test('cancel during a delayed source check prevents the subsequent mutation, even if runner ignores abort', async () => {
  let release!: (s: string) => void; let checking = false
  const mutations: string[][] = []
  const f = fixture({ run: async (_b, args) => {
    if (args.includes('--help')) return 'Usage: agy plugin install'
    if (args[1] === 'list') return checking ? new Promise(resolve => { release = resolve }) : '[]'
    mutations.push(args); return ''
  } })
  await f.service.browse(source); const p = await f.service.plan(1, source, 'install', 'notes'); checking = true
  const pending = f.service.confirm(1, p.token); const rejected = expect(pending).rejects.toThrow()
  await Promise.resolve(); f.service.cancel(1); release('[]'); await rejected; expect(mutations).toEqual([])
})
test('offline cache is bounded, read-only, and visibly dated; symlink caches are rejected', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-agy-market-'))
  try {
    const file = join(root, 'marketplace.json'); writeFileSync(file, raw)
    const f = fixture({ cacheFile: file, fetchImpl: async () => { throw Error('offline') } })
    const catalog = await f.service.browse(source); expect(catalog.notice).toContain('Offline copy'); expect(catalog.notice).toContain('may differ')
    writeFileSync(file, 'x'.repeat(2_000_001)); await expect(f.service.browse(source)).rejects.toThrow(/Could not read/)
    writeFileSync(file, raw)
    const link = join(root, 'linked.json')
    // Windows can forbid symlink creation without elevation. Only exercise the
    // filesystem case where supported; the bound/cache assertions always run.
    try { symlinkSync(file, link) } catch (error) { if (!['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code || '')) throw error; return }
    await expect(fixture({ cacheFile: link, fetchImpl: async () => { throw Error('offline') } }).service.browse(source)).rejects.toThrow(/Could not read/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('cancelled network reads do not fall back to cache or seed an install plan', async () => {
  let finish!: (r: Response) => void
  const f = fixture({ fetchImpl: () => new Promise(resolve => { finish = resolve }) })
  const pending = f.service.browse(source, 3); const rejected = expect(pending).rejects.toThrow()
  f.service.cancelAll(); finish(new Response(raw)); await rejected
  await expect(f.service.plan(3, source, 'install', 'notes')).rejects.toThrow(/Browse/)
})
test('human-readable installed summaries retain skills and connector names without inventing enablement', () => {
  expect(installedPluginSummaries(JSON.stringify([{ name: 'notes', source, enabled: false, skills: ['notes'], mcpServers: ['api'] }]))[0]).toMatchObject({ enabled: false, skills: ['notes'], connectors: ['api'] })
  expect(installedPluginSummaries('[{"id":"notes@market"}]')[0]).toMatchObject({ name: 'notes', source: 'market', enabled: undefined })
  expect(installedPluginSummaries('not JSON')).toEqual([])
})

test('real fixture subprocess completes browse/review/install/enable/disable/uninstall with file read-back', async () => {
  const { readFileSync } = await import('node:fs')
  const { runMarketplace } = await import('../src/main/engine/marketplace')
  const root = mkdtempSync(join(tmpdir(), 'ob-agy-process-'))
  try {
    const script = join(root, 'cli.cjs'), state = join(root, 'state.json')
    writeFileSync(state, '[]')
    writeFileSync(script, `const fs=require('node:fs');const file=process.argv[2], args=process.argv.slice(3);
      if(args.includes('--help')){ console.log('Usage: agy plugin '+args[1]+' [name] --json');process.exit(0); }
      let list=JSON.parse(fs.readFileSync(file,'utf8'));
      if(args[1]==='list'){console.log(JSON.stringify(list));process.exit(0);}
      if(args[1]==='install'&&args[2]==='notes@antigravity-plugins-official')list=[{name:'notes',source:'antigravity-plugins-official',enabled:false}];
      else if(args[1]==='enable'&&args[2]==='notes')list[0].enabled=true;
      else if(args[1]==='disable'&&args[2]==='notes')list[0].enabled=false;
      else if(args[1]==='uninstall'&&args[2]==='notes')list=[];else process.exit(2);
      fs.writeFileSync(file,JSON.stringify(list));console.log('Completed fixture operation');`)
    const f = fixture({ command: () => process.execPath, run: (binary, args, signal) => runMarketplace(binary, [script, state, ...args], signal) })
    await f.service.browse(source)
    for (const action of ['install', 'enable', 'disable', 'uninstall'] as const) {
      const before = readFileSync(state, 'utf8')
      const denied = await f.service.plan(1, source, action, 'notes'); f.service.cancel(1)
      await expect(f.service.confirm(1, denied.token)).rejects.toThrow(); expect(readFileSync(state, 'utf8')).toBe(before)
      const allowed = await f.service.plan(1, source, action, 'notes'); expect(readFileSync(state, 'utf8')).toBe(before)
      expect(await f.service.confirm(1, allowed.token)).toContain('Read back from agy')
      expect(JSON.parse(await f.service.installed(1))).toEqual(JSON.parse(readFileSync(state, 'utf8')))
    }
    expect(readFileSync(state, 'utf8')).toBe('[]')
  } finally { rmSync(root, { recursive: true, force: true }) }
}, 15000)
