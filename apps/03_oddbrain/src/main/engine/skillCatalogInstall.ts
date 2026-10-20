import { randomUUID } from 'node:crypto'
/**
 * Installing a catalog skill, in one testable piece.
 *
 * The name must be in the app's curated catalog. The downloader resolves the
 * repository branch to an immutable commit, fetches one bounded archive, and
 * extracts only that skill's complete directory. This matters: current skills
 * include scripts, references, examples, assets and license files; copying only
 * SKILL.md creates instructions that point at files which do not exist.
 */
import { catalogEntry, type CatalogSkill } from '../../shared/lib/skillCatalog'
import type { VaultSkill } from './deploy'
import { deploySkillBundle, downloadSkillBundle, type SkillBundle } from './skillBundle'

export type CatalogInstallResult =
  | { ok: true; skill: VaultSkill; written: string[]; revision: string }
  | { ok: false; answer: string }

export type SkillBundleLoader = (entry: CatalogSkill, fetchImpl: typeof fetch) => Promise<SkillBundle>

export async function installCatalogSkill(
  name: string,
  targets: { claudeSkillsDir: string; agySkillsDir: string },
  fetchImpl: typeof fetch = fetch,
  loadBundle: SkillBundleLoader = downloadSkillBundle,
): Promise<CatalogInstallResult> {
  const entry = catalogEntry(name)
  if (!entry) return { ok: false, answer: 'That skill is not in the catalog.' }
  let bundle: SkillBundle
  try {
    bundle = await loadBundle(entry, fetchImpl)
  } catch (error) {
    const detail = error instanceof Error ? error.message : ''
    return {
      ok: false,
      answer: detail || 'The catalog could not be reached, are you online?',
    }
  }
  try {
    const result = deploySkillBundle(entry, bundle, targets)
    return { ok: true, ...result, revision: bundle.revision }
  } catch (error) {
    return {
      ok: false,
      answer: error instanceof Error ? error.message : 'The complete skill could not be installed. Nothing is assumed installed.',
    }
  }
}

/** Per-window installation lease: fetch/pin first, then install the exact retained
 * bytes only after approval. No refetch, scripts, or existing-directory replacement. */
export function createCatalogInstallReview(scope: () => { targets: { claudeSkillsDir: string; agySkillsDir: string }; authority: string }, fetchImpl: typeof fetch = fetch, loader: SkillBundleLoader = downloadSkillBundle) {
  const pending = new Map<string, { entry: CatalogSkill; bundle: SkillBundle; authority: string; targets: { claudeSkillsDir: string; agySkillsDir: string }; expiresAt: number }>()
  let controller = new AbortController(), loading = false
  return {
    cancel() { controller.abort(); controller = new AbortController(); pending.clear() },
    async plan(name: string) {
      const entry = catalogEntry(name)
      if (!entry) throw Error('That skill is not in this catalog.')
      for (const [id, value] of pending) if (value.expiresAt <= Date.now()) pending.delete(id)
      if (loading || pending.size >= 3) throw Error('Finish or deny the pending skill inspections first.')
      const snapshot = scope(), signal = controller.signal
      loading = true
      try {
        const transport: typeof fetch = (url, options = {}) => fetchImpl(url, { ...options, signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal })
        const received = await loader(entry, transport)
        const bundle: SkillBundle = { ...received, files: new Map([...received.files].map(([path, bytes]) => [path, Buffer.from(bytes)])) }
        if (signal.aborted || scope().authority !== snapshot.authority) throw Error('Skill inspection canceled or the destination changed. Nothing was installed.')
        const manifest = new TextDecoder('utf-8', { fatal: true }).decode(bundle.files.get('SKILL.md') || new Uint8Array())
        const requirements: Array<{ path: string; text: string }> = [], unread: string[] = []
        let inspectedBytes = 0
        for (const [path, bytes] of bundle.files) if (/(^|\/)(package\.json|requirements(?:[-.]\w+)?\.txt|pyproject\.toml)$/.test(path)) {
          if (bytes.length > 128_000 || inspectedBytes + bytes.length > 256_000) { unread.push(`${path}: not read because of the declaration preview limit`); continue }
          requirements.push({ path, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }); inspectedBytes += bytes.length
        }
        const token = randomUUID(), expiresAt = Date.now() + 120_000
        pending.set(token, { entry, bundle, authority: snapshot.authority, targets: { ...snapshot.targets }, expiresAt })
        return { token, expiresAt, requirements, unread, name: entry.name, revision: bundle.revision, files: [...bundle.files.keys()], manifest, destinations: [snapshot.targets.claudeSkillsDir, snapshot.targets.agySkillsDir],
          notice: 'Read the complete manifest and file inventory before installing. Support files and licenses are preserved. No scripts run here, but future native tasks may invoke them. File presence does not prove dependencies, portability, loading, authentication or successful use.' + (Buffer.byteLength(manifest) > 24_000 ? ' This manifest exceeds agy’s documented 24 KB skill size; native coverage may be limited even though the original file is preserved.' : '') }
      } finally { loading = false }
    },
    decide(token: string, decision: 'allow' | 'deny'): { ok: boolean; answer: string } {
      const plan = pending.get(token); pending.delete(token)
      if (!plan || plan.expiresAt <= Date.now()) return { ok: false, answer: 'The skill review expired or was already used.' }
      if (decision === 'deny') return { ok: true, answer: 'Denied. No skill files were installed.' }
      try {
        const current = scope()
        if (decision !== 'allow' || current.authority !== plan.authority || JSON.stringify(current.targets) !== JSON.stringify(plan.targets)) throw Error('The destination or permissions changed. Review again; nothing was installed.')
        const result = deploySkillBundle(plan.entry, plan.bundle, current.targets)
        return { ok: true, answer: `Installed ${result.written.length} files from revision ${plan.bundle.revision}. Existing skills were not replaced. Native loading and use remain unverified.` }
      } catch (error) { return { ok: false, answer: (error as Error).message } }
    },
  }
}
