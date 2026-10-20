import { expect, test, vi } from 'vitest'
import { inspectPackage } from '../src/main/engine/packageInspection'
import { packageSource } from '../src/shared/lib/packageInspection'
import { readMarketplace, createMarketplaceService } from '../src/main/engine/marketplace'
import { readAgyMarketplace } from '../src/main/engine/agyMarketplace'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const sha = 'a'.repeat(40)
const source = { repo: 'owner/repo', path: 'plugins/one', ref: 'HEAD' }
const rows = ['skills/writing/SKILL.md', '.mcp.json', 'agents/reviewer.md', 'hooks/hooks.json', 'commands/check.md', 'package.json', 'README.md'].map(path => ({ path, type: 'blob', mode: '100644', size: 100 }))
function fixture(over: Record<string, unknown> = {}) {
  const calls: string[] = []
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    calls.push(url); expect(init.redirect).toBe('error'); expect(init.method).toBeUndefined()
    if (url.includes('/commits?')) return new Response(JSON.stringify([{ sha }]))
    if (url.includes('/git/trees/') && !url.includes('?recursive=1')) return new Response(JSON.stringify({ truncated: false, tree: [{ path: 'plugins', type: 'tree', mode: '040000', sha }, { path: 'one', type: 'tree', mode: '040000', sha }] }))
    if (url.includes('/git/trees/')) return new Response(JSON.stringify({ truncated: false, tree: rows, ...over }))
    if (url.includes('package.json')) return new Response(JSON.stringify({ engines: { node: '>=24' }, dependencies: { helper: '^1' }, scripts: { install: 'DO NOT RUN' } }))
    return new Response('# Publisher guide\nAuthenticate in the native tool. <script>not executable</script>')
  })
  return { calls, fetcher: fetcher as unknown as typeof fetch }
}
test('only validated public GitHub sources are supported; catalog paths remain package-scoped', () => {
  expect(packageSource('owner/catalog', './plugins/one')).toEqual({ repo: 'owner/catalog', path: 'plugins/one', ref: 'HEAD' })
  expect(packageSource('', { source: 'github', repo: 'owner/package', ref: 'release' })).toEqual({ repo: 'owner/package', path: '', ref: 'release' })
  expect(packageSource('', { source: 'url', url: 'https://github.com/owner/package.git' })?.repo).toBe('owner/package')
  for (const raw of ['../../escape', './a/../b', './a\\b', { source: 'url', url: 'https://evil.test/a/b' }, { source: 'github', repo: 'owner/repo', path: '../x' }, { source: 'github', repo: 'owner/repo', sha: 'moving' }]) expect(packageSource('owner/catalog', raw)).toBeUndefined()
})
test('both catalogs retain safe inspection locations without inventing absent source data', () => {
  const plugins = [{ name: 'one', source: { source: 'github', repo: 'owner/repo' } }, { name: 'unknown' }]
  expect(readMarketplace('owner/catalog', JSON.stringify({ name: 'catalog', plugins })).plugins[0].inspectSource?.repo).toBe('owner/repo')
  expect(readAgyMarketplace(JSON.stringify({ plugins })).plugins[0].inspectSource?.repo).toBe('owner/repo')
  expect(readAgyMarketplace(JSON.stringify({ plugins })).plugins[1].inspectSource).toBeUndefined()
})
test('pins all reads to an immutable snapshot, lists categories and requirements, never runs setup', async () => {
  const f = fixture(), report = await inspectPackage(source, new AbortController().signal, f.fetcher)
  expect(report.revision).toBe(sha); expect(report.files).toHaveLength(7)
  expect(report.skills).toEqual(['skills/writing/SKILL.md']); expect(report.connectors).toEqual(['.mcp.json']); expect(report.agents).toEqual(['agents/reviewer.md'])
  expect(report.requirements.join('\n')).toContain('>=24'); expect(report.requirements.join('\n')).not.toContain('DO NOT RUN')
  expect(report.notices.join(' ')).toContain('None were run')
  expect(f.calls.filter(c => c.includes('/contents/')).every(c => c.endsWith(`?ref=${sha}`))).toBe(true)
})
test.each([{ truncated: true }, { tree: rows.concat({ path: 'plugins/one/linked', type: 'blob', mode: '120000', size: 100 }) }, { tree: [{ path: 'plugins/one/submodule', type: 'commit', mode: '160000' }] }, { tree: [] }, { tree: [...rows, null] }, { tree: [...rows, rows[0]] }])('does not present incomplete or linked trees as a complete inventory: %j', async over => {
  const f = fixture(over); await expect(inspectPackage(source, new AbortController().signal, f.fetcher)).rejects.toThrow()
  expect(f.calls.some(c => c.includes('/contents/'))).toBe(false)
})
test('cancellation and unsafe sources stop before a network request', async () => {
  const f = fixture()
  await expect(inspectPackage(source, AbortSignal.abort(), f.fetcher)).rejects.toThrow()
  await expect(inspectPackage({ ...source, repo: 'evil.test/../../x' }, new AbortController().signal, f.fetcher)).rejects.toThrow()
  expect(f.calls).toEqual([])
})
test('unreadable metadata is explicitly incomplete, never guessed compatible', async () => {
  const f = fixture(); const fetcher = async (url: any, options: any) => String(url).includes('package.json') ? new Response('not json') : f.fetcher(url, options)
  const report = await inspectPackage(source, new AbortController().signal, fetcher as typeof fetch)
  expect(report.requirements).toEqual([]); expect(report.notices.join(' ')).toContain('Requirements may be incomplete')
})
test('the service only inspects a source in its fetched catalog and invokes no CLI', async () => {
  const root = mkdtempSync(join(tmpdir(), 'package-inspection-')), f = fixture(), run = vi.fn()
  const fetcher = async (url: any, options: any) => String(url).includes('marketplace.json') ? new Response(JSON.stringify({ name: 'catalog', plugins: [{ name: 'one', source: './plugins/one' }] })) : f.fetcher(url, options)
  const service = createMarketplaceService({ file: join(root, 'sources.json'), fetchImpl: fetcher as typeof fetch, run })
  try {
    await expect(service.inspect(1, 'owner/repo', 'one')).rejects.toThrow('Browse first')
    await service.browse('owner/repo', 1)
    expect((await service.inspect(1, 'owner/repo', 'one')).skills).toHaveLength(1)
    await expect(service.inspect(1, 'owner/repo', '--unsafe')).rejects.toThrow('Browse first')
    expect(run).not.toHaveBeenCalled()
  } finally { rmSync(root, { recursive: true, force: true }) }
})
