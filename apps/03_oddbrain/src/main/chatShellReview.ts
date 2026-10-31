import { randomUUID } from 'node:crypto'

import type { ShellRequest, ShellResult, ShellExecution } from '../shared/lib/commands'
export type { ShellRequest, ShellResult } from '../shared/lib/commands'
/** PART 1 CONTRACT: inspect and execute are native, backend-enforced operations.
 * fingerprint binds app-authorized engine/provider/session/root/permission configuration; no renderer assertions.
 * execute must revalidate that fingerprint and OS/file authority immediately before launch,
 * use bounded-output refusal or a complete retained output artifact, and NEVER auto-retry.
 */
export type VerifiedShellAdapter = {
  inspect(request: ShellRequest): Promise<{ supported: boolean; authorityFingerprint: string; explanation: string; execution?: ShellExecution }>
  execute(request: ShellRequest, authorityFingerprint: string): Promise<ShellResult>
}
export function createChatShellReview(adapter?: VerifiedShellAdapter, now = Date.now) {
  const tickets = new Map<string, { request: ShellRequest; fingerprint: string; expiresAt: number }>()
  return {
    revoke() { tickets.clear() },
    async preview(request: ShellRequest) {
      if (!adapter) throw Error('Verified shell transport is not integrated. Nothing was executed or sent as a prompt.')
      if (!request || typeof request.command !== 'string' || !request.command.trim() || request.command.length > 32_000 || request.command.includes('\0') || typeof request.cwd !== 'string' || !request.cwd || request.cwd.length > 4096 || /[\x00-\x1f]/.test(request.cwd)) throw Error('Invalid command or working folder.')
      for (const [key, ticket] of tickets) if (ticket.expiresAt <= now()) tickets.delete(key)
      if (tickets.size >= 20) throw Error('Too many unreviewed shell requests.')
      const exact = { command: request.command, cwd: request.cwd, ...(request.source ? { source: structuredClone(request.source) } : {}) }, inspected = await adapter.inspect(exact)
      if (!inspected.supported || !inspected.authorityFingerprint) throw Error(inspected.explanation || 'Shell execution is unsupported or unauthorized.')
      if (tickets.size >= 20) throw Error('Too many unreviewed shell requests.')
      const token = randomUUID(), expiresAt = now() + 120_000
      tickets.set(token, { request: exact, fingerprint: inspected.authorityFingerprint, expiresAt })
      return { token, ...exact, expiresAt, explanation: inspected.explanation, ...(inspected.execution ? { execution: inspected.execution } : {}) }
    },
    async decide(token: string, decision: 'allow' | 'deny'): Promise<{ denied: true } | ShellResult> {
      const ticket = tickets.get(token); tickets.delete(token)
      if (!ticket || ticket.expiresAt <= now()) throw Error('Shell review expired or was already used. No command was run.')
      if (decision === 'deny') return { denied: true }
      if (decision !== 'allow' || !adapter) throw Error('Explicit reviewed authorization is required.')
      const current = await adapter.inspect(ticket.request)
      if (!current.supported || current.authorityFingerprint !== ticket.fingerprint) throw Error('Engine, session, folder or permissions changed. Review again; no command was run.')
      return adapter.execute(ticket.request, ticket.fingerprint)
    },
  }
}
