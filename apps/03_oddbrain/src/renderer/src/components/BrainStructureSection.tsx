import { useEffect, useState } from 'react'
import { bridge } from '../platform/bridge'
import ConnectionGraph from './ConnectionGraph'
import type { VaultState } from '../hooks/useVault'

/**
 * The Vault pane (his note: keep it compressed): the two decisions on top —
 * Choose folder… / Use default (Documents\OddBrain\Brain) — then the 3D
 * connections graph, then ONE collapsed box holding everything else: the
 * integration status, conflicts with their settle buttons, rulebook refresh,
 * and the link count. Nothing that is fine asks for attention; open the box
 * only when something says it needs you.
 */

type Inspection = { ok: boolean; kind?: string; present?: string[]; missing?: string[]; differing?: string[]; conflicts?: Array<{ original: string; added: string }>; error?: string }
type Conflict = { original: string; added: string }
type Links = { files: number; checked: number; dead: Array<{ from: string; target: string }>; ambiguous: Array<{ from: string; target: string; matches: string[] }>; edges: Array<{ from: string; to: string }>; error?: string }

export default function BrainStructureSection({
  vault,
  isDemo,
  onChanged,
  onOpenBrain,
}: {
  vault: VaultState
  isDemo: boolean
  onChanged: () => void
  /** The same graph, first-class: opens the Brain view and closes this sheet. */
  onOpenBrain?: () => void
}) {
  const path = vault.path
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [links, setLinks] = useState<Links | null>(null)
  const [open, setOpen] = useState(false)

  const inspect = (root: string): void => {
    bridge.structure
      .inspect(root)
      .then(result => {
        setInspection(result)
        setConflicts(result.conflicts ?? [])
      })
      .catch(() => setInspection({ ok: false, error: 'The folder could not be inspected.' }))
  }

  useEffect(() => {
    if (isDemo || !path) return
    inspect(path)
  }, [path, isDemo])

  async function integrate(root: string): Promise<void> {
    try {
      const result = await bridge.structure.apply(root)
      if (!result.ok) {
        setNotice(result.error || 'Nothing was written.')
        return
      }
      const written = result.written ?? []
      const fresh = (result.conflicts ?? []).length
      const parts: string[] = []
      if (written.length) parts.push(`Structure added: ${written.length} file${written.length === 1 ? '' : 's'}.`)
      if (fresh) parts.push(`${fresh} file${fresh === 1 ? ' exists' : 's exist'} in two wordings, yours was kept, the default sits beside it.`)
      setNotice(parts.join(' ') || 'Structure already in place, nothing to add.')
      if (fresh) setOpen(true)
      setConflicts(result.conflicts ?? [])
      inspect(root)
    } catch (error) {
      setNotice((error as Error).message)
    }
  }

  async function choose(): Promise<void> {
    const folder = await bridge.vault.chooseFolder()
    if (!folder) return
    setBusy(true)
    setNotice('')
    try {
      const result = await bridge.settings.update({ vaultPath: folder })
      if (!result.ok) {
        setNotice(result.error || 'That folder could not be used.')
        return
      }
      onChanged()
      await integrate(folder)
    } catch (error) {
      setNotice((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function useDefault(): Promise<void> {
    setBusy(true)
    setNotice('')
    try {
      const result = await bridge.vault.useDefault()
      if (!result.ok) {
        setNotice(result.error || 'The default folder could not be used.')
        return
      }
      onChanged()
      setConflicts(result.conflicts ?? [])
      const written = result.written ?? []
      setNotice(
        written.length
          ? `Default vault set up at ${result.path}, ${written.length} structure file${written.length === 1 ? '' : 's'} written.`
          : `Default vault at ${result.path}, already complete.`
      )
      inspect(result.path || '')
    } catch (error) {
      setNotice((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function settle(conflict: Conflict, action: 'mine' | 'new' | 'both' | 'combine'): Promise<void> {
    setBusy(true)
    setNotice('')
    try {
      const result = await bridge.structure.resolve(path, conflict.original, conflict.added, action)
      if (!result.ok) {
        setNotice(result.error || 'The choice could not be applied.')
        return
      }
      setConflicts(current => current.filter(entry => entry.added !== conflict.added))
      setNotice(`${conflict.original}: settled, ${action === 'mine' ? 'yours kept' : action === 'new' ? 'default kept' : action === 'both' ? 'both kept' : 'combined'}.`)
      inspect(path)
    } catch (error) {
      setNotice((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function refreshRules(): Promise<void> {
    setBusy(true)
    setNotice('')
    try {
      const result = await bridge.structure.apply(path, { refresh: true })
      if (!result.ok) {
        setNotice(result.error || 'Nothing was written.')
        return
      }
      const refreshed = result.refreshed ?? []
      setNotice(refreshed.length ? `Replaced with the current wording: ${refreshed.join(', ')}. Notes were never touched.` : 'Already up to date.')
      inspect(path)
    } catch (error) {
      setNotice((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function checkLinks(): Promise<void> {
    setBusy(true)
    try {
      setLinks(await bridge.structure.linkCheck())
    } catch (error) {
      setLinks({ files: 0, checked: 0, dead: [], ambiguous: [], edges: [], error: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (isDemo) {
    return <p className="text-[12px] text-muted">Choosing the vault folder happens in the desktop app, where the real folder is.</p>
  }

  const counts = inspection?.ok ? `${inspection.present?.length ?? 0} of ${(inspection.present?.length ?? 0) + (inspection.missing?.length ?? 0)} structure files` : ''
  const linksLine = links
    ? links.error
      ? links.error
      : `${links.checked} links across ${links.files} notes, ${links.dead.length} dead, ${links.ambiguous.length} ambiguous, ${links.edges.length} connected.`
    : ''

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-lg border border-line px-3 py-2 text-[12.5px] hover:bg-white/[0.06] disabled:opacity-50"
          onClick={() => void choose()}
          disabled={busy}
          aria-label="Choose folder"
        >
          Choose folder…
        </button>
        <button
          className="rounded-lg border border-line px-3 py-2 text-[12.5px] hover:bg-white/[0.06] disabled:opacity-50"
          onClick={() => void useDefault()}
          disabled={busy}
          aria-label="Use the default folder"
        >
          Use default
        </button>
        {onOpenBrain ? (
          <button
            className="rounded-lg border border-line px-3 py-2 text-[12.5px] hover:bg-white/[0.06]"
            onClick={onOpenBrain}
            aria-label="Open the 3D brain"
          >
            Open the 3D brain
          </button>
        ) : null}
      </div>
      {path ? (
        <p className="break-all text-[11.5px] text-muted">
          {path}
          {counts ? ` · ${counts}` : ''}
        </p>
      ) : (
        <p className="text-[11.5px] text-muted">No folder chosen yet, the default is Documents\OddBrain\Brain.</p>
      )}
      {notice ? (
        <p className="break-words text-[12px]" role="status">
          {notice}
        </p>
      ) : null}

      <ConnectionGraph path={path} isDemo={isDemo} />

      <details
        className="rounded-lg border border-line bg-card px-2.5 py-2"
        open={open}
        onToggle={event => setOpen((event.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer select-none text-[12px] text-muted hover:text-ink">
          Structure details
          {conflicts.length ? (
            <span className="ml-1.5 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-ink">
              {conflicts.length} to settle
            </span>
          ) : null}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {conflicts.length ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11.5px] text-muted">
                In two wordings, yours and the app's default. Pick now, or leave them; both files stay.
              </p>
              {conflicts.map(conflict => (
                <div key={conflict.original} className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 break-all text-[12px]">{conflict.original}</span>
                  {(['mine', 'new', 'both', 'combine'] as const).map(action => (
                    <button
                      key={action}
                      className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void settle(conflict, action)}
                      aria-label={`${action}: ${conflict.original}`}
                    >
                      {action === 'mine' ? 'Keep mine' : action === 'new' ? 'Use new' : action === 'both' ? 'Both' : 'Combine'}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          {inspection?.ok && inspection.differing?.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-[11.5px] text-muted">
                Newer wording available for {inspection.differing.join(', ')}, notes never touched.
              </span>
              <button
                className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
                disabled={busy}
                onClick={() => void refreshRules()}
                aria-label="Replace with current wording"
              >
                Replace
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {linksLine ? (
              <span className="min-w-0 flex-1 break-words text-[11.5px] text-muted" role="status">
                {linksLine}
              </span>
            ) : null}
            {path ? (
              <button
                className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
                disabled={busy}
                onClick={() => void checkLinks()}
                aria-label="Count links"
              >
                Count links
              </button>
            ) : null}
          </div>
          {!conflicts.length && !(inspection?.ok && inspection.differing?.length) && !links ? (
            <p className="text-[11.5px] text-muted">Nothing needs you here. The structure integrates itself on every choice and at boot.</p>
          ) : null}
        </div>
      </details>
    </div>
  )
}
