// NOT RUN. Fake adapters prove neither installed-engine support nor Windows authorization.
import { expect, test, vi } from 'vitest'
import { createChatShellReview } from '../src/main/chatShellReview'
const request = { command: 'echo reviewed', cwd: '/workspace' }
test('unwired shell transport refuses rather than forwarding a prompt', async () => {
  await expect(createChatShellReview().preview(request)).rejects.toThrow('not integrated')
})
test('deny, expired/replayed token and changed authority cannot execute', async () => {
  let now = 1, authority = 'initial'
  const execute = vi.fn(async () => ({ exitCode: 0, stdout: 'reviewed', stderr: '', interrupted: false, outputComplete: true }))
  const service = createChatShellReview({ inspect: async () => ({ supported: true, authorityFingerprint: authority, explanation: 'fixture' }), execute }, () => now)
  const denied = await service.preview(request); expect(await service.decide(denied.token, 'deny')).toEqual({ denied: true })
  await expect(service.decide(denied.token, 'allow')).rejects.toThrow()
  const changed = await service.preview(request); authority = 'revoked'; await expect(service.decide(changed.token, 'allow')).rejects.toThrow('changed')
  const expired = await service.preview(request); now += 120001; await expect(service.decide(expired.token, 'allow')).rejects.toThrow('expired')
  expect(execute).not.toHaveBeenCalled()
})
test('a reviewed exact request executes at most once and propagates native failure without retry', async () => {
  const execute = vi.fn(async () => { throw Error('native failed') })
  const service = createChatShellReview({ inspect: async () => ({ supported: true, authorityFingerprint: 'scope', explanation: '' }), execute })
  const input = { ...request }, ticket = await service.preview(input); input.command = 'unreviewed'
  await expect(service.decide(ticket.token, 'allow')).rejects.toThrow('native failed')
  await expect(service.decide(ticket.token, 'allow')).rejects.toThrow()
  expect(execute).toHaveBeenCalledExactlyOnceWith(request, 'scope')
})
