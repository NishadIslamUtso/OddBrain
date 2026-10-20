import { randomUUID } from 'node:crypto'
import type { EngineSession } from './claudeCode'
/** UI tokens bind an approval to one concrete child, not a reusable native ID. */
export function createPermissionTickets(current: () => EngineSession | null) {
  const pending = new Map<string, { session: EngineSession; nativeId: string }>()
  return {
    clear: () => pending.clear(),
    issue(nativeId: string): string {
      const session = current()
      if (!session || !session.isRunning() || pending.size >= 4096) throw Error('No active permission channel.')
      const token = randomUUID(); pending.set(token, { session, nativeId }); return token
    },
    answer(token: string, allow: boolean): boolean {
      const ticket = pending.get(token)
      if (!ticket || typeof allow !== 'boolean' || current() !== ticket.session || !ticket.session.isRunning()) return false
      // Consume BEFORE writing: reentrant/double clicks cannot approve twice.
      pending.delete(token)
      return ticket.session.answer(ticket.nativeId, allow) === true
    },
  }
}
