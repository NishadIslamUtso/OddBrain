import { useEffect, useState } from 'react'
import { Plus, Terminal, Trash2 } from 'lucide-react'
import { getEngineApi } from '@/platform/bridge'
import { HOOK_EVENTS, type AppHook, type HookEvent } from '@shared/lib/hooks'

const EVENT_LABELS: Record<HookEvent, string> = {
  'turn-done': 'when a turn finishes',
  'turn-error': 'when a turn fails',
  permission: 'when a permission card waits',
}

/**
 * The Hooks pane: the owner's own commands at the engine's moments. Added
 * by hand, shown in full, run as-is on this machine — no templating, no
 * engine output piped in, nothing a pack could sneak in. Run once tries a
 * command before it is bound to anything.
 */
export default function HooksSection() {
  const [hooks, setHooks] = useState<AppHook[]>([])
  const [name, setName] = useState('')
  const [event, setEvent] = useState<HookEvent>('turn-done')
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [testOut, setTestOut] = useState('')

  const refresh = (): void => {
    void getEngineApi().hooks.list().then((answer) => setHooks((answer.hooks ?? []) as AppHook[]))
  }
  useEffect(refresh, [])

  const add = async (): Promise<void> => {
    setError('')
    setStatus('')
    const answer = await getEngineApi().hooks.save({ name, event, command })
    if (!answer.ok) {
      setError(answer.answer)
      return
    }
    setStatus(answer.answer)
    setName('')
    setCommand('')
    refresh()
  }

  const remove = async (id: string): Promise<void> => {
    const answer = await getEngineApi().hooks.remove(id)
    setStatus(answer.ok ? answer.answer : '')
    setError(answer.ok ? '' : answer.answer)
    refresh()
  }

  const runOnce = async (): Promise<void> => {
    setError('')
    const answer = await getEngineApi().hooks.test(command)
    setTestOut(answer.answer)
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-5">
      <header>
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <Terminal size={15} aria-hidden />
          Hooks
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Your own commands, run by the app when the engine's turn finishes, fails, or asks permission. The command runs
          as-is on this machine — no engine output is piped in, and a pack can never add one. A hook that fails is
          reported in the turn's story; it never breaks the work.
        </p>
      </header>

      {status ? (
        <p role="status" className="mt-3 rounded-lg border border-line bg-bg px-3 py-2 text-[12px] text-ink">{status}</p>
      ) : null}
      {error ? <p className="mt-3 text-[12px] text-warn">{error}</p> : null}

      <ul className="mt-4 space-y-2" aria-label="Set hooks">
        {hooks.map(hook => (
          <li key={hook.id} className="rounded-xl border border-line bg-card px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">
                  {hook.name}
                  <span className="ml-2 text-[11.5px] font-normal text-muted">{EVENT_LABELS[hook.event as HookEvent] ?? hook.event}</span>
                </p>
                <code className="mt-1 block break-words font-mono text-[11.5px] text-muted">{hook.command}</code>
              </div>
              <button
                type="button"
                onClick={() => void remove(hook.id)}
                aria-label={`Remove ${hook.name}`}
                className="shrink-0 rounded-lg border border-line p-1.5 text-muted hover:text-warn"
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
          </li>
        ))}
        {hooks.length === 0 ? (
          <li className="rounded-xl border border-line bg-card px-3 py-3 text-[12.5px] text-muted">
            No hooks yet. One honest starter: run your formatter when a turn finishes.
          </li>
        ) : null}
      </ul>

      <div className="mt-4 rounded-xl border border-line bg-card px-3 py-3">
        <p className="text-[12.5px] font-medium text-ink">Set a hook</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="name — Run the formatter"
            aria-label="Hook name"
            className="w-[190px] rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted"
          />
          <select
            value={event}
            onChange={event => setEvent(event.target.value as HookEvent)}
            aria-label="The moment the hook runs at"
            className="rounded-lg border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink outline-none"
          >
            {HOOK_EVENTS.map(moment => (
              <option key={moment} value={moment}>{EVENT_LABELS[moment]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void add()}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] text-ink hover:border-ok"
          >
            <Plus size={12} aria-hidden />
            Set
          </button>
        </div>
        <input
          type="text"
          value={command}
          onChange={event => setCommand(event.target.value)}
          placeholder="the command, run as-is — npx prettier --write ."
          aria-label="Hook command"
          className="mt-2 w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none placeholder:text-muted"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void runOnce()}
            className="rounded-lg border border-line px-2.5 py-1 text-[11.5px] text-muted hover:text-ink"
          >
            Run once (without setting it)
          </button>
          {testOut ? <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-muted">{testOut}</span> : null}
        </div>
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        Hooks are yours alone: they live in this app's data folder as plain JSON, and a plugin pack that tries to
        contribute one is refused by the pack rules — a hook is a command on your machine, so it is only ever added by you.
      </p>
    </div>
  )
}
