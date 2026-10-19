import type { EngineEvent } from '../shared/lib/engine'
import type { EngineAnswer } from './engine/socket'
import type { createTurnArchive } from './turnArchive'
type Archive = ReturnType<typeof createTurnArchive>
/** Main-process boundary: no engine dispatch before durable record creation. */
export function dispatchRecordedTurn(archive: Pick<Archive, 'begin' | 'append'>, input: Parameters<Archive['begin']>[0], send: (receive: (event: EngineEvent) => void) => EngineAnswer, stop: () => void, receive: (event: EngineEvent) => void): EngineAnswer {
  let id: string
  try { id = archive.begin(input) }
  catch { return { ok: false, answer: 'A complete text record could not be started. Check free disk space and app storage permissions; nothing was sent.' } }
  let failure = ''
  const requestStop = () => { try { stop() } catch { failure += ' The engine stop could not be confirmed.' } }
  const forward = (event: EngineEvent) => {
    if (failure) { if (event.kind === 'closed') receive(event); return }
    try { archive.append(id, event) }
    catch (error) { failure = error instanceof Error ? error.message : 'The text record could not be saved.'; requestStop(); receive({ kind: 'error', text: failure }); return }
    receive(event)
  }
  let answer: EngineAnswer
  try { answer = send(forward) }
  catch { requestStop(); answer = { ok: false, answer: 'The engine could not dispatch this task. The recorded prefix is retained; check the engine before retrying.' } }
  if (!answer.ok && !failure) forward({ kind: 'error', text: answer.answer })
  // Covers a synchronous startup callback before the socket assigns its child.
  if (failure) { requestStop(); return { ok: false, answer: failure } }
  return answer
}
