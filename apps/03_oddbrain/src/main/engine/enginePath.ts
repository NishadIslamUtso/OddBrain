/**
 * The machine's REAL PATH, for finding the engines.
 *
 * A launched app inherits a slim PATH; the owner's shell knows much more
 * (winget, Chocolatey, scoop, a custom npm prefix, a portable claude.exe).
 * The old fix prepended two guessed Windows folders and hoped. The honest
 * fix, learned from Claude Desktop's shell-path worker: ASK THE SHELL once
 * at startup, merge, cache, and fall back to the old prepend list when the
 * shell cannot be reached. Pure local; nothing leaves the machine.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The folders the app has always prepended — now the FALLBACK, not the whole answer.
 *  (Kept under its old name too: the pinned contract does not move.) */
export const enginePathPrepend = fallbackPrepend

export function fallbackPrepend(platform = process.platform, env = process.env): string[] {
  if (platform === 'win32') {
    const appData = env['APPDATA'] ?? ''
    const userProfile = env['USERPROFILE'] ?? ''
    return [
      appData ? join(appData, 'npm') : '',
      userProfile ? join(userProfile, '.local', 'bin') : '',
    ].filter(Boolean)
  }
  // The platform argument names the dialect: a POSIX entry must be POSIX
  // even when the host joining it is Windows (a backslash inside a POSIX
  // PATH list is not a path, it is a mistake).
  const home = env['HOME'] ?? ''
  return [home ? `${home}/.local/bin` : ''].filter(Boolean)
}

/**
 * Merge PATH entries: the app's folders FIRST (they must shadow whatever a
 * stale machine PATH carries), then the shell's, then the inherited env's —
 * case-insensitively de-duplicated on Windows, exactly on the rest.
 */
export function mergePath(appFolders: readonly string[], shellPath: string, currentPath: string, platform = process.platform): string {
  const sep = platform === 'win32' ? ';' : ':'
  const seen = new Set<string>()
  const parts: string[] = []
  for (const entry of [...appFolders, ...shellPath.split(sep), ...currentPath.split(sep)]) {
    const key = platform === 'win32' ? entry.toLowerCase() : entry
    const trimmed = entry.trim()
    if (!trimmed) continue
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(trimmed)
  }
  return parts.join(sep)
}

export type ShellRunner = (command: string, args: string[], onDone: (error: unknown, stdout: string) => void) => void

const DEFAULT_RUNNER: ShellRunner = (command, args, onDone) => {
  execFile(command, args, { timeout: 4000, windowsHide: true }, (error, stdout) =>
    onDone(error, typeof stdout === 'string' ? stdout : ''),
  )
}

/**
 * Ask the user's own shell what PATH it really has. One probe, 4 s budget,
 * and any failure returns null — the caller falls back, never blocks.
 */
export async function askShellPath(platform = process.platform, env = process.env, runner: ShellRunner = DEFAULT_RUNNER): Promise<string | null> {
  if (platform === 'win32') {
    // The registry truth (Machine + User), not the launched app's slim copy.
    const command = env['SystemRoot'] ? join(env['SystemRoot'], 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe'
    return new Promise((resolve) => {
      runner(command, ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')"], (error, stdout) => {
        const text = stdout.trim()
        resolve(!error && text.includes(';') ? text : null)
      })
    })
  }
  const shell = env['SHELL'] || '/bin/bash'
  return new Promise((resolve) => {
    // A login, interactive shell: the one that loads the user's rc files,
    // where nvm/sdk/homebrew exports live. Marker-delimited, so motd noise
    // cannot poison the answer.
    runner(shell, ['-l', '-i', '-c', 'echo "__OB_PATH__$PATH"'], (error, stdout) => {
      const marker = stdout.indexOf('__OB_PATH__')
      if (error || marker === -1) return resolve(null)
      const text = stdout.slice(marker + '__OB_PATH__'.length).trim()
      resolve(text.includes(':') ? text : null)
    })
  })
}

/**
 * Folders this app itself manages engines in. The staged layout is
 * `<root>/<engine-id>/app` with the binary possibly at the root too — the
 * owner's machine put engines there by hand, and the probe list ignored it.
 * Registered at boot from the app's user-data folder; tests register temp
 * dirs through the same door.
 */
const stagingRoots: string[] = []

/** Register one more folder the engine probe should look inside. */
export function registerStagingRoot(dir: string): void {
  if (dir && !stagingRoots.includes(dir)) stagingRoots.push(dir)
}

/** Test seam: forget every registered staging root. */
export function resetStagingRoots(): void {
  stagingRoots.length = 0
}

/**
 * The owner-pointed binaries. "Point to the exe" in Connectors writes here;
 * an override beats every probe — nobody knows where an installer put a
 * binary better than the person who can see the file.
 */
let overrides: Partial<Record<'claude-code' | 'agy', string>> | null = null

/** The owner-pointed binary for one engine, or ''. */
export function binaryOverride(id: 'claude-code' | 'agy'): string {
  return overrides?.[id] ?? ''
}

/** Remember (or clear with '') the owner-pointed binary for one engine. */
export function setBinaryOverride(id: 'claude-code' | 'agy', path: string): void {
  if (!overrides) overrides = {}
  overrides[id] = path
}

/** Test seam. */
export function resetBinaryOverrides(): void {
  overrides = null
}

