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
  /** For kind 'page': the official page to open by hand. */
  page?: string
}

export const ENGINE_DOWNLOADS: Record<string, EngineDownloadInfo | undefined> = {
  'claude-code': {
    windows: 'https://claude.ai/install.ps1',
    kind: 'installer-script',
    host: 'claude.ai',
    redirectHosts: ['downloads.claude.ai'],
    note: 'Anthropic\u2019s own native installer script. Needs no Node. The app stages it, and running it is a separate permission.',
  },
  ollama: {
    windows: 'https://ollama.com/download/ollama-windows-amd64.zip',
    kind: 'zip',
    host: 'ollama.com',
    redirectHosts: ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'],  // verified live 2026-10-17: ollama.com -> github.com/... /releases/download/vX -> release-assets.githubusercontent.com -> 200
    note: 'The headless runtime only, from ollama.com\u2019s own zip. No desktop app, no tray, nothing autostarts: start and stop it right here — or run your own Ollama and leave this staged copy alone.',
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

/**
 * The unpack caps for an engine RUNTIME zip — the official Ollama Windows
 * archive, measured 2026-10-17: 1.47 GB compressed, 87 entries, 1.94 GB
 * unpacked, biggest single file 692 MB (`lib/ollama/cuda_v12/cublasLt64_12.dll`).
 *
 * `unzipArchive`'s own defaults are pack-sized (200 files / 200 MB per file /
 * 400 MB total) because a theme or skill pack should never be that big, and a
 * pack that is means something is wrong. Those defaults are RIGHT for packs and
 * WRONG for a runtime: with them the app downloaded the official archive in
 * full and then refused to unpack it, blaming the publisher for its own cap.
 *
 * So the runtime gets its own numbers, sized from the real file with headroom,
 * and still bounded: a hostile archive is refused at 4 GB unpacked, not after
 * it has filled the disk. Pack downloads keep the strict defaults.
 */
export const RUNTIME_ZIP_LIMITS = {
  files: 512,
  perFile: 1_500 * 1024 * 1024,
  totalUncompressed: 4 * 1024 * 1024 * 1024,
} as const

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
