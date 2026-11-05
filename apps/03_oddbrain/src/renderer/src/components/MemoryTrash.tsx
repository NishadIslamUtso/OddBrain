import type { Chat } from '@shared/types'
import useProjects from '@/state/projects'

/** First shared recoverable Trash surface. Permanent deletion is deliberately not
 * exposed until Memory_OB can produce a complete dependency/cascade preview. */
export default function MemoryTrash({ chats, onRestoreChat }: { chats: Chat[]; onRestoreChat: (chatId: string) => void }) {
  const trashedChats = chats.filter(chat => chat.lifecycle === 'trash')
  const { allProjects, restore, error } = useProjects(true)
  const trashedProjects = allProjects.filter(project => project.lifecycle === 'trash')
  return <div className="space-y-4">
    <section className="rounded-xl border border-line bg-card p-4"><h2 className="text-sm font-semibold text-ink">Memory_OB Trash</h2><p className="mt-1 text-xs leading-relaxed text-muted">Nothing here expires automatically. Stable IDs, source evidence and dependency links are retained. Restore returns the same object. Permanent deletion stays unavailable until the complete dependency impact can be shown to the owner.</p></section>
    {error ? <p role="status" className="text-xs text-warn">{error}</p> : null}
    <section className="rounded-xl border border-line bg-card p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">App chats · {trashedChats.length}</h3>{trashedChats.length ? <ul className="mt-2 space-y-2">{trashedChats.map(chat => <li key={chat.id} className="flex items-center gap-3 rounded-lg border border-line p-2"><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-ink">{chat.title}</strong><small className="text-[10.5px] text-muted">{chat.messages.length} messages · moved {chat.trash?.at ? new Date(chat.trash.at).toLocaleString() : 'at an unknown time'} · {chat.trash?.reason || 'No reason recorded'}</small></span><button type="button" className="ob-small-button" onClick={() => onRestoreChat(chat.id)}>Restore</button></li>)}</ul> : <p className="mt-2 text-xs text-muted">No app chats are in Trash.</p>}</section>
    <section className="rounded-xl border border-line bg-card p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Projects · {trashedProjects.length}</h3>{trashedProjects.length ? <ul className="mt-2 space-y-2">{trashedProjects.map(project => <li key={project.id} className="flex items-center gap-3 rounded-lg border border-line p-2"><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-ink">{project.name}</strong><small className="text-[10.5px] text-muted">Stable Project ID retained · {project.trash?.reason || 'Moved to Trash'}</small></span><button type="button" className="ob-small-button" onClick={() => void restore(project.id)}>Restore</button></li>)}</ul> : <p className="mt-2 text-xs text-muted">No Projects are in Trash.</p>}</section>
  </div>
}
