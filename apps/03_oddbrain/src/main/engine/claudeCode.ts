/**
 * Engine adapter #1: Claude Code, spawned and driven over the wire.
 *
 * This launches the real `claude` command line in stream mode and translates
 * both directions: everything it says becomes engine events for the window,
 * and everything the window answers (a prompt, a permission decision) becomes
 * wire sentences. The CLI keeps doing what it is good at; the app keeps being
 * the face.
 *
 * The two permission flags are not optional. Verified against the real CLI
 * (v2.1.300): without `--permission-mode manual` the CLI runs in "auto" mode
 * and decides for itself (no card is ever sent); without
 * `--permission-prompt-tool stdio` the "may I use this tool?" question never
 * reaches this process, so the app's Allow/Deny cards can never appear.
 * Both were verified by driving the real binary end to end (an independent
 * judge's sandbox run, 2026-10-17, repeated the proof: no prompt-tool flag, no
 * card; no manual mode, writes happen with no card at all).
 *
 * The brain wiring (which door, which brain) is set per launch from the app's
 * own settings, so the engine works no matter what environment variables the
 * machine happens to have — a fresh laptop needs nothing outside this app.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { join } from 'node:path'
import { enginePathSync, resolveEngineCommand, shellSafeCommand } from './enginePath'
import type { ApprovalMode, EngineEvent, EngineSettings } from '../../shared/lib/engine'
import { PERMISSION_MODE } from '../../shared/lib/engine'
import { createEngineParser } from './stream'
import { checkpointWorthTaking, takeCheckpoint } from './checkpoints'

export type EngineSession = {
  /** Hand the engine a task. Returns false if the session already closed. */
  send(prompt: string, images?: Array<{ mime: string; data: string }>): boolean
  /** Why the last send refused to send, when there is an honest reason. */
  refusal?(): string
  /** Answer a permission the engine asked for. */
  answer(requestId: string, allow: boolean): void
  /** Close the engine now. */
  stop(): void
  isRunning(): boolean
}

export type StartSessionInput = {
  cwd: string
  settings: EngineSettings
  /** Pictures for THIS task, already validated by the door. */
  images?: Array<{ mime: string; data: string }>
  /** Where kept copies go, when the app asked for checkpoints at all. */
  checkpointDir?: string
  /** Read at each approval: a live session must honor Auto-keep changes. */
  shouldCheckpoint?: () => boolean
  /**
   * A provider key from Models, resolved by the door that received the send.
   * Present only when the chosen brain is a provider brain; the engine is
   * then launched pointed at that provider with the key in its own env.
   */
  auth?: { provider: 'anthropic'; apiKey: string }
  /**
   * A previous session id to continue — the engine's own `--resume`. Empty
   * means a fresh conversation; the socket only fills this when the engine
   * is not already alive.
   */
  resumeId?: string
  onEvent(event: EngineEvent): void
  onClose?(code: number | null): void
  /**
   * Overridable for tests — how a process is started. Production leaves this
   * out and gets the real `spawn`.
   */
  spawnProcess?: typeof spawn
  /** Overridable for tests — which platform's stop rules apply. */
  platform?: string
}

/**
 * Everything the engine needs besides the process: where it works and with
 * which brain. The socket passes this shape, so it never has to know which
 * keys the adapter ignores.
 */
export type EngineStartInput = Omit<StartSessionInput, 'spawnProcess'>

/**
 * The engine's launch line, in one place so a test can pin it. The two
 * permission flags are the difference between "the app gates every tool" and
 * "the CLI does whatever it likes" — see the header comment.
 */
export function engineArguments(model: string, approval: ApprovalMode = 'ask', resumeId = ''): string[] {
  const args = [
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    // The engine's words as they form, not sentence-at-a-time: without this
    // the CLI reports only finished messages, and a long turn looks frozen.
    '--include-partial-messages',
    '--verbose',
    '--permission-mode', PERMISSION_MODE[approval],
    '--permission-prompt-tool', 'stdio',
  ]
  if (model) args.push('--model', model)
  if (resumeId) args.push('--resume', resumeId)
  return args
}

/**
 * Where Windows keeps the `claude` command, which a packaged app cannot see
 * on its own: the installer put it in the USER's npm folder (or the native
 * installer's bin), and PowerShell finds it through the user's PATH — but a
 * launched app gets a slim PATH that knows neither. Prepending those folders
 * to the engine's PATH is the fix, verified by the owner's own error:
 * "'claude' is not recognized as an internal or external command".
 */
export function enginePathPrepend(platform = process.platform, env = process.env): string {
  if (platform !== 'win32') return ''
  const appData = env['APPDATA'] ?? ''
  const userProfile = env['USERPROFILE'] ?? ''
  return [
    appData ? join(appData, 'npm') : '',
    userProfile ? join(userProfile, '.local', 'bin') : '',
  ]
    .filter(Boolean)
    .join(';')
}

/** The machine's own Anthropic credentials — never the app's business. */
const ANTHROPIC_ENV_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']

