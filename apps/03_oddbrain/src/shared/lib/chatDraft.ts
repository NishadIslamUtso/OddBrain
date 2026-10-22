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

/** App-owned, read-only equivalents for a deliberately tiny command set.
 * They are handled by the composer and are never forwarded to a native CLI. */
export type SafeSlashAction = 'help' | 'status' | 'doctor' | 'cost'
export function safeSlashAction(text: string): SafeSlashAction | null {
  const match = /^\/(help|status|doctor|cost)\s*$/i.exec(text.trim())
  return match ? match[1].toLowerCase() as SafeSlashAction : null
}

/** Template expansion happens before send. Every other leading slash command is
 * refused rather than guessed or forwarded to an interactive terminal. */
export function looksLikeNativeSlashCommand(text: string): boolean {
  return /^\/[a-z][a-z0-9_-]*(?:\s|$)/i.test(text.trimStart())
}
