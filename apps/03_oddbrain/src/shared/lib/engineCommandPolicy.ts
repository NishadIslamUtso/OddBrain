/** These streams accept tasks, not the interactive terminal's command palette.
 * No model response may stand in for an executed command. The composer handles
 * its explicit read-only /help, /status, /doctor and /cost app controls before
 * dispatch; this boundary still refuses every slash command it receives. Slash
 * templates are expanded before dispatch and literal paths in prose are fine. */
export function engineCommandRefusal(prompt: string): string | null {
  const match = /^\/([a-z][a-z0-9_-]*)(?:\s|$)/i.exec(prompt.trim())
  if (!match) return null
  const name = match[1].toLowerCase()
  const hints: Record<string, string> = {
    model: 'Use the model picker.', effort: 'Use Reasoning effort in the engine menu.',
    permissions: 'Use the engine permission controls; native rules still apply.',
    mcp: 'Use Settings → Connectors.', plugin: 'Use the engine plugin store.', skills: 'Use Settings → Skills.',
    login: 'Use the engine’s own terminal sign-in.', logout: 'Use the engine’s own terminal to sign out.',
    status: 'Use Settings → Engine or Connectors.', reload: 'Use Restart connection while idle; plugin loading still needs verification.',
    clear: 'Use the app’s explicit session controls; this text cannot clear a native session.',
    compact: 'Use the app’s context/compaction controls; no native compaction is claimed.',
  }
  return `/${match[1]} was not sent as a task. ${hints[name] || 'This terminal command or skill invocation has no verified dispatch here. Use a supported app control or the engine’s terminal.'} To discuss the literal text, include it in a normal sentence.`
}