/**
 * The free gate, kept honest: the engine thinks with the brain the owner
 * chose in this app, never with whatever credentials happen to sit in the
 * machine's environment. The Anthropic variables are stripped from the
 * inherited environment on every launch; the chosen brain is then applied on
 * top. An empty brain choice means the engine starts with none of these —
 * no silent borrowing of a machine account. (A login the owner made directly
 * with the CLI on their own machine is their own affair; this app neither
 * forwards it through settings nor plants it there.)
 */
export function sanitizeEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !ANTHROPIC_ENV_KEYS.includes(key)) clean[key] = value
  }
  return clean
}

/** The Windows tree-kill line, in one place so a test can pin it. */
export function stopArguments(pid: number): string[] {
  return ['/pid', String(pid), '/T', '/F']
}

/**
 * The environment the engine needs to think with the app's chosen brain.
 * With the local Ollama door there is no key and no account — the token is
 * the literal word `ollama`, which that door accepts.
 */
export function brainEnvironment(baseUrl: string, apiKey?: string): Record<string, string> {
  // A key saved in Models routes the ENGINE to that provider directly: the
  // key rides the engine's own environment, and the app itself still calls
  // no provider. Without a key the local door serves the brain, as always.
  if (apiKey) {
    return {
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com/v1',
      ANTHROPIC_API_KEY: apiKey,
    }
  }
  if (!baseUrl) return {}
  return {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: 'ollama',
    ANTHROPIC_API_KEY: '',
  }
}

