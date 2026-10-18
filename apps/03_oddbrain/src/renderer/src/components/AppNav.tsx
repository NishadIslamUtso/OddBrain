import { Brain, Database, FolderOpen, MessageSquare, Shapes, Sun } from 'lucide-react'

/**
 * The app's own sections, at the top of the sidebar.
 *
 * Every entry is a screen that exists — a nav that looks complete and is
 * not is worse than a short one that is. Code lives inside Projects (its
 * working folder is the project's); see the note below the items.
 */

export type View = 'chat' | 'artifacts' | 'today' | 'projects' | 'vault' | 'brain' | 'code'

const ITEMS: Array<{ id: View; label: string; Icon: typeof MessageSquare }> = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'artifacts', label: 'Artifacts', Icon: Shapes },
  { id: 'today', label: 'Today', Icon: Sun },
  { id: 'projects', label: 'Projects', Icon: FolderOpen },
  { id: 'vault', label: 'Vault', Icon: Database },
  { id: 'brain', label: 'Brain', Icon: Brain },
]

/**
 * Code is deliberately NOT in this nav: it is not a place you wander into,
 * it is a project's working folder — so it opens from the project itself
 * (its Code button), or from the menu's View > Code when no project fits.
 * A nav that lists every feature stops being a map of the work.
 */

export default function AppNav({
  view,
  onView,
  collapsed = false,
  artifactCount = 0,
}: {
  view: View
  onView: (view: View) => void
  collapsed?: boolean
  artifactCount?: number
}) {
  return (
    <nav aria-label="Sections" className={collapsed ? 'flex flex-col items-center gap-1 py-1' : 'mb-1 flex flex-col gap-0.5 pb-1'}>
      {ITEMS.map(({ id, label, Icon }) => {
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
              collapsed
                ? `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    active ? 'bg-white/[0.08] text-ink' : 'text-muted hover:bg-white/[0.06] hover:text-ink'
                  }`
                : `flex h-7 items-center gap-2 rounded-lg px-2 text-left text-[12.5px] transition-colors ${
                    active ? 'bg-white/[0.08] text-ink' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
                  }`
            }
          >
            <Icon size={13} className="shrink-0" />
            {collapsed ? null : <span className="flex-1">{label}</span>}
            {collapsed || id !== 'artifacts' || !artifactCount ? null : (
              <span className="text-[11px] text-muted">{artifactCount}</span>
            )}
          </button>
        )
      })}

    </nav>
  )
}
