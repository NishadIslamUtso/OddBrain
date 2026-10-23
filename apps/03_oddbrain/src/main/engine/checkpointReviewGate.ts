import { createReviewedCheckpoints } from './checkpoints'
/** Construct per sender. Tokens cannot be transferred between windows; current
 * policy is checked before reading and again before the one-use file mutation. */
export function createCheckpointReviewGate(directory: string, authorize: (path: string) => string) {
  const service = createReviewedCheckpoints(directory)
  const tickets = new Map<string, { path: string; authority: string; expiresAt: number }>()
  return {
    async preview(copy: string, original: string) {
      if (typeof copy !== 'string' || typeof original !== 'string' || !original) throw Error('Choose an indexed checkpoint first.')
      for (const [key, ticket] of tickets) if (ticket.expiresAt <= Date.now()) tickets.delete(key)
      const authority = authorize(original), review = await service.preview(copy, original)
      try { if (authorize(review.path) !== authority) throw Error('Workspace or permissions changed. Preview again.') }
      catch (error) { service.decide(review.token, 'deny'); throw error }
      tickets.set(review.token, { path: review.path, authority, expiresAt: review.expiresAt })
      return review
    },
    decide(token: string, decision: 'allow' | 'deny') {
      const ticket = tickets.get(token); tickets.delete(token)
      if (!ticket) return { ok: false, answer: 'Unknown or already-used review in this window.' }
      if (decision !== 'deny') {
        try { if (authorize(ticket.path) !== ticket.authority) throw Error('Workspace or permissions changed. No file was changed; preview again.') }
        catch (error) { service.decide(token, 'deny'); return { ok: false, answer: (error as Error).message } }
      }
      return service.decide(token, decision)
    },
  }
}
