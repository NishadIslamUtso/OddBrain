/**
 * The engine's own sign-in state, asked rather than assumed.
 *
 * Claude Code answers `claude auth status` with a small JSON object (on stderr
 * in 2.1.302); that is the only honest source for "is this machine signed in?"
 * — checking for a credentials file would be guessing at an implementation
 * detail. agy has no
 * such command here, and the app says that instead of painting a green dot.
 *
 * Nothing secret is read or returned: the command's own words say whether a
 * login exists, which method it uses, and where the config lives.
 */
import { execFile, spawn } from 'node:child_process'
import { enginePathSync, resolveEngineCommand, shellSafeCommand } from './enginePath'

export type AuthStatusAnswer = {
  ok: boolean
  loggedIn: boolean
  method: string
  provider: string
  answer: string
}

/** The JSON Claude Code prints, read defensively. Null when it is not that. */
export function parseClaudeAuth(raw: string): { loggedIn: boolean; method: string; provider: string } | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || typeof value !== 'object' || typeof value.loggedIn !== 'boolean') return null
    return {
      loggedIn: value.loggedIn,
      method: typeof value.authMethod === 'string' ? value.authMethod : '',
      provider: typeof value.apiProvider === 'string' ? value.apiProvider : '',
    }
  } catch {
    return null
  }
}

/** The sentence a person reads, built from the CLI's own answer. */
export function authSentence(status: { loggedIn: boolean; method: string; provider: string }): string {
  if (!status.loggedIn) return 'Not signed in. Run `claude` once in a terminal, finish the login, then check again.'
  const method = status.method && status.method !== 'none' ? status.method : 'a saved login'
  const provider = status.provider ? ` (${status.provider})` : ''
  return `Signed in with ${method}${provider}.`
}

/** The one-step way to let the CLI run its own login, without the app holding a key. */
export type LoginLaunch = { ok: boolean; command: string[]; answer: string }

export function loginLaunch(platform: NodeJS.Platform = process.platform, command = resolveEngineCommand('claude-code')): LoginLaunch {
  if (platform === 'win32') {
    return {
      ok: true,
      // `start` opens a real console; `cmd /k` keeps it open after the login.
      // Everything except the already-resolved executable path is constant.
      command: ['cmd.exe', '/c', 'start', 'OddBrain sign-in', 'cmd.exe', '/k', shellSafeCommand(command, platform)],
      answer: 'A terminal should have opened. Finish the sign-in there; OddBrain never sees the credentials.',
    }
  }
  return {
    ok: false,
    command: [],
    answer: 'Open a terminal and run `claude` to sign in. This app does not run an OAuth flow of its own.',
  }
}

/**
 * Start the CLI's own login in a terminal the person can see. Only cmd.exe's
 * `start` is spawned, and the engine path is quoted for cmd. Nothing is read
 * back: the credentials stay in the CLI's hands, which is the whole point.
 */
export function openLogin(options: {
  platform?: NodeJS.Platform
  command?: string
  spawnImpl?: typeof spawn
} = {}): { ok: boolean; answer: string } {
  const platform = options.platform ?? process.platform
  const launch = loginLaunch(platform, options.command ?? resolveEngineCommand('claude-code'))
  if (!launch.ok) return { ok: false, answer: launch.answer }
  try {
    const child = (options.spawnImpl ?? spawn)(launch.command[0], launch.command.slice(1), {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.on('error', () => undefined)
    child.unref()
    return { ok: true, answer: launch.answer }
  } catch {
    return { ok: false, answer: 'The terminal could not be opened. Run `claude` yourself; nothing was changed.' }
  }
}

export type AuthRunner = (command: string, args: string[], done: (error: unknown, stdout: string, stderr: string) => void) => void

/**
 * Ask one engine. Injected runner keeps this testable; production uses
 * execFile with the engine's own PATH and the Windows shell for npm shims.
 */
export function readAuthStatus(
  id: 'claude-code' | 'agy',
  options: { runner?: AuthRunner; timeoutMs?: number; command?: string; platform?: NodeJS.Platform } = {},
): Promise<AuthStatusAnswer> {
  if (id === 'agy') {
    return Promise.resolve({
      ok: false,
      loggedIn: false,
      method: '',
      provider: '',
      answer: 'agy does not report a sign-in state to other programs. Run `agy` once in a terminal; its credentials stay with it.',
    })
  }
  const platform = options.platform ?? process.platform
  const run = options.runner ?? ((command, args, done) => {
    execFile(
      command,
      args,
      { shell: platform === 'win32', timeout: options.timeoutMs ?? 8000, env: { ...process.env, PATH: enginePathSync() } },
      (error, stdout, stderr) => done(error, typeof stdout === 'string' ? stdout : '', typeof stderr === 'string' ? stderr : ''),
    )
  })
  const command = options.command ?? resolveEngineCommand('claude-code')
  return new Promise((resolve) => {
    run(shellSafeCommand(command, platform), ['auth', 'status'], (error, stdout, stderr) => {
      // The CLI prints this JSON on stderr (verified against 2.1.302), so both
      // streams are read. A parsed answer is the answer even when the exit code
      // is noisy; only unparseable output is a failed question.
      const parsed = parseClaudeAuth(stdout) ?? parseClaudeAuth(stderr)
      if (parsed) {
        resolve({ ok: true, ...parsed, answer: authSentence(parsed) })
        return
      }
      const detail = String(stderr || stdout || (error as Error | undefined)?.message || '').trim().slice(-300)
      resolve({
        ok: false,
        loggedIn: false,
        method: '',
        provider: '',
        answer: detail
          ? `Claude Code did not answer its sign-in question: ${detail}`
          : 'Claude Code did not answer its sign-in question. Is it installed?',
      })
    })
  })
}
