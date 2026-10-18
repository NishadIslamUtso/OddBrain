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
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

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

export function saveAppFlags(file: string, patch: Partial<AppFlags>): AppFlags {
  const next = { ...loadAppFlags(file), ...patch }
  writeFileSync(file, JSON.stringify(next, null, 2))
  return next
}

export function flagsExist(file: string): boolean {
  return existsSync(file)
}
