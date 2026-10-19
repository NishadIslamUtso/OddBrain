/** Text-only reviewed replacement: attachments are owned by the parent and never cleared here. */
export function replaceDraft(current: { scope: string; text: string }, expected: { scope: string; text: string }, replacement: string): string {
  if (current.scope !== expected.scope || current.text !== expected.text) throw Error('The draft changed while this editor was open. Copy your edited text or append it explicitly; the current draft was kept.')
  return replacement
}
/** A late native picker response must not land in another chat or after a send. */
export function draftLease() {
  let generation = 0
  return { begin: () => ++generation, invalidate: () => { generation++ }, current: (request: number) => request === generation }
}

/** Template expansion happens before send. Native slash actions need Part 1's verified transport. */
export function looksLikeNativeSlashCommand(text: string): boolean {
  return /^\/[a-z][a-z0-9_-]*(?:\s|$)/i.test(text.trimStart())
}
