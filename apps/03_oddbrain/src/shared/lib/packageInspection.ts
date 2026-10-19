export type PackageSource = { repo: string; path: string; ref: string }
export type PackageInspection = { source: PackageSource; revision: string; files: string[]; skills: string[]; connectors: string[]; agents: string[]; hooks: string[]; commands: string[]; requirements: string[]; readme: string; notices: string[] }
const REPO = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/
export function validPackagePath(value: string): boolean {
  return value.length <= 500 && !/[\\\u0000-\u001f:%?#]/.test(value) && (value === '' || value.split('/').every(p => p && p !== '.' && p !== '..'))
}
/** Publisher data is a location hint, not code or installation authority. */
export function packageSource(catalogRepo: string, raw: unknown): PackageSource | undefined {
  let repo = catalogRepo, path = '', ref = 'HEAD'
  if (typeof raw === 'string' && raw.startsWith('./')) path = raw.slice(2).replace(/\/$/, '')
  else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const source = raw as Record<string, unknown>
    if (source.source === 'github' && typeof source.repo === 'string') repo = source.repo
    else if (source.source === 'url' && typeof source.url === 'string') {
      const match = source.url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/)
      if (!match) return; repo = match[1]
    } else return
    if (source.path !== undefined && typeof source.path !== 'string') return
    path = (source.path as string || '').replace(/^\.\//, '').replace(/\/$/, '')
    if (source.ref !== undefined) { if (typeof source.ref !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/.test(source.ref)) return; ref = source.ref }
    if (source.sha !== undefined) { if (typeof source.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(source.sha)) return; ref = source.sha }
  } else return
  if (!REPO.test(repo) || repo.endsWith('.git') || !validPackagePath(path) || path.split('/').length > 12) return
  return { repo, path, ref }
}
