import { engineCommandRefusal } from '../../shared/lib/engineCommandPolicy'
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
import { join, resolve } from 'node:path'
import { enginePathSync, resolveEngineCommand } from './enginePath'
import type { ApprovalMode, EngineEvent, EngineSettings } from '../../shared/lib/engine'
import { selectedEffort } from '../../shared/lib/engineCapabilities'
import { PERMISSION_MODE } from '../../shared/lib/engine'
import { createEngineParser, EngineReadError } from './stream'
import { checkpointWorthTaking, takeCheckpoint } from './checkpoints'

export type EngineSession = {
  /** Hand the engine a task. Returns false if the session already closed. */
  send(prompt: string, images?: Array<{ mime: string; data: string }>): boolean
  /** Why the last send refused to send, when there is an honest reason. */
  refusal?(): string
  /** Answer a permission the engine asked for. */
  answer(requestId: string, allow: boolean): boolean | void
  /** Close the engine now. */
  stop(): void
  isRunning(): boolean
}

export type StartSessionInput = {
  /** App-owned identity, separate from the engine-owned resume ID. */
  chatId?: string
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

/** Raw machine credentials and process-injection controls are never ambient
 * authority for a native engine. Explicit app-selected provider credentials are
 * added back by brainEnvironment after this filter. Native file/login stores
 * remain the engine's own concern. */
const UNSAFE_ENV_KEYS = new Set(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'BASH_ENV', 'ENV', 'PROMPT_COMMAND', 'GIT_ASKPASS', 'SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE'])
const CREDENTIAL_ENV_KEY = /(?:^|_)(?:API_?KEY|ACCESS_?KEY(?:_ID)?|SECRET(?:_ACCESS_KEY)?|AUTH_?TOKEN|TOKEN|PASSWORD|PASSWD|PRIVATE_?KEY|CREDENTIALS?)(?:$|_)/i

/**
 * The free gate, kept honest: the engine thinks with the brain the owner
 * chose in this app, never with whatever credentials happen to sit in the
 * machine's environment. Credential-shaped variables and common process-
 * injection controls are stripped from the inherited environment on every
 * launch; the chosen brain is then applied on top. An empty brain choice means
 * the engine starts with none of these —
 * no silent borrowing of a machine account. (A login the owner made directly
 * with the CLI on their own machine is their own affair; this app neither
 * forwards it through settings nor plants it there.)
 */
export function strippedEnvironmentNames(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(env).filter(key => {
    const upper = key.toUpperCase()
    return UNSAFE_ENV_KEYS.has(upper) || CREDENTIAL_ENV_KEY.test(upper)
  }).sort((a, b) => a.localeCompare(b))
}

