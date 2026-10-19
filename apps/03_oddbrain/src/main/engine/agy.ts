/**
 * agy's native event protocol. Schema evidence: CLI headless documentation and
 * third-party 1.3.2 catalog/DTO evidence; native signed-in acceptance is separate.
 * Text-only stdin, incremental agent_response/tool events, cumulative usage.
 * This transport has no interactive permission-response channel.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { createAgyParser } from './agyStream'
import { selectedEffort } from '../../shared/lib/engineCapabilities'
import type { EngineSettings } from '../../shared/lib/engine'
import { sanitizeEnvironment, stopArguments, type EngineStartInput } from './claudeCode'
import { enginePathSync, resolveEngineCommand } from './enginePath'
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
    ...(settings.model ? ['--model', settings.model] : []),
    ...agyModeArguments(settings.approval),
    ...(selectedEffort(settings) !== 'default' ? ['--effort', selectedEffort(settings)] : []),
    ...(resumeId ? ['--conversation', resumeId] : []),
  ]
}

/** One documented agy user event; Claude's `type`/`role` shape is not this protocol. */
export function agyUserLine(prompt: string): string {
  return `${JSON.stringify({ event: 'user', message: { content: prompt } })}\n`
}

/** The current documented stream input explicitly permits text blocks only. */
export const AGY_PICTURES_ANSWER =
  'agy’s current stream input accepts text only. Nothing was sent. Send words alone or explicitly choose an engine that supports pictures.'

export function startAgySession(input: EngineStartInput & { spawnProcess?: typeof spawn }): EngineSession {
  const args = agyArguments(input.settings, input.resumeId)

  let child: ChildProcess
  const start = input.spawnProcess ?? spawn
  try {
    const command = resolveEngineCommand('agy')
    if (/\.(cmd|bat)$/i.test(command)) throw Error('Use the native executable.')
    child = start(command, args, {
      cwd: input.cwd,
      env: {
        ...sanitizeEnvironment(process.env),
        ...(enginePathSync() !== (process.env['PATH'] ?? '') ? { PATH: enginePathSync() } : {}),
      },
      shell: false,
      detached: process.platform !== 'win32',
    })
  } catch {
    input.onEvent({ kind: 'error', text: 'agy could not be started. Install it from antigravity.google (the CLI, not the IDE), then pick it again.' })
    input.onClose?.(null)
    return deadSession()
  }

  let lineBuf = '', stderrTail = ''
  let finished = false, deliberate = false, failed = false
  const decoder = new StringDecoder('utf8'), stderrDecoder = new StringDecoder('utf8')
  const parser = createAgyParser(input.resumeId || false)
  const terminate = (): void => {
    const platform = input.platform ?? process.platform
    if (platform === 'win32' && child.pid) {
      try { const killer = start('taskkill', stopArguments(child.pid), { stdio: 'ignore' }); killer.on?.('error', () => child.kill('SIGKILL')) }
      catch { child.kill('SIGKILL') }
    } else if (child.pid) {
      try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    } else child.kill('SIGKILL')
  }
  const fail = (text: string): void => {
    if (failed || deliberate) return
    failed = true
    input.onEvent({ kind: 'error', text })
    terminate()
  }
  child.on('error', () => fail('agy could not start. Check its executable and installation.'))
  child.stdin?.on?.('error', () => fail('The agy connection closed while sending. Check any partial activity before retrying.'))
  const handleLine = (line: string): void => {
    if (failed || deliberate || !line.trim()) return
    let value: unknown
    try { value = JSON.parse(line) } catch { return }
    try {
      const events = parser.event(value)
      if (parser.shouldStop()) { failed = true; terminate() }
      for (const event of events) input.onEvent(event.kind === 'error' ? { ...event, text: agyErrorSentence(event.text, '') } : event)
    } catch (error) { fail((error as Error).message) }
  }
  child.stdout?.on('data', (chunk: Buffer) => {
    if (failed || deliberate || finished) return
    lineBuf += decoder.write(chunk)
    if (lineBuf.length > 8_000_000) { fail('agy output exceeded the supported message size. The task was stopped; received text is retained.'); return }
    let index: number
    while ((index = lineBuf.indexOf('\n')) >= 0) {
      const line = lineBuf.slice(0, index); lineBuf = lineBuf.slice(index + 1); handleLine(line)
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => { stderrTail = (stderrTail + stderrDecoder.write(chunk)).slice(-1200) })
  child.on('close', (code: number | null) => {
    if (finished) return
    lineBuf += decoder.end()
    if (lineBuf.trim()) handleLine(lineBuf)
    finished = true
    if (parser.pending() && !deliberate && !failed) input.onEvent({ kind: 'error', text: agyErrorSentence('agy closed without an answer for the current message. Check its connection and CLI setup before retrying.', stderrTail) })
    input.onClose?.(code)
    input.onEvent({ kind: 'closed' })
  })

  const isRunning = (): boolean => !failed && !deliberate && !finished && child.exitCode === null && !child.killed
  let refusalReason = ''

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
    send(prompt: string, images: Array<{ mime: string; data: string }> = []): boolean {
      // Do not drop images or invent an unsupported wire block.
      if (images.length) {
        refusalReason = AGY_PICTURES_ANSWER
        return false
      }
      if (!isRunning() || parser.pending()) { refusalReason = 'agy is still working or has stopped. Wait for its result, or stop and retry.'; return false }
      parser.beginTurn()
      const sent = writeLine(agyUserLine(prompt))
      if (!sent) { refusalReason = 'The agy connection could not accept the message.'; fail(refusalReason) }
      return sent
    },
    refusal(): string {
      const reason = refusalReason
      refusalReason = ''
      return reason
    },
    answer(): void {
      // The documented stream protocol rejects control_response messages.
      // Never turn a UI decision into a fake approval or a permission-rule edit.
    },
    stop(): void {
      if (!isRunning()) return
      deliberate = true
      terminate()
    },
    isRunning,
  }
}

/** The auth case gets the exact next step; everything else says what came back. */
export function agyErrorSentence(error: string, stderrTail: string): string {
  if (/authentication|unauthenticated|sign.in|login required|oauth/i.test(error)) {
    return 'agy is not signed in on this machine. Run `agy` once in a terminal and finish the browser sign-in; then check any partial activity before retrying. No billing conclusion is available here.'
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
