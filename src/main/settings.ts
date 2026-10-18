/**
 * The app's own settings, in one small JSON file beside the app's data.
 *
 * Small on purpose: this file holds only what has to be known *before* the
 * interface exists — where the vault is — and nothing else. Preferences that only
 * the interface cares about stay in the interface, so this remains something a
 * person can open and read without a manual.
 *
 * The reader never throws. An unreadable or damaged file means "nothing chosen
 * yet", because a lost preference must never cost somebody a launch.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_PERMISSIONS, normalizePermissions, type Permissions } from '../shared/lib/permissions'
import { DEFAULT_ENGINE, normalizeEngine, type EngineSettings } from '../shared/lib/engine'

export type AppSettings = {
  /** Optional explicit memory directory, chosen only by the native picker. */
  memoryFolder?: string
  /**
   * The vault the user chose. Empty means "work it out from the checkout and the
   * environment", which is what a fresh install or a fresh clone does.
   */
  vaultPath: string
  /**
   * The custom OpenAI-compatible endpoint: a self-hosted server, a gateway, or a
   * provider this app ships no default for. Not secret, so it lives here rather
   * than with the keys — a person can read and edit it.
   */
  cloud: { baseUrl: string; model: string }
  /**
   * What each agent is allowed to do — see shared/lib/permissions.ts. Read and
   * written here because the main process is what enforces them, and the window
   * is told the result rather than deciding for itself.
   */
  permissions: Permissions
  /**
   * Which engine thinks inside the app and with which brain. Lives with the
   * other before-the-interface facts: the engine is launched by this process,
   * so this process is the one that must know.
   */
  engine: EngineSettings
}

export const EMPTY_SETTINGS: AppSettings = {
  vaultPath: '',
  cloud: { baseUrl: '', model: '' },
  permissions: DEFAULT_PERMISSIONS,
  engine: { ...DEFAULT_ENGINE },
}

export function readSettings(file: string): AppSettings {
  try {
    if (!existsSync(file)) return { ...EMPTY_SETTINGS }
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const cloud = (parsed.cloud && typeof parsed.cloud === 'object' ? parsed.cloud : {}) as Record<string, unknown>
    const text = (value: unknown, limit: number): string =>
      typeof value === 'string' ? value.trim().slice(0, limit) : ''
    return {
      vaultPath:
        typeof parsed.vaultPath === 'string' && parsed.vaultPath.length <= 4096 ? parsed.vaultPath : '',
      cloud: {
        baseUrl: text(cloud.baseUrl, 2048),
        model: text(cloud.model, 300),
      },
      ...(typeof parsed.memoryFolder === 'string' && parsed.memoryFolder.length <= 4096 && !/[\r\n]/.test(parsed.memoryFolder) ? { memoryFolder: parsed.memoryFolder } : {}),
      permissions: normalizePermissions(parsed.permissions),
      engine: normalizeEngine(parsed.engine),
    }
  } catch {
    return { ...EMPTY_SETTINGS }
  }
}

export function writeSettings(file: string, settings: AppSettings): AppSettings {
  const cloud = settings.cloud || { baseUrl: '', model: '' }
  const clean: AppSettings = {
    vaultPath: typeof settings.vaultPath === 'string' ? settings.vaultPath.trim().slice(0, 4096) : '',
    cloud: {
      baseUrl: String(cloud.baseUrl || '').trim().slice(0, 2048),
      model: String(cloud.model || '').trim().slice(0, 300),
    },
    ...(typeof settings.memoryFolder === 'string' && settings.memoryFolder && settings.memoryFolder.length <= 4096 && !/[\r\n]/.test(settings.memoryFolder) ? { memoryFolder: settings.memoryFolder } : {}),
    permissions: normalizePermissions(settings.permissions),
    engine: normalizeEngine(settings.engine),
  }
  mkdirSync(dirname(file), { recursive: true })
  // Write beside the file and rename over it: a crash mid-write cannot leave a
  // half-written settings file for the next launch to guess at.
  const temporary = `${file}.tmp`
  writeFileSync(temporary, `${JSON.stringify(clean, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
  return clean
}

/**
 * Where to look for the vault, in order.
 *
 * A folder chosen in Settings is a decision, so it is the ONLY candidate: if it
 * has gone missing, the app says so rather than quietly keeping notes in some
 * other vault. Everything after that order is for a fresh install, where nobody
 * has decided anything yet — an environment variable, then this user's app data
 * folder. There is no vault checked into the repository: a sample notebook is
 * not the person's notebook.
 */
export function vaultCandidates(input: {
  chosen: string
  env?: Record<string, string | undefined>
  userData?: string
}): string[] {
  const chosen = String(input.chosen || '').trim()
  if (chosen) return [chosen]
  const env = input.env || {}
  return [
    env.AI_ASSISTANT_VAULT || '',
    env.AI_BRAIN_VAULT || '',
    env.AI_BRAIN_PATH || '',
    input.userData || '',
  ]
}

/**
 * Why this folder cannot be used as a vault — or '' when it can.
 *
 * It only ever *reads*: no folder is created here. Pointing the app at a folder
 * is the user's decision, and quietly making one for them is how somebody ends up
 * with a second, empty vault and no idea which one their notes went into.
 */
export function folderProblem(folder: string): string {
  const value = String(folder || '').trim()
  if (!value) return 'Choose a folder first.'
  if (!existsSync(value)) return 'That folder is not there. Nothing was created for you.'
  try {
    if (!statSync(value).isDirectory()) return 'That path is a file, not a folder.'
  } catch {
    return 'That folder could not be read.'
  }
  return ''
}
