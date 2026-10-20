import { resolveEngineCommand } from './enginePath'
import { createHmac, randomBytes } from 'node:crypto'
import { selectedEffort } from '../../shared/lib/engineCapabilities'
/**
 * The socket: the one plug between the app and whatever engine is chosen.
 *
 * The window never knows which engine is behind it — it sends a task, receives
 * events, answers permission cards. Adding engine #2 (agy) later means adding
 * one branch here and nothing else.
 *
 * Sessions outlive tasks. The real CLI stays alive after finishing a task,
 * ready for the next one (verified against v2.1.300), so one session serves
 * many tasks: a second task while the engine is idle goes to the same
 * process; only a task arriving while another is still running is refused.
 */
import type { EngineEvent, EngineId } from '../../shared/lib/engine'
import { startClaudeCodeSession, type EngineSession, type EngineStartInput } from './claudeCode'
import { startAgySession } from './agy'

export type EngineAnswer = { ok: boolean; answer: string; transcriptId?: string }
export type NativeSessionState = { state: 'live' | 'resumed' | 'fresh'; detail: string }
type SessionTarget = Pick<EngineStartInput, 'settings' | 'cwd' | 'chatId' | 'auth'>

export type EngineSocket = {
  /** Which provider's key the LIVE process was launched with, if any. */
  usedAuthProvider(): string | null
  /** Hand the engine a task — starts it on the first one, reuses it after. */
  send(prompt: string, input: EngineStartInput & {
    images?: Array<{ mime: string; data: string }>
    /** Overridable for tests — which process starts. Production leaves this out. */
    spawnProcess?: typeof import('node:child_process').spawn
  }): EngineAnswer
  /** Receipt for how the next turn will reach native conversation state. */
  nextSession(input: SessionTarget): NativeSessionState
  current(): EngineSession | null
  currentTarget(): { engine: EngineId; workspace: string; chatId?: string } | null
  /** True only while a TASK is in flight, not merely while the process lives. */
  turnBusy(): boolean
  running(): boolean
  stop(): void
  /** End the session AND forget its resume id: the next send starts fresh.
   *  Compaction's second half — without the forget, --resume would drag the
   *  whole long conversation right back in. */
  fresh(): void
}

/**
 * Where the socket remembers engine sessions, so a conversation can survive
 * an app restart: one id per workspace folder. Both halves are injectable
 * for tests; production hands a small JSON file.
 */
export type SessionMemory = {
  load(key: string): string
  save(key: string, sessionId: string): void
}

/**
 * One conversation per ENGINE per workspace: claude-code's session id means
 * nothing to agy and vice versa, so a shared key would hand one engine the
 * other's resume id.
 */
export const sessionKey = (engineId: string, cwd: string, chatId?: string): string => chatId
  ? `v2:${JSON.stringify([engineId, cwd, chatId])}` : `${engineId}::${cwd}`

export const noSessionMemory: SessionMemory = { load: () => '', save: () => undefined }