/** Known absolute install spots on Windows, for probing and for spawning. */
export function engineCandidates(id: 'claude-code' | 'agy', env: NodeJS.ProcessEnv = process.env): string[] {
  const npmDir = env['APPDATA'] ? join(env['APPDATA'], 'npm') : ''
  const localBin = env['USERPROFILE'] ? join(env['USERPROFILE'], '.local', 'bin') : ''
  const programs = env['LOCALAPPDATA'] ? join(env['LOCALAPPDATA'], 'Programs') : ''
  const binary = id === 'claude-code' ? 'claude' : 'agy'
  const override = binaryOverride(id)
  const staged = stagingRoots.flatMap((root) => [
    join(root, id, 'app', `${binary}.exe`),
    join(root, id, 'app', `${binary}.cmd`),
    join(root, id, 'app', binary),
    join(root, id, `${binary}.exe`),
    join(root, id, binary),
  ])
  // Every directory on the PATH (the inherited one; the registry user PATH
  // is merged into it by the boot warm-up) is probed by name — installers
  // drop binaries in folders nobody pre-listed, and agy did exactly that.
  const pathText = env['PATH'] ?? ''
  // Split by the PATH's own shape, not the host OS: a Windows-shaped PATH
  // (`C:\x;C:\y`) can be probed from anywhere (tests, a migrated env).
  const fromPath = pathText
    .split(pathText.includes(';') ? ';' : pathText.includes(':') ? ':' : ';')
    .filter(Boolean)
    .slice(0, 64)
    .flatMap((dir) => [join(dir, `${binary}.exe`), join(dir, `${binary}.cmd`), join(dir, `${binary}.bat`)])
  if (id === 'claude-code') {
    return [
      ...(override ? [override] : []),
      ...staged,
      ...fromPath,
      ...(npmDir ? [join(npmDir, 'claude.cmd'), join(npmDir, 'claude')] : []),
      ...(localBin ? [join(localBin, 'claude.exe'), join(localBin, 'claude')] : []),
    ]
  }
  return [
    ...(override ? [override] : []),
    ...staged,
    ...fromPath,
    ...(localBin ? [join(localBin, 'agy.exe'), join(localBin, 'agy')] : []),
    ...(programs ? [join(programs, 'agy', 'agy.exe')] : []),
  ]
}

/**
 * The command a launch should spawn: an absolute binary when one sits in a
 * known install spot, the bare name otherwise. The owner's machine answered
 * "'agy' is not recognized as an internal or external command" because a
 * bare name only works through a fresh PATH — this makes the spawn work even
 * when the PATH snapshot is one beat behind an install.
 */
export function resolveEngineCommand(id: 'claude-code' | 'agy', env: NodeJS.ProcessEnv = process.env): string {
  kickRefreshIfStale(process.platform, env)
  // The owner's pointer is the first answer — before every probe.
  const pointed = binaryOverride(id)
  if (pointed) return pointed
  for (const candidate of engineCandidates(id, env)) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      /* a hostile path string throws on some platforms — skip it */
    }
  }
  return id === 'claude-code' ? 'claude' : 'agy'
}

/**
 * Quote a command for a Windows shell spawn. The engines launch through the
 * shell there, and an absolute path like
 * `C:\Users\Nishad Islam Utso\.local\bin\claude.exe` dies at the first
 * space unquoted — the owner's own terminal proved it:
 * "Processing -File 'C:\Users\Nishad' failed". A quoted command rides
 * through `cmd /d /s /c` intact. Off Windows the array form needs no
 * quoting and nothing changes.
 */
export function shellSafeCommand(command: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return command
  return /\s/.test(command) ? `"${command}"` : command
}

let cached: string | null = null
let cachedAt = 0
let refreshing = false
const CACHE_MS = 5 * 60_000

/** The PATH the engines spawn with. Resolved once, refreshed every 5 minutes. */
export async function enginePath(platform = process.platform, env = process.env, runner?: ShellRunner): Promise<string> {
  const now = Date.now()
  if (cached && now - cachedAt < CACHE_MS) return cached
  const shell = await askShellPath(platform, env, runner)
  cached = mergePath(fallbackPrepend(platform, env), shell ?? '', env['PATH'] ?? '', platform)
  cachedAt = now
  return cached
}

/** Test seam: forget the cached answer. */
export function resetEnginePathCache(): void {
  cached = null
  cachedAt = 0
  refreshing = false
}

/** Kick a fresh registry+fallback read once the snapshot is past its age. */
function kickRefreshIfStale(platform = process.platform, env = process.env): void {
  if (refreshing) return
  if (cached && Date.now() - cachedAt < CACHE_MS) return
  refreshing = true
  void enginePath(platform, env)
    .catch(() => {})
    .finally(() => {
      refreshing = false
    })
}

/**
 * The sync read for spawn sites that must not await: the cached answer when
 * the app warmed it (it warms at boot), the honest fallback otherwise.
 */
export function enginePathSync(platform = process.platform, env = process.env): string {
  // The real machine caught this: an engine installed after boot stayed
  // invisible because the sync read handed out the boot-time PATH forever.
  // Now a stale snapshot triggers one background refresh, so the next
  // detection or spawn sees the machine as it is now.
  kickRefreshIfStale(platform, env)
  return cached ?? mergePath(fallbackPrepend(platform, env), '', env['PATH'] ?? '', platform)
}
