import { boundedResponse } from '../network/boundedResponse'
import { packageSource, validPackagePath, type PackageSource, type PackageInspection } from '../../shared/lib/packageInspection'

/** GitHub metadata only: pin first, bound every read, reject symlinks/submodules,
 * never extract archives, run package scripts, install, authenticate or fetch a supplied URL. */
export async function inspectPackage(source: PackageSource, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<PackageInspection> {
  const validated = packageSource(source.repo, { source: 'github', ...source })
  if (!validated || validated.repo !== source.repo || validated.path !== source.path || validated.ref !== source.ref) throw Error('Unsupported package source. Nothing was downloaded or executed.')
  const read = async (suffix: string, max: number, raw = false) => {
    signal.throwIfAborted()
    const response = await fetchImpl(`https://api.github.com/repos/${source.repo}/${suffix}`, { headers: { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) })
    if (!response.ok) throw Error(`GitHub returned ${response.status} while inspecting the package.`)
    const result = await boundedResponse(response, max); signal.throwIfAborted(); return result
  }
  const commits = JSON.parse(await read(`commits?sha=${encodeURIComponent(source.ref)}&per_page=1`, 128_000))
  const revision = Array.isArray(commits) ? commits[0]?.sha : undefined
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/i.test(revision)) throw Error('GitHub did not report an immutable package revision.')
  let treeId = revision
  // Walk only the package path before recursion, so a large catalog repository
  // cannot hide a small inspectable package behind GitHub's truncated root tree.
  for (const part of source.path.split('/').filter(Boolean)) {
    const parent = JSON.parse(await read(`git/trees/${treeId}`, 512_000))
    if (parent?.truncated !== false || !Array.isArray(parent.tree)) throw Error('The package path could not be resolved completely.')
    const child = parent.tree.find((r: any) => r.path === part && r.type === 'tree' && r.mode === '040000')
    if (!child || !/^[a-f0-9]{40}$/i.test(child.sha)) throw Error('The package path is missing or is not a normal directory.')
    treeId = child.sha
  }
  const tree = JSON.parse(await read(`git/trees/${treeId}?recursive=1`, 2_000_000))
  if (tree?.truncated !== false || !Array.isArray(tree.tree)) throw Error('The package tree is incomplete. No complete inventory can be claimed.')
  const prefix = source.path ? source.path + '/' : ''
  if (tree.tree.some((row: any) => !row || typeof row.path !== 'string' || !validPackagePath(row.path) || !['tree', 'blob', 'commit'].includes(row.type) || (row.type === 'tree' && row.mode !== '040000')) || new Set(tree.tree.map((row: any) => row.path)).size !== tree.tree.length) throw Error('The package tree is malformed. No complete inventory can be claimed.')
  const rows = tree.tree.filter((row: any) => row.type !== 'tree')
  if (!rows.length || rows.length > 2000) throw Error('The package folder is empty or exceeds the 2,000-file inspection limit.')
  if (rows.some((r: any) => !validPackagePath(r.path) || r.type !== 'blob' || !['100644', '100755'].includes(r.mode))) throw Error('The package contains linked, external or unsupported files. Inspect it in its source repository; nothing was executed.')
  const files: string[] = rows.map((r: any) => r.path).sort()
  if (new Set(files).size !== files.length) throw Error('The package tree contains duplicate paths.')
  const report: PackageInspection = {
    source, revision, files, skills: files.filter(p => /(^|\/)SKILL\.md$/i.test(p)),
    connectors: files.filter(p => /(^|\/)(?:\.mcp\.json|mcp\.json)$/i.test(p)),
    agents: files.filter(p => /^agents\/.*\.(md|ya?ml|json)$/i.test(p)),
    hooks: files.filter(p => /^hooks\//i.test(p)), commands: files.filter(p => /^commands\//i.test(p)), requirements: [], readme: '',
    notices: ['Read-only source inspection, not a security audit or proof of engine compatibility. Native installation resolves its own version; it may differ from this pinned snapshot.', 'No package scripts, hooks or setup commands were run. Authentication and installed/enabled state are not established by this inventory.'],
  }
  const candidates = ['.claude-plugin/plugin.json', 'plugin.json', 'package.json', 'requirements.txt', 'pyproject.toml', 'README.md', 'readme.md']
  for (const file of candidates.filter(p => files.includes(p))) {
    const row = rows.find((r: any) => r.path === file)
    if (!Number.isSafeInteger(row.size) || row.size < 0 || row.size > 128_000) { report.notices.push(`${file}: exceeds the preview limit or has unknown size; not read.`); continue }
    try {
      const text = await read(`contents/${(prefix + file).split('/').map(encodeURIComponent).join('/')}?ref=${revision}`, 128_000, true)
      if (/readme\.md/i.test(file)) report.readme = text
      else if (file === 'requirements.txt' || file === 'pyproject.toml') report.requirements.push(`${file}\n${text}`)
      else {
        const value = JSON.parse(text)
        // Show public publisher declarations; never load local credentials or execute setup commands.
        for (const field of ['engines', 'dependencies', 'peerDependencies', 'requirements']) if (value?.[field] !== undefined) report.requirements.push(`${file} · ${field}\n${JSON.stringify(value[field], null, 2)}`)
        for (const field of ['skills', 'agents', 'commands', 'hooks', 'mcpServers']) if (value?.[field] !== undefined) report.notices.push(`${file} declares ${field}; paths in the inventory are source evidence, not proof that the engine loaded them.`)
        if (value?.scripts) report.notices.push(`${file} declares executable scripts. None were run.`)
      }
    } catch { signal.throwIfAborted(); report.notices.push(`${file}: could not read supported metadata. Requirements may be incomplete.`) }
  }
  return report
}
