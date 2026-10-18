/**
 * Engine adapter #2: agy (Google's Antigravity CLI), spawned and driven over
 * its wire — the same EngineEvent stream as Claude Code, so the socket, the
 * cards, the line and every app feature ride it unchanged.
 *
 * Everything below was verified against the REAL agy binary (v1.4.0, the
 * official installer at antigravity.google/cli/install.sh) on 2026-10-17 —
 * the architecture plan's 6.3 gate, finally run:
 *
 *  - `--input-format stream-json --output-format stream-json` is its
 *    non-interactive mode: one NDJSON user message per stdin line, one turn
 *    each; `-p` is implied (passing `-p` alone is a flag error — observed).
 *  - The observed result envelope:
 *      {"event":"result","result":{conversation_id,status,response,error,
 *       duration_seconds,num_turns,usage:{input_tokens,output_tokens,
 *       thinking_tokens,cache_read_tokens,total_tokens}}}
 *    with `status:"ERROR"` carrying the reason in `result.error`, and the
 *    process exiting 0 even then. Unauthenticated runs emit exactly this
 *    shape with "authentication failed or timed out".
 *  - `conversation_id` is the resume key: the flag is `--conversation <id>`
 *    (and `--continue` for the most recent).
 *  - The throttle maps onto its OWN documented knobs: `--mode
 *    accept-edits|plan` and `--dangerously-skip-permissions`. Its help lists
 *    no stdio permission-prompt flag, so in the default Ask gear its print
 *    mode simply runs without tool prompts — honest chat and answers; the
 *    card-per-write guarantee is Claude Code's gear set.
 *  - Models are Google's own plan-gated list (`agy models` — sign-in gated,
 *    observed). No custom endpoint exists: Ollama brains cannot plug in.
 *  - Sign-in is a browser flow (observed OAuth URL); per the owner's rule it
 *    happens in his terminal/browser, never in this app.
 *
 * What is deliberately NOT invented: the mid-turn event vocabulary of an
 * authenticated run (text deltas, tool use). Unknown `{"event":…}` lines are
 * passed by silently — the same rule adapter #1 follows — and the result
 * envelope above carries the turn's outcome regardless. The first signed-in
 * turn on the owner's machine pins the rest, and only then do those events
 * get richer mapping.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import type { EngineSettings } from '../../shared/lib/engine'
import { sanitizeEnvironment, stopArguments, type EngineStartInput } from './claudeCode'
import { enginePathSync, resolveEngineCommand, shellSafeCommand } from './enginePath'
import type { EngineSession } from './claudeCode'

/** The throttle setting → agy's own documented flags (verified in --help). */
export function agyModeArguments(approval: EngineSettings['approval']): string[] {
  switch (approval) {
    case 'edits':
      return ['--mode', 'accept-edits']
    case 'plan':
      return ['--mode', 'plan']
    case 'full':
      return ['--dangerously-skip-permissions']
    default:
      // Ask: agy's print mode has no prompt channel to enable — nothing to set.
      return []
  }
}

/** The launch line for one session, in one place so a test can pin it. */
export function agyArguments(settings: EngineSettings, resumeId?: string): string[] {
  return [
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--model', settings.model,
    ...agyModeArguments(settings.approval),
    // The engine's own reasoning-effort knob for the Thinking chip. Its help
    // documents low|medium|high|xhigh|max; extended maps to `high`, default
    // sets nothing — the same shape as Claude Code's thinking switch.
    ...(settings.thinking === 'extended' ? ['--effort', 'high'] : []),
    ...(resumeId ? ['--conversation', resumeId] : []),
  ]
}