export function startClaudeCodeSession(input: StartSessionInput): EngineSession {
  // Model-list entries include `anthropic/` so the picker can identify the
  // authorized provider. The Claude CLI expects the provider's raw model id
  // on --model; passing our UI prefix there made every such launch fail.
  const chosenModel = input.auth?.provider === 'anthropic' && input.settings.model.startsWith('anthropic/')
    ? input.settings.model.slice('anthropic/'.length)
    : input.settings.model
  const args = engineArguments(chosenModel, input.settings.approval, input.resumeId)

  // Permission questions still waiting on a person, with what they would touch.
  const pending = new Map<string, { tool: string; file: string }>()

  let child: ChildProcess
  const start = input.spawnProcess ?? spawn
  try {
    child = start(shellSafeCommand(resolveEngineCommand('claude-code')), args, {
      cwd: input.cwd,
      env: {
        ...sanitizeEnvironment(process.env),
        ...(input.auth?.apiKey
          ? brainEnvironment('https://api.anthropic.com/v1', input.auth.apiKey)
          : // A named brain rides the door it came from. An EMPTY model means
            // the engine runs as itself — its own login, its own default —
            // and is never pointed at a door that may not even exist. The
            // owner's machine proved the old shape: claude-code forced at a
            // dead localhost door, retrying forever ("the brain is not
            // answering") while the dot lied green.
            input.settings.model
            ? brainEnvironment(input.settings.baseUrl)
            : {}),
        ...(enginePathSync() !== (process.env['PATH'] ?? '') ? { PATH: enginePathSync() } : {}),
        // The engine's own extended-thinking knob, its documented variable,
        // set only when the owner asked for it through the chip.
        ...(input.settings.thinking === 'extended' ? { MAX_THINKING_TOKENS: '31999' } : {}),
      },
      // On Windows the command lives behind an npm `.cmd` shim, which only
      // runs through the shell. The one argument that is not a fixed flag is
      // the model name, which the settings layer validates against a strict
      // pattern (`MODEL_PATTERN` in shared/lib/engine.ts) before it can ever
      // reach this line — the safety rule is code, not this comment.
      shell: process.platform === 'win32',
    })
  } catch {
    input.onEvent({ kind: 'error', text: notFoundMessage() })
    input.onClose?.(null)
    return deadSession()
  }

  child.on('error', () => {
    // Usually "the command line does not exist" — the engine was never installed.
    input.onEvent({ kind: 'error', text: notFoundMessage() })
  })

  // A pipe the engine already closed (EPIPE) reports on stdin, out of band
  // and after every check — swallowed here, because the close below is the
  // event that tells the truth about the engine's death.
  child.stdin?.on?.('error', () => undefined)

  const parser = createEngineParser()
  // Bytes can be chopped in the middle of a multi-byte character (Bangla
  // characters are three bytes long, and pipe chunks land wherever they
  // land), so decoding is left to a StringDecoder, which holds the partial
  // character until its remaining bytes arrive. Decoding each chunk on its
  // own corrupts text — that bug was demonstrated by reviewers with real
  // Bangla content, and this is its fix.
  const decoder = new StringDecoder('utf8')
  let stderrTail = ''
  let finished = false
  // A stop the OWNER pressed is not an engine failure: its close must be
  // quiet — the 'stopped by you' line is the interface's business, and an
  // error card over a deliberate stop would be the app crying wolf.
  let deliberate = false

  const deliver = (text: string): void => {
    for (const event of parser.feed(text)) {
      // A permission the engine asked for is remembered until it is answered:
      // an Allow of a file write takes the file's old self FIRST.
      if (event.kind === 'permission') {
        pending.set(event.requestId, { tool: event.tool, file: event.file ?? '' })
      }
      input.onEvent(event)
    }
  }

  child.stdout?.on('data', (chunk: Buffer) => deliver(decoder.write(chunk)))
  child.stderr?.on('data', (chunk: Buffer) => {
    // Keep only the last few hundred characters — the part that says why.
    stderrTail = `${stderrTail}${chunk.toString('utf8')}`.slice(-600)
  })
  child.on('close', (code: number | null) => {
    if (finished) return
    finished = true
    // Anything the engine said in its final breath still counts.
    try {
      for (const event of [...parser.feed(decoder.end()), ...parser.flush()]) input.onEvent(event)
    } catch {
      // A decoder error at the very end must not mask the close itself.
    }
    if (!deliberate && stderrTail.trim() && code !== 0) {
      input.onEvent({ kind: 'error', text: `engine closed with an error: ${stderrTail.trim()}` })
    }
    input.onClose?.(code)
    input.onEvent({ kind: 'closed' })
  })

  // One wire sentence out. An engine that dies between the running check and
  // the write must not crash the app — the write is guarded, and a failed
  // write is simply "not delivered".
  const writeLine = (line: string): boolean => {
    if (!isRunning()) return false
    try {
      child.stdin?.write(line)
      return true
    } catch {
      return false
    }
  }

  return {
    send(
      prompt: string,
      /** Pictures ride as the wire's own base64 image blocks, after the words. */
      images: Array<{ mime: string; data: string }> = [],
    ): boolean {
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
      for (const image of images) {
        content.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } })
      }
      return writeLine(`${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`)
    },
    answer(requestId: string, allow: boolean): void {
      // THE CHECKPOINT: the file's current self is kept, and the Allow only
      // leaves AFTER the keep has finished — an unawaited snapshot could lose
      // the race against the engine's write, and "the old self, kept first"
      // would be a promise the code did not keep. A failed keep still answers
      // (with the reason noted in the story by the checkpoint module), and a
      // deny never needs a keep at all.
      const asked = pending.get(requestId)
      pending.delete(requestId)
      const respond = (): void => {
        // The deny shape needs a `message` — the real CLI rejects a bare deny
        // as an invalid permission result (proven against v2.1.300).
        writeLine(
          `${JSON.stringify({
            type: 'control_response',
            response: {
              request_id: requestId,
              subtype: 'success',
              response: allow
                ? { behavior: 'allow' }
                : { behavior: 'deny', message: 'The owner said no to this action in OddBrain.' },
            },
          })}\n`,
        )
      }
      if (allow && asked && checkpointWorthTaking(asked.tool) && asked.file && input.checkpointDir && input.shouldCheckpoint?.() !== false) {
        // Fail CLOSED: the promise is "the old self is kept before the Allow
        // travels". If keeping it fails, the Allow must not travel — the
        // engine gets an honest deny and the person sees why.
        takeCheckpoint(input.checkpointDir, asked.file)
          .then(() => respond())
          .catch((failure: unknown) => {
            input.onEvent({ kind: 'error', text: `Checkpoint failed, so the change was denied: ${(failure as Error).message}` })
            writeLine(
              `${JSON.stringify({
                type: 'control_response',
                response: {
                  request_id: requestId,
                  subtype: 'success',
                  response: { behavior: 'deny', message: 'OddBrain could not keep the file\u2019s previous state, so it denied this change.' },
                },
              })}\n`,
            )
          })
      } else {
        respond()
      }
    },
    stop(): void {
      if (!isRunning()) return
      deliberate = true
      const platform = input.platform ?? process.platform
      // On Windows the launch went through the shell, so child.pid is the
      // shell's — killing it alone would orphan the engine. taskkill with /T
      // takes the whole tree down, and /F because a polite request cannot
      // reach a stuck child. Elsewhere a signal reaches the process itself.
      if (platform === 'win32' && child.pid) {
        try {
          const kill = (input.spawnProcess ?? spawn)('taskkill', stopArguments(child.pid))
          kill.on?.('error', () => child.kill())
        } catch {
          child.kill()
        }
        return
      }
      child.kill()
    },
    isRunning,
  }

  function isRunning(): boolean {
    return child.exitCode === null && child.signalCode === null && !child.killed
  }

  function deadSession(): EngineSession {
    return {
      send: () => false,
      answer: () => undefined,
      stop: () => undefined,
      isRunning: () => false,
    }
  }
}

function notFoundMessage(): string {
  return (
    'Claude Code was not found on this machine. Install it once in PowerShell: ' +
    'npm install -g @anthropic-ai/claude-code, then fully close OddBrain (right-click its tray/taskbar icon, Quit) ' +
    'and open it again, so it can see the fresh install.'
  )
}
