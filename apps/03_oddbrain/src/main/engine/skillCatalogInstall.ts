/**
 * Installing a catalog skill, in one testable piece.
 *
 * The door in index.ts takes a name; this module does the work: the name must
 * be in the app's own catalog (a door that fetches arbitrary URLs is not a
 * door), the file is fetched from the catalog's source, capped, parsed with
 * the same parser the import path uses, and deployed to every engine's own
 * folder by the same deploySkill Track A already ships.
 */
import { catalogEntry, type CatalogSkill } from '../../shared/lib/skillCatalog'
import { deploySkill, parseSkillMd, type VaultSkill } from './deploy'

export type CatalogInstallResult =
  | { ok: true; skill: VaultSkill; written: string[] }
  | { ok: false; answer: string }

export async function installCatalogSkill(
  name: string,
  targets: { claudeSkillsDir: string; agySkillsDir: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CatalogInstallResult> {
  const entry: CatalogSkill | null = catalogEntry(name)
  if (!entry) return { ok: false, answer: 'That skill is not in the catalog.' }
  let text: string
  try {
    const response = await fetchImpl(entry.source)
    if (!response.ok) return { ok: false, answer: `The catalog answered ${response.status} for ${entry.name}.` }
    text = await response.text()
  } catch {
    return { ok: false, answer: 'The catalog could not be reached, are you online?' }
  }
  if (!text || text.length > 200_000) return { ok: false, answer: 'That skill file is not one this app will install.' }
  const parsed = parseSkillMd(text)
  if (!parsed.name || !parsed.body) return { ok: false, answer: 'That file is not shaped like a skill.' }
  const skill: VaultSkill = {
    name: parsed.name === entry.name ? parsed.name : `${entry.name} (${parsed.name})`,
    description: parsed.description || entry.what,
    body: parsed.body,
  }
  return { ok: true, skill, written: deploySkill({ name: entry.name, description: skill.description, body: skill.body }, targets) }
}
