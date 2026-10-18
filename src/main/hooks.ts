/**
 * The hook runner: real commands, really run, really bounded. A hook that
 * hangs is stopped and SAID to be stopped; a hook that fails is reported
 * where the turn's story is read — never swallowed, never fatal to the
 * engine's work. The command runs as-is (no templating, no engine output
 * piped in): hooks react to moments, they do not touch the work.
 */
import { exec } from 'node:child_process'
import { HOOK_TIMEOUT_MS, hookStatusLine, validateHook, type AppHook, type HookEvent } from '../shared/lib/hooks'

export type HookStore = {
  load(): AppHook[]
  save(hooks: AppHook[]): void
}

export type HookOutcome = { name: string; exit: number | null; ms: number; out: string }

export function createHookRunner(store: HookStore, timeoutMs = HOOK_TIMEOUT_MS) {
  const runOne = (command: string): Promise<HookOutcome> =>
    new Promise((resolve) => {
      const started = Date.now()
      exec(command, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
        const ms = Date.now() - started
        // A stopped hook is not a failed one: killed says the timeout won.
        const killed = (error as { killed?: boolean } | null)?.killed === true
        const code = typeof error?.code === 'number' ? error.code : error ? -1 : 0
        const exit = killed ? null : code
        const out = `${stdout}${stderr}`.slice(0, 400)
        resolve({ name: '', exit, ms, out })
      })
    })

  return {
    /** Every hook bound to this moment, run in order; the story lines come back. */
    run: async (moment: HookEvent): Promise<string[]> => {
      const hooks = store.load().filter(hook => hook.event === moment)
      const lines: string[] = []
      for (const hook of hooks) {
        const outcome = await runOne(hook.command)
        lines.push(hookStatusLine(hook.name, outcome.exit, outcome.ms, outcome.out))
      }
      return lines
    },
    /** The pane's "Run once": try a command without binding it to anything. */
    test: async (command: string): Promise<{ ok: boolean; answer: string }> => {
      const outcome = await runOne(command)
      return { ok: outcome.exit === 0, answer: hookStatusLine('the command', outcome.exit, outcome.ms, outcome.out) }
    },
    /** Add or replace by id, through the same validation as the door. */
    upsert: (input: Partial<AppHook>): { ok: boolean; answer: string } => {
      const checked = validateHook(input)
      if (!checked.ok) return checked
      const hooks = store.load().filter(hook => hook.id !== checked.hook.id)
      if (hooks.length >= 20) return { ok: false, answer: 'Twenty hooks is the shelf. Remove one first.' }
      hooks.push(checked.hook)
      store.save(hooks)
      return { ok: true, answer: `Hook "${checked.hook.name}" set on ${checked.hook.event}.` }
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
