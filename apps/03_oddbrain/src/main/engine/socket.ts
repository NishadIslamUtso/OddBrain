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
import type { EngineEvent } from '../../shared/lib/engine'
import { startClaudeCodeSession, type EngineSession, type EngineStartInput } from './claudeCode'
import { startAgySession } from './agy'

export type EngineAnswer = { ok: boolean; answer: string }

export type EngineSocket = {
  /** Which provider's key the LIVE process was launched with, if any. */
  usedAuthProvider(): string | null
  /** Hand the engine a task — starts it on the first one, reuses it after. */
  send(prompt: string, input: EngineStartInput & {
    images?: Array<{ mime: string; data: string }>
    /** Overridable for tests — which process starts. Production leaves this out. */
    spawnProcess?: typeof import('node:child_process').spawn
  }): EngineAnswer
  current(): EngineSession | null
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
export const sessionKey = (engineId: string, cwd: string): string => `${engineId}::${cwd}`

export const noSessionMemory: SessionMemory = { load: () => '', save: () => undefined }

export function createEngineSocket(memory: SessionMemory = noSessionMemory): EngineSocket {
  let session: EngineSession | null = null
  let sessionEngine: string | null = null
  let busy = false
  let currentCwd = ''
  // What the live session was STARTED with. The engine's launch flags fix its
  // model and approval gear for the life of the process, so a changed setting
  // must mean a relaunch — reusing the process would silently run under the
  // OLD gear while the UI shows the new one.
  let sessionModel: string | null = null
  let sessionApproval: string | null = null
  // What the living process was LAUNCHED with: a flag or a base URL that
  // changed under it would only apply on the next start, silently.
  let sessionThinking: string | null = null
  let sessionBaseUrl: string | null = null
  // The key's VALUE, not just its presence: rotating a cloud key must reach
  // the next turn — a living process launched with the old key would otherwise
  // keep billing and speaking as the old credential until it happened to stop.
  let sessionKeyFingerprint: string | null = null
  // And WHICH provider's key it was: clearing one provider's key must not
  // stop a session that was launched with another's.
  let sessionAuthProvider: string | null = null

  const onEvent = (input: EngineStartInput, event: EngineEvent): void => {
    // The socket owns the busy flag: a finished or failed task frees the
    // engine for the next one. Everything else is forwarded untouched.
    if (event.kind === 'done' || event.kind === 'error') busy = false
    if (event.kind === 'session') {
      // Persisted per workspace, so the next launch of the app can continue
      // this conversation where it left off. (The live process is tracked by
      // `session` itself; the memory matters only after the process is gone.)
      memory.save(sessionKey(input.settings.id, input.cwd), event.id)
    }
    input.onEvent(event)
  }

  const start = (input: EngineStartInput & { spawnProcess?: typeof import('node:child_process').spawn }): EngineSession => {
    const spawnArgs = {
      ...input,
      onEvent: (event: EngineEvent) => onEvent(input, event),
      onClose: (code: number | null) => {
        busy = false
        input.onClose?.(code)
      },
    }
    // One plug, two adapters: each engine's own file speaks its own wire and
    // emits the same EngineEvents. The face never learns the difference.
    sessionEngine = input.settings.id
    return input.settings.id === 'agy' ? startAgySession(spawnArgs) : startClaudeCodeSession(spawnArgs)
  }

  return {
    send(prompt: string, input: EngineStartInput & { images?: Array<{ mime: string; data: string }> }): EngineAnswer {
      // Both engines are wired: claude-code on its stream-json wire, agy on
      // its own (verified against the real v1.4.0 binary). An engine that is
      // missing from the machine says so honestly at spawn time — the branch
      // below routes to the right adapter by the setting, nothing else.
      // A different engine was picked: the old process is not asked to speak
      // the other's wire — it is set aside and the chosen engine starts fresh.
      if (session && sessionEngine && input.settings.id !== sessionEngine) {
        session.stop()
        session = null
        sessionEngine = null
        busy = false
      }
      // Reuse only when the process still matches what the settings now ask
      // for: same folder, same model, same approval gear. Anything else gets
      // an honest relaunch (the conversation itself survives via the resume
      // id where the engine supports one).
      const gearChanged =
        sessionModel !== input.settings.model ||
        sessionApproval !== input.settings.approval ||
        sessionThinking !== input.settings.thinking ||
        sessionBaseUrl !== input.settings.baseUrl ||
        sessionKeyFingerprint !== (input.auth?.apiKey ?? null) ||
        currentCwd !== input.cwd
      if (session?.isRunning() && !gearChanged) {
        if (busy) {
          return { ok: false, answer: 'An engine is already working. Stop it first, or wait for it to finish.' }
        }
        // Same engine, same gear, new task — no relaunch, no refusal.
        const sent = session.send(prompt, input.images)
        if (!sent) return { ok: false, answer: session.refusal?.() ?? 'The engine just closed, try again.' }
        busy = true
        return { ok: true, answer: 'started' }
      }
      if (session?.isRunning()) {
        // The gear changed under a living process: set it aside and start the
        // engine anew so the launch flags match what the UI promises.
        session.stop()
        session = null
        busy = false
      }
      // Fresh start. If this engine+workspace had a session before the app
      // (or the engine) closed, continue it — the owner's conversation is not
      // lost just because a process ended.
      session = start({ ...input, resumeId: memory.load(sessionKey(input.settings.id, input.cwd)) })
      currentCwd = input.cwd
      sessionModel = input.settings.model
      sessionApproval = input.settings.approval
      sessionThinking = input.settings.thinking
      sessionBaseUrl = input.settings.baseUrl
      sessionKeyFingerprint = input.auth?.apiKey ?? null
      sessionAuthProvider = input.auth?.provider ?? null
      if (!session.isRunning()) {
        return { ok: false, answer: 'The engine could not be started on this machine.' }
      }
      const sent = session.send(prompt, input.images)
      if (!sent) {
        // A refused first line (agy with a picture, say) is a REFUSAL, not a
        // start — saying "starting" here left the turn hanging forever.
        return { ok: false, answer: session.refusal?.() ?? 'The engine could not accept that task.' }
      }
      busy = true
      return { ok: true, answer: 'started' }
    },
    current: () => session,
    usedAuthProvider: () => sessionAuthProvider,
    turnBusy: () => busy,
    running: () => session?.isRunning() === true,
    stop: () => session?.stop(),
    fresh: () => {
      session?.stop()
      session = null
      busy = false
      // Forget per engine+workspace: the gear is going away with the process,
      // so a stale id must not survive under a different key shape either.
      if (sessionEngine && currentCwd) memory.save(sessionKey(sessionEngine, currentCwd), '')
      sessionEngine = null
      sessionModel = null
      sessionApproval = null
      sessionThinking = null
      sessionBaseUrl = null
      sessionKeyFingerprint = null
      sessionAuthProvider = null
      currentCwd = ''
    },
  }
}
