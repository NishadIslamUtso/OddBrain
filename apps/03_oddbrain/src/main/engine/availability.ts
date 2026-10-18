/**
 * availability.ts — what is really on this machine, and whose brains are whose.
 *
 * Two promises live here. First, the engine bay never shows a pickable lie:
 * an engine that is not installed is shown as not installed, with the one
 * command that fixes it. Second, each engine's model list comes from its own
 * true source — Claude Code's brains come from the owner's door (Ollama),
 * because Claude Code reads its brain from the door; agy's brains come from
 * Google and only Google, so until agy has been installed and signed in on
 * this machine, the app says exactly that instead of inventing entries.
 *
 * Detection runs the engine's `--version` once and caches briefly: launching
 * a CLI is cheap, but launching it on every redraw is not.
 */
import { execFile } from 'node:child_process'
import { engineCandidates, enginePathSync, shellSafeCommand } from './enginePath'
import { existsSync } from 'node:fs'
import type { EngineAvailability, EngineId } from '../../shared/lib/engine'

const INSTALL_HINT: Record<EngineId, string> = {
  'claude-code':
    'Install it once in PowerShell: npm install -g @anthropic-ai/claude-code, then fully quit and reopen OddBrain.',
  agy: 'Install it from google-antigravity/antigravity-cli (antigravity.google), beware fake "gemini-antigravity-cli" repos that hand out exe files.',
}

/** True when the version answer looks like the engine talking, not an error page. */
const plausibleVersion = (text: string): boolean => text.trim().length > 0 && text.length < 200

/** Known absolute install spots, probed when the PATH lookup fails. */
export function defaultCandidates(id: EngineId, env: NodeJS.ProcessEnv = process.env): string[] {
  return engineCandidates(id, env)
}

/**
 * Ask one engine binary whether it exists. Injected runner for tests: in
 * production this is execFile, with the shell on Windows because the engines
 * live behind npm `.cmd` shims there.
 */
export function checkBinary(
  command: string,
  id: EngineId,
  options: {
    runner?: (
      command: string,
      args: string[],
      onDone: (error: unknown, stdout: string) => void,
    ) => void
    timeoutMs?: number
    /** Which of the known install spots exist — a test seam over existsSync. */
    exists?: (path: string) => boolean
    /** The absolute spots to probe — a test seam over defaultCandidates. */
    candidates?: string[]
  } = {},
): Promise<EngineAvailability> {
  const run =
    options.runner ??
    ((cmd: string, args: string[], onDone: (error: unknown, stdout: string) => void) => {
      execFile(cmd, args, { shell: process.platform === 'win32', timeout: options.timeoutMs ?? 4000, env: { ...process.env, PATH: enginePathSync() } }, (error, stdout) =>
        onDone(error, typeof stdout === 'string' ? stdout : ''),
      )
    })
  const exists = options.exists ?? ((p: string) => { try { return existsSync(p) } catch { return false } })
  const candidates = (options.candidates ?? defaultCandidates(id)).filter(exists)
  return new Promise((resolve) => {
    run(shellSafeCommand(command), ['--version'], (error, stdout) => {
      if (!error && plausibleVersion(stdout)) {
        resolve({ id, found: true, version: stdout.trim().split('\n')[0].slice(0, 80), path: command, install: INSTALL_HINT[id] })
        return
      }
      // The PATH answer failed. Before declaring the engine missing, probe
      // the known install spots by absolute path — the real machine staged
      // engines while the shell PATH snapshot was still stale, and bare-name
      // spawns answered with "'agy' is not recognized".
      const probeNext = (index: number): void => {
        if (index >= candidates.length) {
          resolve({ id, found: false, version: '', install: INSTALL_HINT[id] })
          return
        }
        run(shellSafeCommand(candidates[index]), ['--version'], (probeError, probeOut) => {
          if (!probeError && plausibleVersion(probeOut)) {
            resolve({
              id,
              found: true,
              version: probeOut.trim().split('\n')[0].slice(0, 80),
              path: candidates[index],
              install: INSTALL_HINT[id],
            })
            return
          }
          probeNext(index + 1)
        })
      }
      probeNext(0)
    })
  })
}

const CACHE_MS = 30_000
const cache = new Map<EngineId, { at: number; answer: EngineAvailability }>()

/** Cached once per short window so the bay can ask on every open. */
/** `fresh` skips the cache — the bay's Re-scan after you installed something. */
export async function detectEngine(id: EngineId, fresh = false): Promise<EngineAvailability> {
  const hit = cache.get(id)
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.answer
  const answer = await checkBinary(id === 'agy' ? 'agy' : 'claude', id)
  cache.set(id, { at: Date.now(), answer })
  return answer
}

/**
 * The model sources, one per engine — the routing table behind
 * `engine:models`. Claude Code reads its brains from the owner's door; agy
 * answers only to Google. A third engine adds one entry here.
 */
export type ModelSource = {
  /** The brains this engine can really use, from its own source. */
  models(): Promise<{ ok: boolean; models: Array<{ name: string; cloud: boolean; sizeGB: number | null }>; error?: string }>
}

export function agyModelSource(installed: boolean): ModelSource {
  return {
    async models() {
      if (!installed) {
        return {
          ok: false,
          models: [],
          error:
            'agy is not on this machine. Install and sign in to use its own default model. This app has no verified agy model-list adapter; there is no custom door for Ollama models.',
        }
      }
      return {
        ok: false,
        models: [],
        error:
          'agy is installed, but this app has no verified agy model-list adapter. Sign in with agy in your terminal and use the engine’s own default model. Refreshing here will not discover a catalog; Ollama models cannot be used through agy.',
      }
    },
  }
}