/** One user turn on the stdin wire, as the binary accepted it in probes. */
export function agyUserLine(prompt: string): string {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } })}\n`
}

/** What the app can honestly do with pictures on agy's wire: nothing yet. */
export const AGY_PICTURES_ANSWER =
  'agy\u2019s picture shape is not verified yet, so nothing was sent with a picture in it. Send the words alone here, or pick Claude Code for pictures.'

export function startAgySession(input: EngineStartInput & { spawnProcess?: typeof spawn }): EngineSession {
  const args = agyArguments(input.settings, input.resumeId)

  let child: ChildProcess
  const start = input.spawnProcess ?? spawn
  try {
    child = start(shellSafeCommand(resolveEngineCommand('agy')), args, {
      cwd: input.cwd,
      env: {
        ...sanitizeEnvironment(process.env),
        ...(enginePathSync() !== (process.env['PATH'] ?? '') ? { PATH: enginePathSync() } : {}),
      },
      shell: process.platform === 'win32',
    })
  } catch {
    input.onEvent({ kind: 'error', text: 'agy could not be started. Install it from antigravity.google (the CLI, not the IDE), then pick it again.' })
    input.onClose?.(null)
    return deadSession()
  }

  child.on('error', () => {
    input.onEvent({ kind: 'error', text: 'agy is not on this machine yet. Install it from antigravity.google (the CLI, not the IDE), then pick it here.' })
  })
  child.stdin?.on?.('error', () => undefined)

  let lineBuf = ''
  let stderrTail = ''
  let finished = false
  let deliberate = false
  let sawResult = false

  const handleLine = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed) return
    let parsed: { event?: string; result?: {
      conversation_id?: string
      status?: string
      response?: string
      error?: string
      duration_seconds?: number
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number; thinking_tokens?: number; cache_read_tokens?: number }
    } }
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return // a non-JSON line on this wire is not an app concern
    }
    if (parsed.event !== 'result' || !parsed.result) return
    sawResult = true
    const { result } = parsed
    if (result.conversation_id) {
      input.onEvent({ kind: 'session', id: result.conversation_id })
    }
    if (result.status === 'ERROR') {
      const why = result.error || 'agy reported an error without a reason.'
      input.onEvent({ kind: 'error', text: agyErrorSentence(why, stderrTail) })
      return
    }
    const usage = result.usage
    input.onEvent({
      kind: 'done',
      text: result.response ?? '',
      usage: {
        inTokens: usage?.input_tokens ?? 0,
        outTokens: usage?.output_tokens ?? 0,
        durationMs: result.duration_seconds != null ? Math.round(result.duration_seconds * 1000) : null,
        costUsd: null, // agy's result envelope names no cost
      },
    })
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    lineBuf += chunk.toString('utf8')
    let index: number
    while ((index = lineBuf.indexOf('\n')) >= 0) {
      const line = lineBuf.slice(0, index)
      lineBuf = lineBuf.slice(index + 1)
      handleLine(line)
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = `${stderrTail}${chunk.toString('utf8')}`.slice(-600)
  })
  child.on('close', (code: number | null) => {
    if (finished) return
    finished = true
    if (lineBuf.trim()) handleLine(lineBuf)
    if (!sawResult && !deliberate) {
      // No result envelope at all: the binary died before answering — say why.
      const why = stderrTail.trim()
      input.onEvent({
        kind: 'error',
        text: why
          ? `agy closed without an answer: ${why}`
          : 'agy closed without an answer. Is it signed in? Run `agy` once in a terminal to sign in, then try again.',
      })
    }
    input.onClose?.(code)
    input.onEvent({ kind: 'closed' })
  })

  const isRunning = (): boolean => !finished && child.exitCode === null && !child.killed
  let refusalReason = ''

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
    send(prompt: string, images: Array<{ mime: string; data: string }> = []): boolean {
      // Pictures: agy's image shape is unverified — an honest refusal beats a
      // silent drop or an invented block. The reason travels with the session
      // so the socket can show it instead of inventing "starting".
      if (images.length) {
        refusalReason = AGY_PICTURES_ANSWER
        return false
      }
      return writeLine(agyUserLine(prompt))
    },
    refusal(): string {
      const reason = refusalReason
      refusalReason = ''
      return reason
    },
    answer(): void {
      // agy's print mode surfaces no stdio permission questions (verified in
      // its --help), so there is nothing to answer — the throttle flags above
      // are its entire permission story.
    },
    stop(): void {
      if (!isRunning()) return
      deliberate = true
      const platform = input.platform ?? process.platform
      if (platform === 'win32' && child.pid) {
        // agy.exe may spawn children the same way claude does: take the tree.
        // Through the session's own spawner, exactly like claudeCode's stop —
        // the tree-kill is observable and testable, never a module secret.
        start('taskkill', stopArguments(child.pid), { stdio: 'ignore' })
      } else {
        child.kill('SIGTERM')
      }
    },
    isRunning,
  }
}

/** The auth case gets the exact next step; everything else says what came back. */
export function agyErrorSentence(error: string, stderrTail: string): string {
  if (/auth/i.test(error)) {
    return 'agy is not signed in on this machine. Run `agy` once in a terminal and finish the browser sign-in; then send the work again here. Nothing was charged or sent.'
  }
  const tail = stderrTail.trim()
  return tail ? `${error} (agy said: ${tail})` : error
}

function deadSession(): EngineSession {
  return {
    send: () => false,
    answer: () => undefined,
    stop: () => undefined,
    isRunning: () => false,
  }
}
