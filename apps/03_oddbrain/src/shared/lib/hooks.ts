/**
 * Hooks: the owner's own commands, run by the app when the engine's turn
 * ends, fails, or asks permission. Claude Code calls these hooks inside its
 * own CLI; here they are the app's, so they work on every engine — and they
 * are the OWNER's alone: added by hand in Settings, shown in full, never
 * contributed by a pack (a pack that tries is refused by the manifest
 * rules — the poisoned-recipe lesson, holding at every door).
 */

export const HOOK_EVENTS = ['turn-done', 'turn-error', 'permission'] as const
export type HookEvent = (typeof HOOK_EVENTS)[number]

export type AppHook = {
  /** Stable id: the slug of the name it was born with. */
  id: string
  name: string
  event: HookEvent
  /** The command, run as-is on this machine. No templating, no secrets. */
  command: string
}

export function hookSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug
}

export const HOOK_TIMEOUT_MS = 10_000

export function validateHook(input: Partial<AppHook>): { ok: true; hook: AppHook } | { ok: false; answer: string } {
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, answer: 'A hook needs a name.' }
  if (name.length > 40) return { ok: false, answer: 'Keep the name under 40 characters.' }
  const id = hookSlug(name)
  if (!id) return { ok: false, answer: 'The name needs at least one letter or number.' }
  if (!HOOK_EVENTS.includes(input.event as HookEvent)) {
    return { ok: false, answer: `The moment must be one of: ${HOOK_EVENTS.join(', ')}.` }
  }
  const command = (input.command ?? '').trim()
  if (!command) return { ok: false, answer: 'A hook needs a command to run.' }
  if (command.length > 500) return { ok: false, answer: 'Keep the command under 500 characters.' }
  return { ok: true, hook: { id, name, event: input.event as HookEvent, command } }
}

/** What the turn's story says when a hook has run. */
export function hookStatusLine(name: string, exit: number | null, ms: number, out: string): string {
  const where = out.trim() ? `: ${out.trim().slice(0, 160)}` : ''
  if (exit === 0) return `Hook "${name}" ran, exit 0 (${(ms / 1000).toFixed(1)}s)${where}`
  if (exit === null) return `Hook "${name}" did not finish in ${(ms / 1000).toFixed(1)}s and was stopped${where}`
  return `Hook "${name}" ended with exit ${exit} (${(ms / 1000).toFixed(1)}s)${where}`
}
