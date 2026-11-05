import { randomUUID } from 'node:crypto'
/**
 * Two machine-level "keep it running" flags, in one small file the app owns:
 *
 * - loginItem: OddBrain starts when the computer starts (the OS's own
 *   mechanism — app.setLoginItemSettings — not a scheduled task, not a
 *   service; it is the person's Startup list, reversible there too).
 * - warmRuntime: the staged Ollama runtime starts headless with the app, so
 *   the free local brains are warm instead of cold-loading on first ask.
 *
 * Their own file, not the engine settings: these are about the MACHINE, not
 * about a conversation, and a damaged line degrades to "off" — never to a
 * surprise process.
 */
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'

export type AppFlags = { loginItem: boolean; warmRuntime: boolean; keepLoadedAlways: boolean }

export const DEFAULT_FLAGS: AppFlags = { loginItem: false, warmRuntime: false, keepLoadedAlways: false }

export function loadAppFlags(file: string): AppFlags {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppFlags>
    return {
      loginItem: parsed.loginItem === true,
      warmRuntime: parsed.warmRuntime === true,
      keepLoadedAlways: parsed.keepLoadedAlways === true,
    }
  } catch {
    // Missing or damaged = off. A broken flag file must not start processes.
    return { ...DEFAULT_FLAGS }
  }
}

/** Settings must distinguish an unreadable file from an OFF choice. Startup
 * still uses the fail-closed loader above; it must never launch from bad data. */
export function readAppFlagsStrict(file: string): AppFlags {
  let raw: string
  try { raw = readFileSync(file, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_FLAGS }
    throw error
  }
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('The machine settings file is damaged.')
  const result = { ...DEFAULT_FLAGS }
  for (const key of Object.keys(result) as Array<keyof AppFlags>) {
    if (key in parsed && typeof parsed[key] !== 'boolean') throw Error('The machine settings file is damaged.')
    if (key in parsed) result[key] = parsed[key]
  }
  return result
}

export function saveAppFlags(file: string, patch: Partial<AppFlags>): AppFlags {
  const next = readAppFlagsStrict(file)
  for (const key of Object.keys(next) as Array<keyof AppFlags>) if (typeof patch[key] === 'boolean') next[key] = patch[key]!
  const temporary = file + '.next-' + randomUUID()
  try {
    writeFileSync(temporary, JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 })
    renameSync(temporary, file)
    return readAppFlagsStrict(file)
  } finally { rmSync(temporary, { force: true }) }
}

export function flagsExist(file: string): boolean {
  return existsSync(file)
}
