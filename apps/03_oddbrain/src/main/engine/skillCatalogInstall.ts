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
