import BrainMark from './BrainMark'
import FindBar from './FindBar'
import type { VaultState } from '../hooks/useVault'
import { usePermissionsWaiting } from '../state/engine'

/**
 * The bar across the top. The window frame is the operating system's, so this is
 * not a substitute title bar — it is the app's own header: what this is, and
 * whether the two local services it depends on are up.
 */
export default function TitleBar({
  engineId,
  engineModel,
  engineAlive,
  preview = false,
  vault,
  onOpenEngine,
}: {
  /** Which engine the app drives, and with which brain — the engine's facts. */
  engineId: string
  engineModel: string
  engineAlive: boolean
  /** In the browser there is no machine behind the window. */
  preview?: boolean
  /** The vault, when the app is running where one can exist. The chip is the
   *  mockup's second indicator: green when conversations are being kept. */
  vault?: VaultState
  /** Where the "needs you" chip takes a person — the screen with the cards. */
  onOpenEngine?: () => void
}) {
  // A slice, not the whole store: this re-renders only when the COUNT of
  // waiting questions changes, not on every streamed token.
  const waiting = usePermissionsWaiting()
  const state = preview ? 'Preview' : `${engineId} · ${engineModel}`

  return (
    <>
      <FindBar />
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-3.5">
        <BrainMark size={20} />
        <span className="text-[13px] font-medium tracking-tight">OddBrain</span>

      <div className="ml-auto flex items-center gap-2">
        <span
          className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted"
          title={
            preview
              ? 'This is the interface, running in a browser. Your engines and files are on your machine, in the desktop app.'
              : engineAlive
              ? `${engineId} is running on this machine, thinking with ${engineModel}.`
              : `${engineId} starts with the next task. It thinks with ${engineModel}.`
          }
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${preview ? 'bg-muted' : engineAlive ? 'bg-ok' : 'bg-muted'}`}
          />
          {state}
        </span>

        {/* Needs you: a question from the engine is waiting on a person and a
            person may be three screens away. Claudette's tray idea, wearing our
            header's face. Clicking it opens the screen with the cards. */}
        {!preview && waiting > 0 && (
          <button
            type="button"
            onClick={onOpenEngine}
            title={`${waiting} question${waiting === 1 ? '' : 's'} from the engine ${waiting === 1 ? 'is' : 'are'} waiting for you. Click to open the cards.`}
            className="flex items-center gap-1.5 rounded-full border border-warn/60 bg-warn/10 px-2.5 py-1 text-[11px] text-ink"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-warn" />
            Needs you{waiting > 1 ? ` · ${waiting}` : ''}
          </button>
        )}

        {!preview && vault && vault.state !== 'unknown' && (
          <span
            className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted"
            title={
              vault.state === 'ready'
                ? `Conversations are kept in ${vault.path}.`
                : vault.state === 'missing'
                  ? `${vault.error} Nothing is written until you point the app at a vault.`
                  : vault.state === 'off'
                    ? 'Keeping conversations is switched off in Settings > Agent access. Nothing is written to your vault.'
                    : 'The vault could not be reached. Conversations are being kept in this app only.'
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                vault.state === 'ready'
                  ? 'bg-ok'
                  : vault.state === 'missing'
                    ? 'bg-warn'
                    : 'bg-muted'
              }`}
            />
            {vault.state === 'ready'
              ? 'Vault'
              : vault.state === 'missing'
                ? 'No vault'
                : vault.state === 'off'
                  ? 'Vault off'
                  : 'Vault offline'}
          </span>
        )}
      </div>
      </header>
    </>
  )
}
