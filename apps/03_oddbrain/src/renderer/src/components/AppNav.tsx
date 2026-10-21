import { Brain, Database, Film, FolderOpen, MessageSquare, Shapes, Sun } from 'lucide-react'

/**
 * The app's own sections, at the top of the sidebar.
 *
 * Every entry is a screen that exists — a nav that looks complete and is
 * not is worse than a short one that is. The standalone Code screen is
 * retired: its board lives inside Projects (its working folder is the
 * project's). A saved `code` screen resolves to Projects via
 * state/viewRoute.ts, so old links land where the board went.
 */

export type View = 'chat' | 'video' | 'artifacts' | 'today' | 'projects' | 'vault' | 'brain'

export const NAV_ITEMS: Array<{ id: View; label: string; Icon: typeof MessageSquare }> = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'video', label: 'Video Studio', Icon: Film },
  { id: 'artifacts', label: 'Artifacts', Icon: Shapes },
  { id: 'today', label: 'Today', Icon: Sun },
  { id: 'projects', label: 'Projects', Icon: FolderOpen },
  { id: 'vault', label: 'Vault', Icon: Database },
  { id: 'brain', label: 'Brain', Icon: Brain },
]

/**
 * Code is deliberately NOT in this nav and no longer a screen at all:
 * its session board, folder and linked-file controls are per-project
 * surfaces now (components/ProjectSessions.tsx inside ProjectsView).
 * A nav that lists every feature stops being a map of the work.
 */

export default function AppNav({
  view,
  onView,
  collapsed = false,
  artifactCount = 0,
  horizontal = false,
  waiting = 0,
}: {
  view: View
  onView: (view: View) => void
  collapsed?: boolean
  artifactCount?: number
  horizontal?: boolean
  waiting?: number
}) {
  return (
    <nav aria-label="Sections" className={horizontal ? 'ob-horizontal-nav' : collapsed ? 'flex flex-col items-center gap-1 py-1' : 'mb-1 flex flex-col gap-0.5 pb-1'}>
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const active = view === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onView(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            title={label}
            className={
              horizontal ? `ob-nav-tab ${active ? 'is-current' : ''}` : collapsed
                ? `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    active ? 'bg-white/[0.08] text-ink' : 'text-muted hover:bg-white/[0.06] hover:text-ink'
                  }`
                : `flex h-7 items-center gap-2 rounded-lg px-2 text-left text-[12.5px] transition-colors ${
                    active ? 'bg-white/[0.08] text-ink' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
                  }`
            }
          >
            <Icon size={13} className="shrink-0" />
            {collapsed ? null : <span className={horizontal ? '' : 'flex-1'}>{label}</span>}
            {id === 'chat' && waiting > 0 ? <span className="ob-approval-count" aria-label={`${waiting} approvals waiting`}>{waiting}</span> : null}
            {collapsed || id !== 'artifacts' || !artifactCount ? null : (
              <span className="text-[11px] text-muted">{artifactCount}</span>
            )}
          </button>
        )
      })}

    </nav>
  )
}