export function createEngineSocket(memory: SessionMemory = noSessionMemory): EngineSocket {
  let session: EngineSession | null = null
  let sessionEngine: EngineId | null = null
  let busy = false
  let activeInput: EngineStartInput | null = null
  let currentCwd = ''
  let currentChatId: string | undefined
  let unfinishedForget = ''
  let generation = 0
  // What the live session was STARTED with. The engine's launch flags fix its
  // model and approval gear for the life of the process, so a changed setting
  // must mean a relaunch — reusing the process would silently run under the
  // OLD gear while the UI shows the new one.
  let sessionModel: string | null = null
  let sessionProvider: string | null = null
  let sessionCommand: string | null = null
  let sessionApproval: string | null = null
  // What the living process was LAUNCHED with: a flag or a base URL that
  // changed under it would only apply on the next start, silently.
  let sessionThinking: string | null = null
  let sessionBaseUrl: string | null = null
  // A one-way fingerprint of the key, not the credential or just its presence:
  // rotating a cloud key must reach the next turn — a living process launched with the old key would otherwise
  // keep billing and speaking as the old credential until it happened to stop.
  let sessionKeyFingerprint: string | null = null
  // And WHICH provider's key it was: clearing one provider's key must not
  // stop a session that was launched with another's.
  let sessionAuthProvider: string | null = null
  // Keyed and process-local: enough to notice credential rotation without
  // retaining a second plaintext copy or exposing an offline password hash.
  const authFingerprintKey = randomBytes(32)
  const authFingerprint = (value: string | undefined) => value ? createHmac('sha256', authFingerprintKey).update(value).digest('hex') : null

  const onEvent = (input: EngineStartInput, event: EngineEvent): void => {
    // The socket owns the busy flag: a finished or failed task frees the
    // engine for the next one. Everything else is forwarded untouched.
    if (event.kind === 'done' || event.kind === 'error') busy = false
    if (event.kind === 'session') {
      // Persisted per workspace, so the next launch of the app can continue
      // this conversation where it left off. (The live process is tracked by
      // `session` itself; the memory matters only after the process is gone.)
      try { memory.save(sessionKey(input.settings.id, input.cwd, input.chatId), event.id) }
      catch {
        input.onEvent(event) // retain the complete observed ID in the durable turn record
        busy = false
        input.onEvent({ kind: 'error', text: 'The native resume ID could not be saved. Stop requested; work may have started. Inspect this turn’s transcript before retrying, and repair session storage first.' })
        session?.stop(); return
      }
    }
    input.onEvent(event)
  }

  const gearChanged = (input: SessionTarget): boolean =>
    sessionCommand !== resolveEngineCommand(input.settings.id) ||
    sessionModel !== input.settings.model ||
    sessionProvider !== input.settings.cloudProvider ||
    sessionApproval !== input.settings.approval ||
    sessionThinking !== selectedEffort(input.settings) ||
    sessionBaseUrl !== input.settings.baseUrl ||
    sessionKeyFingerprint !== authFingerprint(input.auth?.apiKey) ||
    currentCwd !== input.cwd || currentChatId !== input.chatId || sessionEngine !== input.settings.id
  const nextSession = (input: SessionTarget): NativeSessionState => {
    if (session?.isRunning() && !gearChanged(input)) return { state: 'live', detail: 'Reused the already-running native process with the same engine, folder, model and permission gear.' }
    const resumeId = memory.load(sessionKey(input.settings.id, input.cwd, input.chatId))
    return resumeId
      ? { state: 'resumed', detail: 'Started a native process with this chat’s saved engine session link; earlier native context may be present but is not imported into this receipt.' }
      : { state: 'fresh', detail: 'Started without a saved native session link; any listed stored chat messages were explicitly included in this request.' }
  }

  const start = (input: EngineStartInput & { spawnProcess?: typeof import('node:child_process').spawn }): EngineSession => {
    const ownGeneration = ++generation
    const spawnArgs = {
      ...input,
      onEvent: (event: EngineEvent) => { if (ownGeneration === generation) onEvent(activeInput || input, event) },
      onClose: (code: number | null) => {
        if (ownGeneration !== generation) return
        busy = false
        ;(activeInput || input).onClose?.(code)
      },
    }
    // One plug, two adapters: each engine's own file speaks its own wire and
    // emits the same EngineEvents. The face never learns the difference.
    sessionEngine = input.settings.id
    return input.settings.id === 'agy' ? startAgySession(spawnArgs) : startClaudeCodeSession(spawnArgs)
  }

  return {
    send(prompt: string, input: EngineStartInput & { images?: Array<{ mime: string; data: string }> }): EngineAnswer {
      if (unfinishedForget) return { ok: false, answer: 'The previous fresh-session request could not be saved. Retry Fresh session before sending; the old native context was not silently resumed.' }
      if (busy) return { ok: false, answer: 'An engine is already working. Stop it first, or wait for it to finish.' }
      // Both engines are wired: claude-code on its stream-json wire, agy on
      // its own documented stream (live signed-in acceptance remains separate). An engine that is
      // missing from the machine says so honestly at spawn time — the branch
      // below routes to the right adapter by the setting, nothing else.
      // A different engine was picked: the old process is not asked to speak
      // the other's wire — it is set aside and the chosen engine starts fresh.
      if (session && sessionEngine && input.settings.id !== sessionEngine) {
        generation += 1
        session.stop()
        session = null
        sessionEngine = null
        busy = false
      }
      // Reuse only when the process still matches what the settings now ask
      // for: same folder, same model, same approval gear. Anything else gets
      // an honest relaunch (the conversation itself survives via the resume
      // id where the engine supports one).
      const command = resolveEngineCommand(input.settings.id)
      const changed = gearChanged(input)
      if (session?.isRunning() && !changed) {
        if (busy) {
          return { ok: false, answer: 'An engine is already working. Stop it first, or wait for it to finish.' }
        }
        // Same engine, same gear, new task — no relaunch, no refusal.
        activeInput = input
        busy = true
        const sent = session.send(prompt, input.images)
        if (!sent) { busy = false; return { ok: false, answer: session.refusal?.() ?? 'The engine just closed, try again.' } }
        return { ok: true, answer: 'started' }
      }
      if (session?.isRunning()) {
        // The gear changed under a living process: set it aside and start the
        // engine anew so the launch flags match what the UI promises.
        generation += 1
        session.stop()
        session = null
        busy = false
      }
      // Fresh start. If this engine+workspace had a session before the app
      // (or the engine) closed, continue it — the owner's conversation is not
      // lost just because a process ended.
      let resumeId: string
      try { resumeId = memory.load(sessionKey(input.settings.id, input.cwd, input.chatId)) }
      catch { return { ok: false, answer: 'Saved sessions could not be read. The original index is retained; no message was sent or fresh session silently substituted.' } }
      activeInput = input
      session = start({ ...input, resumeId })
      currentCwd = input.cwd
      currentChatId = input.chatId
      sessionModel = input.settings.model
      sessionProvider = input.settings.cloudProvider
      sessionCommand = command
      sessionApproval = input.settings.approval
      sessionThinking = selectedEffort(input.settings)
      sessionBaseUrl = input.settings.baseUrl
      sessionKeyFingerprint = authFingerprint(input.auth?.apiKey)
      sessionAuthProvider = input.auth?.provider ?? null
      if (!session.isRunning()) {
        return { ok: false, answer: 'The engine could not be started on this machine.' }
      }
      busy = true
      const sent = session.send(prompt, input.images)
      if (!sent) {
        busy = false
        // A refused first line (agy with a picture, say) is a REFUSAL, not a
        // start — saying "starting" here left the turn hanging forever.
        return { ok: false, answer: session.refusal?.() ?? 'The engine could not accept that task.' }
      }
      return { ok: true, answer: 'started' }
    },
    nextSession,
    current: () => session,
    currentTarget: () => sessionEngine && currentCwd ? { engine: sessionEngine, workspace: currentCwd, ...(currentChatId ? { chatId: currentChatId } : {}) } : null,
    usedAuthProvider: () => sessionAuthProvider,
    turnBusy: () => busy,
    running: () => session?.isRunning() === true,
    stop: () => session?.stop(),
    fresh: () => {
      generation += 1
      session?.stop()
      session = null
      busy = false
      activeInput = null
      // Forget per engine+workspace: the gear is going away with the process,
      // so a stale id must not survive under a different key shape either.
      const forgottenKey = sessionEngine && currentCwd ? sessionKey(sessionEngine, currentCwd, currentChatId) : unfinishedForget
      sessionEngine = null
      sessionModel = null
      sessionProvider = null
      sessionCommand = null
      sessionApproval = null
      sessionThinking = null
      sessionBaseUrl = null
      sessionKeyFingerprint = null
      sessionAuthProvider = null
      currentCwd = ''
      currentChatId = undefined
      if (forgottenKey) { unfinishedForget = forgottenKey; memory.save(forgottenKey, ''); unfinishedForget = '' }
    },
  }
}
