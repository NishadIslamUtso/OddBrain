import { boundedResponse } from '../network/boundedResponse'
/**
 * Which Ollama is answering, and whether it is new enough.
 *
 * Claude Code reaches local brains through Ollama's Anthropic-compatible door,
 * which arrived in 0.14.0. The app cannot make an older runtime understand
 * that protocol, so it asks the door its version and says the true thing:
 * good, old, or not there.
 */
export const OLLAMA_ANTHROPIC_MIN = '0.14.0'

/** Numeric parts of a version, ignoring a leading v and any pre-release tail. */
export function versionParts(version: string): number[] | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(version ?? '').trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a)
  const right = versionParts(b)
  if (!left || !right) return 0
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

export function ollamaAnswer(version: string): { compatible: boolean; answer: string } {
  const compatible = Boolean(versionParts(version)) && compareVersions(version, OLLAMA_ANTHROPIC_MIN) >= 0
  return {
    compatible,
    answer: compatible
      ? `Ollama ${version} is new enough for Claude Code's local brain door.`
      : `Ollama ${version || 'unknown'} is older than ${OLLAMA_ANTHROPIC_MIN}. Claude Code needs 0.14 or newer to use local models; update Ollama.`,
  }
}

export type OllamaVersionAnswer = { ok: boolean; version: string; compatible: boolean; answer: string }

export async function readOllamaVersion(
  options: { fetchImpl?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {},
): Promise<OllamaVersionAnswer> {
  const base = (options.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  try {
    const response = await (options.fetchImpl || fetch)(`${base}/api/version`, { redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 3000) })
    if (!response.ok) return { ok: false, version: '', compatible: false, answer: `${base} answered ${response.status} when asked its version.` }
    const data = (JSON.parse(await boundedResponse(response, 64_000))) as { version?: unknown }
    const version = typeof data.version === 'string' ? data.version : ''
    if (!version) return { ok: false, version: '', compatible: false, answer: `${base} did not say which version it is.` }
    return { ok: true, version, ...ollamaAnswer(version) }
  } catch {
    return { ok: false, version: '', compatible: false, answer: `No Ollama is answering at ${base}.` }
  }
}
