/**
 * Hook definitions are event reminders, not standing command authority.
 *
 * An earlier implementation called exec() directly when an engine event arrived.
 * That bypassed the app's one-use OS-command review. Events now report which
 * hook is ready; execution goes through the ordinary command runner in the Hooks
 * pane, with its exact script, folder, shell, expiry and fresh Allow press.
 */
import { validateHook, type AppHook, type HookEvent } from '../shared/lib/hooks'

export type HookStore = {
  load(): AppHook[]
  save(hooks: AppHook[]): void
}

export function createHookRunner(store: HookStore, _legacyTimeoutMs?: number) {
  return {
    /** Report matching hooks without granting or exercising command authority. */
    run: async (moment: HookEvent): Promise<string[]> =>
      store.load()
        .filter(hook => hook.event === moment)
        .map(hook => `Hook "${hook.name}" is ready but did not run automatically. Review and allow its exact command once in Settings → Hooks.`),
    /** Kept as a fail-closed compatibility endpoint for older renderer builds. */
    test: async (_command: string): Promise<{ ok: boolean; answer: string }> => ({
      ok: false,
      answer: 'Direct hook execution is off. Prepare the command review and allow it once in Settings → Hooks.',
    }),
    /** Add or replace by id, through the same validation as the door. */
    upsert: (input: Partial<AppHook>): { ok: boolean; answer: string } => {
      const checked = validateHook(input)
      if (!checked.ok) return checked
      const hooks = store.load().filter(hook => hook.id !== checked.hook.id)
      if (hooks.length >= 20) return { ok: false, answer: 'Twenty hooks is the shelf. Remove one first.' }
      hooks.push(checked.hook)
      store.save(hooks)
      return { ok: true, answer: `Hook "${checked.hook.name}" set on ${checked.hook.event}. It will still need a fresh command review each time.` }
    },
    remove: (id: string): { ok: boolean; answer: string } => {
      const hooks = store.load()
      const kept = hooks.filter(hook => hook.id !== id)
      if (kept.length === hooks.length) return { ok: false, answer: `No hook named ${id} is set.` }
      store.save(kept)
      return { ok: true, answer: 'Removed. The command runs no more.' }
    },
  }
}

export type HookRunner = ReturnType<typeof createHookRunner>
