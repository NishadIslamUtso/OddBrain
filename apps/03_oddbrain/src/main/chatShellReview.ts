import { randomUUID } from 'node:crypto'

export type ShellRequest = { command: string; cwd: string }
export type ShellResult = { exitCode: number | null; stdout: string; stderr: string; interrupted: boolean; outputComplete: boolean }
/** PART 1 CONTRACT: inspect and execute are native, backend-enforced operations.
 * fingerprint binds engine/provider/session/root/permission configuration; no renderer assertions.
 * execute must revalidate that fingerprint and OS/file authority immediately before launch,
 * use bounded-output refusal or a complete retained output artifact, and NEVER auto-retry.
 */
export type VerifiedShellAdapter = {
  inspect(request: ShellRequest): Promise<{ supported: boolean; authorityFingerprint: string; explanation: string }>
  execute(request: ShellRequest, authorityFingerprint: string): Promise<ShellResult>
}
export function createChatShellReview(adapter?: VerifiedShellAdapter, now = Date.now) {
  const tickets = new Map<string, { request: ShellRequest; fingerprint: string; expiresAt: number }>()
  return {
    async preview(request: ShellRequest) {
      if (!adapter) throw Error('Verified shell transport is not integrated. Nothing was executed or sent as a prompt.')
      if (!request || typeof request.command !== 'string' || !request.command.trim() || request.command.length > 32_000 || request.command.includes('\0') || typeof request.cwd !== 'string' || !request.cwd || /[\x00-\x1f]/.test(request.cwd)) throw Error('Invalid command or working folder.')
      for (const [key, ticket] of tickets) if (ticket.expiresAt <= now()) tickets.delete(key)
      if (tickets.size >= 20) throw Error('Too many unreviewed shell requests.')
      const exact = { command: request.command, cwd: request.cwd }, inspected = await adapter.inspect(exact)
      if (!inspected.supported || !inspected.authorityFingerprint) throw Error(inspected.explanation || 'Shell execution is unsupported or unauthorized.')
      const token = randomUUID(), expiresAt = now() + 120_000
      tickets.set(token, { request: exact, fingerprint: inspected.authorityFingerprint, expiresAt })
      return { token, ...exact, expiresAt, explanation: inspected.explanation }
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
