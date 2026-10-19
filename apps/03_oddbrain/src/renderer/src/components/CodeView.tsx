import { Mascot } from '../motion/Mascot'
import ProjectSessions from './ProjectSessions'

/**
 * Code — retired as a standalone screen, preserved as a landing.
 *
 * The board that used to live here (the engine's resumable threads, the
 * owner's linked files, the Done control, the workspace picker) now lives
 * in Projects, in the project whose folder it describes. Until the
 * coordinator removes the last `code` routes (see the Part 2 handoff),
 * this stays as the safe destination for a saved `code` location: the
 * same board, fully working, with the way onward made plain. No session
 * data is migrated or discarded by retiring the screen — the ids below
 * are the engine's own, untouched.
 */
export default function CodeView({
  focusFolder = '',
  onClearFocus,
}: {
  focusFolder?: string
  onClearFocus?: () => void
}) {
  return (
    <div className="ob-workspace-page ob-code-view flex-1 overflow-y-auto" aria-label="Code (moved to Projects)">
      <div className="mx-auto w-full max-w-[var(--chat-width)] px-4 py-8">
        <header className="ob-screen-header flex items-center gap-2.5">
          <Mascot motion="type" size={32} static />
          <h1 className="text-[20px] font-semibold text-ink">Code has moved into Projects</h1>
        </header>
        <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
          The session board, folder controls and linked files now live with the project they belong to. This page is
          kept so an old link or a saved screen still lands somewhere sensible — the board below is the real one,
          and nothing about your threads changed.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('app:open-projects'))}
          className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] transition-colors hover:bg-accent/90"
        >
          Open Projects
        </button>
        <div className="mt-6">
          <ProjectSessions focusFolder={focusFolder} onClearFocus={onClearFocus} showWorkspace />
        </div>
      </div>
    </div>
  )
}
