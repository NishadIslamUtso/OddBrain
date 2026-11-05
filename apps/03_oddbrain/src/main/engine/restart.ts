import type { EngineSocket, EngineAnswer } from './socket'
/** App-owned connection restart, not a guessed native slash/reload command. */
export function restartIdleConnection(engine: Pick<EngineSocket, 'turnBusy' | 'stop'> | null | undefined, dispatching: boolean): EngineAnswer {
  if (dispatching || engine?.turnBusy()) return { ok: false, answer: 'Wait for the task to finish or stop it first. No active work was restarted.' }
  engine?.stop()
  return { ok: true, answer: 'The connection is stopped. Your next message starts a new process with current settings and the saved native resume ID. This does not certify plugin loading or sign-in.' }
}
