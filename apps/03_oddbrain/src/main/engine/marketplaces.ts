/**
 * Engine marketplaces, asked honestly.
 *
 * The design (00_LIVING_DOCS/ENGINE-STORES-DESIGN.md) says an engine installs
 * its own things through its own command, and that the command surface is
 * unproven until it is asked. So this module ASKS: it runs the engine's own
 * help output and reports what that build documents. It never invents a
 * subcommand, never writes a catalog of its own, and never installs anything.
 *
 * A probe is read-only: one process, a help flag, a short timeout. Install is
 * a separate, carded act that runs the engine's own documented command and
 * returns the engine's own words.
 */
import { spawn } from 'node:child_process'

export type MarketplaceState = 'supported' | 'unsupported' | 'not-installed' | 'no-answer'

export type MarketplaceProbe = {
  engine: 'claude-code' | 'agy'
  state: MarketplaceState
  /** What the engine said, trimmed. Shown as-is; never paraphrased into a claim. */
  answer: string
  /** Subcommands this build's own help text lists. Empty unless supported. */
  commands: string[]
  checkedAt: string
}

type Runner = (file: string, args: string[], timeoutMs: number, shell?: boolean) => Promise<{ code: number | null; stdout: string; stderr: string; failed?: boolean }>

export const defaultRunner: Runner = (file, args, timeoutMs, shell = false) =>
  new Promise((resolve) => {
    let settled = false
    const finish = (answer: { code: number | null; stdout: string; stderr: string; failed?: boolean }): void => {
      if (settled) return
      settled = true
      resolve(answer)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(file, args, { windowsHide: true, shell })
    } catch (error) {
      finish({ code: null, stdout: '', stderr: (error as Error).message, failed: true })
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* already gone */ }
      finish({ code: null, stdout, stderr: stderr || 'The engine did not answer in time.', failed: true })
    }, timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8').slice(0, 20_000) })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8').slice(0, 20_000) })
    child.on('error', (error: Error) => { clearTimeout(timer); finish({ code: null, stdout, stderr: error.message, failed: true }) })
    child.on('close', (code: number | null) => { clearTimeout(timer); finish({ code, stdout, stderr }) })
  })

/** The subcommands a help text documents for the marketplace command. */
export function documentedCommands(help: string): string[] {
  const found = new Set<string>()
  for (const name of ['add', 'list', 'remove', 'update', 'install', 'browse']) {
    // A line that starts with the word, or lists it after a bullet/space —
    // the shapes real help output uses. A mention inside prose does not count.
    const pattern = new RegExp(`(^|\\n)\\s*(?:[-*·]\\s*)?${name}\\b`, 'i')
    if (pattern.test(help)) found.add(name)
  }
  return [...found]
}

/**
 * One probe per engine process. It asks the engine's own help, because a
 * version string is not a promise that a subcommand exists.
 */
export async function probeMarketplace(
  engine: 'claude-code' | 'agy',
  binary: string | null,
  run: Runner = defaultRunner,
): Promise<MarketplaceProbe> {
  const checkedAt = new Date().toISOString()
  if (!binary) {
    return {
      engine,
      state: 'not-installed',
      answer: engine === 'claude-code'
        ? 'Claude Code is not installed yet. Install it first, then ask again.'
        : 'agy is not installed yet. Install it first, then ask again.',
      commands: [],
      checkedAt,
    }
  }
  const answer = await run(binary, ['plugin', 'marketplace', '--help'], 6_000)
  const text = `${answer.stdout}\n${answer.stderr}`.trim()
  if (answer.failed) {
    return {
      engine,
      state: 'no-answer',
      answer: `The engine could not be asked: ${text || 'no output'}`,
      commands: [],
      checkedAt,
    }
  }
  const commands = answer.code === 0 ? documentedCommands(text) : []
  if (commands.length) {
    return {
      engine,
      state: 'supported',
      answer: text.slice(0, 900),
      commands,
      checkedAt,
    }
  }
  // Exit non-zero, or help that documents nothing: this build does not have it.
  const unknown = /unknown command|unrecognized|not a .*command|no such command/i.test(text)
  return {
    engine,
    state: 'unsupported',
    answer: unknown
      ? `This build does not answer "plugin marketplace". Its own words: ${text.slice(0, 400)}`
      : `This build did not document any "plugin marketplace" subcommand. Its own words: ${text.slice(0, 400) || '(no output)'}`,
    commands: [],
    checkedAt,
  }
}

/** Run the engine's own documented command, verbatim, and return its words. */
export async function runMarketplaceAdd(
  engine: 'claude-code' | 'agy',
  binary: string,
  locator: string,
  run: Runner = defaultRunner,
): Promise<{ ok: boolean; answer: string; command: string[] }> {
  const args = marketplaceAddCommand(engine, locator)
  if (!args) return { ok: false, answer: 'That entry cannot be turned into a command this app will run.', command: [] }
  // Windows engines live behind npm .cmd shims, so the runner uses the shell
  // there — the same rule the rest of the app's engine launching follows.
  const result = await run(binary, args, 120_000, process.platform === 'win32')
  const text = `${result.stdout}\n${result.stderr}`.trim()
  return {
    ok: result.code === 0,
    answer: text || (result.code === 0 ? 'The engine accepted the marketplace.' : `The engine refused it (exit ${result.code ?? 'unknown'}).`),
    command: [binary, ...args],
  }
}

/** The exact command a marketplace install would run — shown before it runs. */
export function marketplaceAddCommand(engine: 'claude-code' | 'agy', locator: string): string[] | null {
  if (!locator.trim() || /[\r\n]/.test(locator)) return null
  if (engine === 'claude-code') return ['plugin', 'marketplace', 'add', locator.trim()]
  // agy has no documented marketplace surface until Google ships one; when it
  // does, this is the one line that changes.
  return null
}