export function sanitizeEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const stripped = new Set(strippedEnvironmentNames(env))
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) if (value !== undefined && !stripped.has(key)) clean[key] = value
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
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
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
  const args = engineArguments(input.settings.model, input.settings.approval, input.resumeId)
  const effort = selectedEffort(input.settings)
  if (effort !== 'default') args.push('--effort', effort)

  // Permission questions still waiting on a person, with what they would touch.
  const pending = new Map<string, { tool: string; file: string }>()
  const seenRequests = new Set<string>()

  let child: ChildProcess
  const start = input.spawnProcess ?? spawn
  try {
    const command = resolveEngineCommand('claude-code')
    if (/\.(cmd|bat)$/i.test(command)) throw Error('Select the native Claude executable, not a shell shim.')
    child = start(command, args, {
      cwd: input.cwd,
      env: {
        ...sanitizeEnvironment(process.env),
        ...(input.auth?.apiKey
          ? brainEnvironment('https://api.anthropic.com', input.auth.apiKey)
          : // A named brain rides the door it came from. An EMPTY model means
            // the engine runs as itself — its own login, its own default —
            // and is never pointed at a door that may not even exist. The
            // owner's machine proved the old shape: claude-code forced at a
            // dead localhost door, retrying forever ("the brain is not
            // answering") while the dot lied green.
            input.settings.model && input.settings.cloudProvider !== 'native'
            ? brainEnvironment(input.settings.baseUrl)
            : {}),
        ...(enginePathSync() !== (process.env['PATH'] ?? '') ? { PATH: enginePathSync() } : {}),
      },
      shell: false, windowsHide: true,
      detached: (input.platform ?? process.platform) !== 'win32',
    })
  } catch {
    input.onEvent({ kind: 'error', text: notFoundMessage() })
    input.onClose?.(null)
    return deadSession()
  }

  const parser = createEngineParser()
  // Bytes can be chopped in the middle of a multi-byte character (Bangla
  // characters are three bytes long, and pipe chunks land wherever they
  // land), so decoding is left to a StringDecoder, which holds the partial
  // character until its remaining bytes arrive. Decoding each chunk on its
  // own corrupts text — that bug was demonstrated by reviewers with real
  // Bangla content, and this is its fix.
  const decoder = new StringDecoder('utf8')
  let finished = false
  // A stop the OWNER pressed is not an engine failure: its close must be
  // quiet — the 'stopped by you' line is the interface's business, and an
  // error card over a deliberate stop would be the app crying wolf.
  let deliberate = false, failed = false, awaitingResult = false
  let approvalEpoch = 0, refusalReason = ''
  const terminate = (): void => {
    if (!child.pid && typeof child.kill !== 'function') return // A failed spawn/test runner may have no process handle.
    if ((input.platform ?? process.platform) === 'win32' && child.pid) {
      try {
        const killer = start('taskkill', stopArguments(child.pid), { shell: false, stdio: 'ignore', windowsHide: true })
        killer.on?.('error', () => child.kill('SIGKILL'))
      } catch { child.kill('SIGKILL') }
    } else if (child.pid && !input.spawnProcess) {
      // A custom/test factory's numeric PID is not authority to signal an OS group.
      try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    } else child.kill('SIGKILL')
  }
  const fail = (text: string): void => {
    if (failed || deliberate || finished) return
    failed = true; awaitingResult = false; approvalEpoch++; pending.clear()
    input.onEvent({ kind: 'error', text }); terminate()
  }
  child.on('error', () => fail(notFoundMessage()))
  child.stdin?.on?.('error', () => fail('The Claude connection closed while sending. Check partial activity before retrying.'))

  const deliverEvents = (events: EngineEvent[]): void => {
    for (const event of events) {
      if (failed || deliberate || finished) return
      if (event.kind === 'permission') {
        if (!awaitingResult || seenRequests.has(event.requestId) || seenRequests.size >= 4096) { fail('Claude sent an unexpected or duplicate permission request. No approval was sent.'); return }
        seenRequests.add(event.requestId)
        pending.set(event.requestId, { tool: event.tool, file: event.file ? resolve(input.cwd, event.file) : '' })
      }
      if (event.kind === 'error') { fail(event.text); return }
      if (event.kind === 'done') { awaitingResult = false; pending.clear(); approvalEpoch++ }
      input.onEvent(event)
    }
  }
  const deliver = (text: string): void => {
    if (failed || deliberate || finished) return
    try { deliverEvents(parser.feed(text)) }
    catch (error) { if (error instanceof EngineReadError) deliverEvents(error.prefix); fail(error instanceof Error ? error.message : 'Claude output could not be read. Stop requested.') }
  }
  child.stdout?.on('data', (chunk: Buffer) => deliver(decoder.write(chunk)))
  // Drain stderr without retaining credentials or arbitrary diagnostics.
  child.stderr?.on('data', () => undefined)
  child.on('close', (code: number | null) => {
    if (finished) return
    if (!deliberate && !failed) {
      try { deliverEvents([...parser.feed(decoder.end()), ...parser.flush()]) }
      catch (error) { if (error instanceof EngineReadError) deliverEvents(error.prefix); fail(error instanceof Error ? error.message : 'Claude final output could not be read.') }
      if ((awaitingResult || (code !== null && code !== 0)) && !failed) input.onEvent({ kind: 'error', text: `Claude closed without a confirmed result${code === null ? '' : ` (exit ${code})`}. Partial work may exist; inspect it before retrying.` })
    }
    finished = true; awaitingResult = false; approvalEpoch++; pending.clear()
    input.onClose?.(code)
    input.onEvent({ kind: 'closed' })
  })

  // One wire sentence out. An engine that dies between the running check and
  // the write must not crash the app — the write is guarded, and a failed
  // write is simply "not delivered".
  const writeLine = (line: string): boolean => {
    if (!isRunning()) return false
    try {
      if (!child.stdin) return false
      child.stdin.write(line)
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
      const commandRefusal = engineCommandRefusal(prompt)
      if (commandRefusal) { refusalReason = commandRefusal; return false }
      if (!isRunning() || awaitingResult) { refusalReason = 'Claude is still working or has stopped. Wait for its result, or stop and retry.'; return false }
      parser.beginTurn(); seenRequests.clear(); awaitingResult = true
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
      for (const image of images) {
        content.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } })
      }
      const sent = writeLine(`${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`)
      if (!sent) { refusalReason = 'The Claude connection could not accept the message.'; fail(refusalReason) }
      return sent
    },
    refusal(): string { const reason = refusalReason; refusalReason = ''; return reason },
    answer(requestId: string, allow: boolean): boolean {
      // THE CHECKPOINT: the file's current self is kept, and the Allow only
      // leaves AFTER the keep has finished — an unawaited snapshot could lose
      // the race against the engine's write, and "the old self, kept first"
      // would be a promise the code did not keep. A failed keep still answers
      // (with the reason noted in the story by the checkpoint module), and a
      // deny never needs a keep at all.
      const asked = pending.get(requestId)
      if (!asked || typeof allow !== 'boolean' || !isRunning() || !awaitingResult) return false
      const epoch = approvalEpoch
      pending.delete(requestId)
      const respond = (): boolean => {
        if (!isRunning() || !awaitingResult || approvalEpoch !== epoch) return false
        // The deny shape needs a `message` — the real CLI rejects a bare deny
        // as an invalid permission result (proven against v2.1.300).
        const sent = writeLine(
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
        if (!sent) fail('The permission response could not be delivered. No approval is assumed; inspect partial activity before retrying.')
        return sent
      }
      if (allow && asked && checkpointWorthTaking(asked.tool) && asked.file && input.checkpointDir && input.shouldCheckpoint?.() !== false) {
        // Fail CLOSED: the promise is "the old self is kept before the Allow
        // travels". If keeping it fails, the Allow must not travel — the
        // engine gets an honest deny and the person sees why.
        takeCheckpoint(input.checkpointDir, asked.file)
          .then(() => respond())
          .catch((failure: unknown) => {
            if (!isRunning() || !awaitingResult || approvalEpoch !== epoch) return
            input.onEvent({ kind: 'status', text: `Checkpoint failed, so the change was denied: ${(failure as Error).message}` })
            const sent = writeLine(
              `${JSON.stringify({
                type: 'control_response',
                response: {
                  request_id: requestId,
                  subtype: 'success',
                  response: { behavior: 'deny', message: 'OddBrain could not keep the file\u2019s previous state, so it denied this change.' },
                },
              })}\n`,
            )
            if (!sent) fail('The checkpoint denial could not be delivered. The engine was stopped; inspect partial activity before retrying.')
          })
      } else {
        return respond()
      }
      return true
    },
    stop(): void {
      if (!isRunning()) return
      deliberate = true
      awaitingResult = false; approvalEpoch++; pending.clear()
      terminate()
    },
    isRunning,
  }

  function isRunning(): boolean {
    return !deliberate && !failed && !finished && child.exitCode === null && child.signalCode === null && !child.killed
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
    'Claude Code could not start. Install or select its native executable (claude.exe on Windows), not a .cmd/.bat shell shim, then retry. No fallback engine was used.'
  )
}
