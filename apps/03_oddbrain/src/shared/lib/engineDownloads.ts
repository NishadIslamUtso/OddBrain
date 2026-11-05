/**
 * Bringing a brain home, the app's way.
 *
 * His decision (2026-10-16): the trio is downloaded INSIDE the app, into
 * locations under the app's control — never bundled in the installer, never
 * scattered machine-wide by us. Every endpoint here is OFFICIAL and exact;
 * a URL that is not on this list is refused by code, not by promise. Google
 * has no stable, verifiable direct endpoint for agy yet, so agy honestly
 * links its official page instead of pretending — that refusal is data too.
 */

export type EngineDownloadKind = 'zip' | 'installer-script' | 'page'

export type EngineDownloadInfo = {
  /** The exact official endpoint for Windows, the machine he runs. */
  windows: string
  kind: EngineDownloadKind
  /** The only host a download for this engine may start from. */
  host: string
  /**
   * Hosts the official endpoint itself may hand us to. Publishers redirect —
   * claude.ai sends the script from downloads.claude.ai, ollama.com sends the
   * zip from its GitHub releases — and refusing their own redirects broke the
   * door. Every hop must still be on THIS list, by parsed host, or refused.
   */
  redirectHosts?: readonly string[]
  /** What the card says before any byte moves. */
  note: string
  /** Compile-time SHA-256 pin for every executable archive the app accepts. */
  sha256?: string
  /** For kind 'page': the official page to open by hand. */
  page?: string
}

export const ENGINE_DOWNLOADS: Record<string, EngineDownloadInfo | undefined> = {
  'claude-code': {
    windows: '',
    kind: 'page',
    host: 'github.com',
    page: 'https://github.com/anthropics/claude-code/releases/latest',
    note: 'Anthropic publishes signed checksum metadata with versioned native releases, but OddBrain does not yet verify that signature chain locally. Install from the official release page; the app will not stage a changing bootstrap script as trusted code.',
  },
  ollama: {
    // Version and digest are updated together. A moving “latest” URL is not an
    // executable identity and is therefore not accepted by the app.
    windows: 'https://github.com/ollama/ollama/releases/download/v0.40.7/ollama-windows-amd64.zip',
    kind: 'zip',
    host: 'github.com',
    redirectHosts: ['objects.githubusercontent.com', 'release-assets.githubusercontent.com'],
    sha256: 'e6527768c53e85ec4596495fb0f035ef07f437b4b591ebc3581684699a4668f4',
    note: 'Pinned Ollama v0.40.7 headless Windows runtime. OddBrain verifies the compile-time SHA-256 before unpacking; no desktop app, tray or autostart is added.',
  },
  agy: {
    windows: '',
    kind: 'page',
    host: 'antigravity.google',
    page: 'https://antigravity.google',
    note: 'Google\u2019s official page (the CLI is the thing, not the IDE). On macOS/Linux the official installer is antigravity.google/cli/install.sh — verified live; on Windows the page points at the official installer. Never an invented URL.',
  },
}

/** True only for the exact official https URL of this engine. */
export function isOfficialUrl(engine: string, url: string): boolean {
  const info = ENGINE_DOWNLOADS[engine]
  if (!info) return false
  if (info.kind === 'page') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.host === info.host && parsed.href === info.windows
  } catch {
    return false
  }
}

/**
 * True for the official STARTING endpoint or a host the publisher itself
 * redirects to. This — not exact equality — is the rule every redirect hop
 * must pass: the pin follows the publisher, never a stranger.
 */
export function isOfficialDownloadHost(engine: string, url: string): boolean {
  const info = ENGINE_DOWNLOADS[engine]
  if (!info) return false
  if (info.kind === 'page') return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (parsed.username !== '' || parsed.password !== '') return false
    if (parsed.host === info.host) return true
    return (info.redirectHosts ?? []).includes(parsed.host)
  } catch {
    return false
  }
}

/** Nothing gets bigger than this without an honest refusal. The real lesson,
 * from the owner's machine twice: Ollama's Windows installer outgrew the old
 * 400 MB cap, so the app refused the official download forever with a
 * sentence that blamed the publisher. 2.5 GB is still a hard ceiling — the
 * point of the cap is a hostile offer, not a big honest one. */
export const MAX_DOWNLOAD_BYTES = 2_500 * 1024 * 1024

/** Bytes as a human reads them, for the refusals and progress lines. */
export function humanBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${Math.round((n / (1024 * 1024 * 1024)) * 10) / 10} GB`
  return `${Math.round(n / (1024 * 1024))} MB`
}

/** Pull a 64-hex digest out of a published checksum file, if one is there. */
export function parseShaLine(text: string): string {
  const match = /\b([a-f0-9]{64})\b/.exec(text ?? '')
  return match ? match[1] : ''
}

/** Where the app keeps what it brought home. One folder per engine, app-owned. */
export function enginesRoot(base: string): string {
  return `${base}/engines`
}
