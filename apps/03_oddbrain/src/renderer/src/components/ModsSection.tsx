import { useEffect, useState } from 'react'
import { FolderOpen, Package, PackagePlus, RefreshCw, Trash2, Check, Palette, MessageSquare, BookOpen } from 'lucide-react'
import BrainMark from './BrainMark'
import { bridge, isDemo } from '@/platform/bridge'
import { describePermissions, type Pack } from '@shared/lib/packs'
import { readStored, writeStored } from '@shared/lib/storage'
import { savePrompt } from '@shared/lib/prompts'
import type { Appearance } from '../state/appearance'

/**
 * Settings > Extensions — mods, Phase 1.
 *
 * A pack is a folder with a manifest.json. This screen installs one from a
 * folder the person picks, says in plain words what it may do BEFORE it
 * lands, keeps every installed pack visible with its real path, and removes
 * one by undoing exactly what the install wrote. Skills deploy to every
 * engine; prompts join the prompt library; a theme becomes a look in Appearance.
 * No index, no server, no account — that is Phase 2's work, and it will be
 * the same list with a new source.
 */

type Listed = { pack: Pack; folder: string; installedAt: string; via?: string }

const THEMES_KEY = 'ai-assistant.pack-themes'

/** Themes seen at install, kept by pack id so a look can be re-applied later. */
/** What a pack's theme remembers: the token preset AND its own stylesheet — the whole style, per the owner's ruling. */
type StoredTheme = { appearance: Record<string, string>; css: string }

const packTheme = (id: string): StoredTheme | null => {
  const all = readStored<Record<string, StoredTheme>>(THEMES_KEY, {}, value => (typeof value === 'object' && value ? (value as Record<string, StoredTheme>) : {})).value
  return all[id] ?? null
}

const rememberTheme = (id: string, theme: StoredTheme): void => {
  const all = readStored<Record<string, StoredTheme>>(THEMES_KEY, {}, value => (typeof value === 'object' && value ? (value as Record<string, StoredTheme>) : {}) as Record<string, StoredTheme>).value
  writeStored(THEMES_KEY, { ...all, [id]: theme })
}

export default function ModsSection({
  onAppearanceChange,
  appearance,
}: {
  /** A theme is an appearance preset; applying it is the Appearance screen's own door. */
  onAppearanceChange: (appearance: Appearance) => void
  appearance: Appearance
}) {
  const [packs, setPacks] = useState<Listed[]>([])
  const [loading, setLoading] = useState(!isDemo)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState('')

  const refresh = (): void => {
    void bridge.mods
      .list()
      .then(list => setPacks(list as Listed[]))
      .catch(() => setPacks([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  const install = (): void => {
    if (busy || isDemo) return
    setBusy(true)
    setAnswer('')
    void bridge.mods
      .installFromFile()
      .then(reply => {
        if (!reply.ok) {
          setAnswer(reply.answer)
          return
        }
        // Prompts join the prompt library the composer's prompt features read — the renderer owns it.
        for (const prompt of reply.prompts ?? []) {
          try {
            savePrompt({ name: prompt.name, hint: 'from a pack', body: prompt.body })
          } catch {
            // A prompt that will not fit is skipped; the pack still stands.
          }
        }
        const theme = reply.themes?.[0]
        const pack = reply.pack
        if (theme && pack?.id) {
          const css = typeof theme.css === 'string' ? theme.css : ''
          rememberTheme(pack.id, { appearance: theme.appearance, css })
          onAppearanceChange({ ...currentAppearance(), ...theme.appearance, packCss: css, designSystem: '' } as Appearance)
          setApplied(theme.name)
        }
        setAnswer(reply.answer)
        refresh()
      })
      .catch(() => setAnswer('The install did not finish. Nothing is assumed installed.'))
      .finally(() => setBusy(false))
  }

  /** The appearance as it stands, so a theme layers onto it rather than resetting it. */
  const currentAppearance = (): Appearance => appearance

  const remove = (id: string): void => {
    if (busy || isDemo) return
    setBusy(true)
    void bridge.mods
      .remove(id)
      .then(reply => {
        setAnswer(reply.answer)
        refresh()
      })
      .finally(() => setBusy(false))
  }

  const installStarter = (): void => {
    if (busy || isDemo) return
    setBusy(true)
    setAnswer('')
    void bridge.mods
      .installStarter()
      .then(reply => {
        setAnswer(reply.answer)
        if (reply.ok) refresh()
      })
      .finally(() => setBusy(false))
  }

  const applyTheme = (pack: Pack): void => {
    const theme = packTheme(pack.id)
    if (!theme) {
      setAnswer(`No theme was kept for ${pack.name}. Reinstall the pack to bring its look back.`)
      return
    }
    // The whole style goes on: the token block AND the pack's own stylesheet.
    // One look at a time: a pack theme replaces any design system.
    onAppearanceChange({ ...currentAppearance(), ...theme.appearance, packCss: theme.css, designSystem: '' } as Appearance)
    setAnswer(`Theme applied from ${pack.name}${theme.css ? ' — its full stylesheet is on' : ''}.`)
  }

  if (isDemo) {
    // The source picker still renders in the preview: it is where a person
    // learns what will be asked, and the engine's own answer is what is
    // missing here, not the explanation.
    return (
      <div className="flex flex-col gap-3">
        <EngineMarketplaces />
        <p className="text-[12px] leading-relaxed text-muted">
          Installing a pack needs the desktop app. This window has no machine behind it, so nothing here claims a pack is
          installed.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-muted">
        A mod is a folder with a <span className="font-mono">manifest.json</span>, skills for the engines, prompts for the
        prompt library, a theme for the app. Nothing here comes from a server: you pick the folder, the app reads it in front of
        you, and every installed pack stays visible below with its real path.
      </p>

      <EngineMarketplaces />

      <button
        type="button"
        onClick={install}
        disabled={busy}
        className="flex w-fit items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink hover:border-accent disabled:opacity-60"
      >
        <FolderOpen size={13} aria-hidden /> Install from folder…
      </button>
      <button
        type="button"
        onClick={installStarter}
        disabled={busy}
        title="The app's own browser-page skill and one look, as a pack"
        className="flex w-fit items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink hover:border-accent disabled:opacity-60"
      >
        <BrainMark size={13} title="" /> Install starter pack
      </button>

      <ExportPack appearance={appearance} onExported={refresh} />

      {answer ? <p className="text-[12px] text-muted">{answer}</p> : null}
      {applied ? (
        <p className="text-[12px] text-ok">
          <Check size={12} className="inline" aria-hidden /> Theme “{applied}” applied, see Appearance.
        </p>
      ) : null}

      {loading ? (
        <p className="text-[12px] text-muted">Reading the installed packs…</p>
      ) : packs.length === 0 ? (
        <p className="text-[12px] text-muted">
          No mods installed yet. A pack is any folder shaped like this:
          <span className="mt-1 block rounded-md border border-line bg-panel p-2 font-mono text-[10.5px] leading-relaxed">
            {`manifest.json
skills/my-skill/SKILL.md
prompts/my-prompt.md
themes/paper.json`}
          </span>
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {packs.map(({ pack, folder, via }) => {
            const perms = describePermissions(pack)
            return (
              <li key={pack.id} className="rounded-xl border border-line bg-card p-3">
                <div className="flex items-start gap-2.5">
                  <Package size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink">
                      {pack.name}{' '}
                      <span className="text-[11px] text-muted">
                        v{pack.version} · {pack.author}
                      </span>
                      {via ? (
                        <span
                          className="ml-2 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted"
                          title={via === 'index' ? 'Installed from a store whose index pinned the checksum, verified at install.' : 'Shipped with the app.'}
                        >
                          {via === 'index' ? 'store · checksum verified' : 'shipped'}
                        </span>
                      ) : (
                        <span
                          className="ml-2 rounded-md border border-warn/50 px-1.5 py-0.5 text-[10px] text-warn"
                          title="Not from a store's index, you installed it from a folder yourself."
                        >
                          unverified
                        </span>
                      )}
                    </p>
                    {pack.description ? <p className="mt-0.5 text-[11.5px] text-muted">{pack.description}</p> : null}
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {[
                        pack.contributes.skills.length ? `${pack.contributes.skills.length} skill${pack.contributes.skills.length === 1 ? '' : 's'}` : '',
                        pack.contributes.prompts.length ? `${pack.contributes.prompts.length} prompt${pack.contributes.prompts.length === 1 ? '' : 's'}` : '',
                        pack.contributes.themes.length ? `${pack.contributes.themes.length} theme${pack.contributes.themes.length === 1 ? '' : 's'}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[11px] text-muted hover:text-ink">What it may do</summary>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {perms.map(line => (
                          <li key={line} className="text-[11px] leading-relaxed text-muted">
                            · {line}
                          </li>
                        ))}
                      </ul>
                    </details>
                    <p className="mt-1.5 truncate font-mono text-[10.5px] text-muted" title={folder}>
                      {folder}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {pack.contributes.themes.length ? (
                      <button
                        type="button"
                        title="Apply this pack's theme"
                        aria-label={`Apply the theme from ${pack.name}`}
                        onClick={() => applyTheme(pack)}
                        className="rounded-lg border border-line p-1.5 text-muted hover:text-ink"
                      >
                        <Palette size={12} aria-hidden />
                      </button>
                    ) : null}
                    {pack.contributes.prompts.length ? (
                      <span className="rounded-lg border border-line p-1.5 text-muted" title="Its prompts are saved to the prompt library">
                        <MessageSquare size={12} aria-hidden />
                      </span>
                    ) : null}
                    {pack.contributes.skills.length ? (
                      <span className="rounded-lg border border-line p-1.5 text-muted" title="Its skills are in every engine's folder">
                        <BookOpen size={12} aria-hidden />
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => remove(pack.id)}
                      disabled={busy}
                      title={`Remove ${pack.name}, undoes the skills it deployed`}
                      aria-label={`Remove ${pack.name}`}
                      className="rounded-lg border border-line p-1.5 text-muted hover:text-warn disabled:opacity-60"
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <CommunityPacks installed={packs.map(item => ({ id: item.pack.id, version: item.pack.version }))} onInstalled={refresh} />
    </div>
  )
}

/**
 * Phase 3 — publish. The engine's real skills (read from its folder, listed
 * here) and the app's current look become a pack folder with a ready-made
 * index.json entry beside it: send the folder to share it, or add it as an
 * index to install from it with the checksum check.
 */
function ExportPack({ appearance, onExported }: { appearance: Appearance; onExported: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState<Array<{ name: string; description: string }>>([])
  const [picked, setPicked] = useState<string[]>([])
  const [withTheme, setWithTheme] = useState(false)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || skills.length) return
    void bridge.skills.scan().then(list => {
      setSkills((list ?? []).map(item => ({ name: item.name, description: item.description })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const run = (): void => {
    if (busy) return
    setBusy(true)
    setAnswer('')
    void bridge.mods
      .exportPack({
        name,
        description,
        author: 'me',
        skills: picked,
        theme: withTheme ? { appearance: { accent: appearance.accent, width: appearance.width, textSize: appearance.textSize, font: appearance.font, motion: appearance.motion }, css: appearance.packCss || undefined } : null,
      })
      .then(reply => {
        setAnswer(reply.answer)
        if (reply.ok) onExported()
      })
      .finally(() => setBusy(false))
  }

  return (
    <details
      className="mt-1 rounded-xl border border-line bg-card p-3"
      onToggle={event => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-[12px] text-ink">
        Export as pack<span className="text-muted">, your skills and your look, as a folder you can send</span>
      </summary>

      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        The pack lands in your home folder under <span className="font-mono">OddBrain packs</span>, with an{' '}
        <span className="font-mono">index.json</span> beside it. Send the folder to share it; anyone can add it as an
        index above and install it with the checksum verified.
      </p>

      <div className="mt-2 flex flex-col gap-2">
        <input
          type="text"
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Pack name"
          aria-label="Export pack name"
          className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink placeholder:text-muted"
        />
        <input
          type="text"
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="What it is for (one line)"
          aria-label="Export pack description"
          className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink placeholder:text-muted"
        />
      </div>

      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Skills from this engine</p>
      {!skills.length ? (
        <p className="mt-1 text-[11.5px] text-muted">The engine's skill folder is empty, install or write skills first.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {skills.map(skill => (
            <li key={skill.name}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-0.5 hover:bg-white/[0.03]">
                <input
                  type="checkbox"
                  checked={picked.includes(skill.name)}
                  onChange={event =>
                    setPicked(current => (event.target.checked ? [...current, skill.name] : current.filter(item => item !== skill.name)))
                  }
                  aria-label={`Include the ${skill.name} skill`}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] text-ink">{skill.name}</span>
                  {skill.description ? <span className="block truncate text-[11px] text-muted">{skill.description}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-2 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={withTheme}
          onChange={event => setWithTheme(event.target.checked)}
          aria-label="Include the current look as a theme"
        />
        <span className="text-[12px] text-ink">Include the current look as a theme</span>
      </label>

      <button
        type="button"
        onClick={run}
        disabled={busy || !name.trim()}
        className="mt-2 w-fit rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink hover:border-accent disabled:opacity-60"
      >
        {busy ? 'Exporting…' : 'Export pack'}
      </button>
      {answer ? <p className="mt-1 text-[11.5px] text-muted">{answer}</p> : null}
    </details>
  )
}

type IndexEntryView = {
  id: string
  name: string
  version: string
  author: string
  downloadable?: boolean
  description: string
  permissions: Record<string, unknown>
  verified: boolean
  problem: string
}

/**
 * Phase 2 — the index client. A store is an index file, not a service: a
 * folder with index.json (a repo, a USB stick) or an https URL answering the
 * same JSON. Each entry shows what it may do in plain words and whether the
 * files on disk still match the checksum the index pinned; the install
 * re-checks and refuses a mismatch outright. Entries pointing at a download
 * are listed but not installable, and say so.
 */
function CommunityPacks({ installed, onInstalled }: {
  installed: Array<{ id: string; version: string; via?: string }>
  onInstalled: () => void
}) {
  const [indexes, setIndexes] = useState<Array<{ kind: 'folder' | 'url'; locator: string; addedAt: string }>>([])
  const [input, setInput] = useState('')
  const [answer, setAnswer] = useState('')
  const [browse, setBrowse] = useState<Record<string, { ok?: boolean; name?: string; packs?: IndexEntryView[]; problem?: string }>>({})
  const [busy, setBusy] = useState(false)
  const [community, setCommunity] = useState<{ ok: boolean; path?: string } | null>(null)

  const browseAll = (): void => {
    void bridge.mods.indexList().then(list => {
      setIndexes(list ?? [])
      for (const item of list ?? []) {
        void bridge.mods.indexBrowse(item.kind, item.locator).then(reply => {
          setBrowse(current => ({ ...current, [item.locator]: reply as { ok?: boolean; name?: string; packs?: IndexEntryView[]; problem?: string } }))
        })
      }
    })
  }

  useEffect(() => {
    browseAll()
    void bridge.mods.communityIndex?.().then(setCommunity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const add = (): void => {
    const text = input.trim()
    if (!text || busy) return
    setBusy(true)
    setAnswer('')
    const kind = /^https?:\/\//.test(text) ? 'url' : 'folder'
    void bridge.mods
      .indexAdd(kind, text)
      .then(reply => {
        setAnswer(reply.answer)
        if (reply.ok) {
          setInput('')
          browseAll()
        }
      })
      .finally(() => setBusy(false))
  }

  const install = (kind: string, locator: string, id: string): void => {
    if (busy) return
    setBusy(true)
    setAnswer('')
    void bridge.mods
      .indexInstall(kind, locator, id)
      .then(reply => {
        setAnswer(reply.answer)
        if (reply.ok) onInstalled()
      })
      .finally(() => setBusy(false))
  }

  return (
    <section className="mt-2 border-t border-line pt-3" aria-label="Community packs">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Community packs</h3>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
        A store is an index file, not a service: add a folder holding <span className="font-mono">index.json</span> (a repo, a
        USB stick) or an https URL that answers it, the app's own community store is offered below. Every entry says what
        it may do and whether its files still match the checksum the index pinned, a mismatch is refused, never installed.
      </p>

      {community?.ok && community.path && !indexes.some(item => item.kind === 'folder' && item.locator === community.path) ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-ink">The community store, shipped with this app</p>
            <p className="truncate text-[10.5px] text-muted" title={community.path}>
              {community.path}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (busy || !community.path) return
              setBusy(true)
              setAnswer('')
              void bridge.mods
                .indexAdd('folder', community.path)
                .then(reply => {
                  setAnswer(reply.answer)
                  if (reply.ok) browseAll()
                })
                .finally(() => setBusy(false))
            }}
            disabled={busy}
            className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink hover:border-accent disabled:opacity-60"
          >
            Add the community store
          </button>
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') add()
          }}
          placeholder="/path/to/packs  or  https://example.org/index.json"
          aria-label="Pack index folder or URL"
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] text-ink placeholder:text-muted"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !input.trim()}
          className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink hover:border-accent disabled:opacity-60"
        >
          <PackagePlus size={12} aria-hidden /> Add index
        </button>
        <button
          type="button"
          onClick={browseAll}
          title="Re-read every added index"
          aria-label="Refresh indexes"
          className="rounded-lg border border-line p-1.5 text-muted hover:text-ink"
        >
          <RefreshCw size={12} aria-hidden />
        </button>
      </div>

      {answer ? <p className="mt-1 text-[11.5px] text-muted">{answer}</p> : null}

      {!indexes.length ? (
        <p className="mt-2 text-[11.5px] text-muted">No pack indexes added yet.</p>
      ) : (
        indexes.map(index => {
          const result = browse[index.locator]
          return (
            <div key={index.locator} className="mt-3 rounded-xl border border-line bg-card p-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-[12.5px] text-ink">
                  {result?.ok ? result.name : result ? 'This index cannot be read.' : 'Reading…'}{' '}
                  <span className="block truncate font-mono text-[10.5px] text-muted" title={index.locator}>
                    {index.locator}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void bridge.mods.indexRemove(index.locator).then(() => browseAll())
                  }}
                  aria-label={`Remove the index at ${index.locator}`}
                  className="rounded-lg border border-line p-1.5 text-muted hover:text-warn"
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </div>

              {result && result.ok === false ? (
                <p className="mt-1.5 text-[11.5px] text-warn">{result.problem}</p>
              ) : !result ? (
                <p className="mt-1.5 text-[11.5px] text-muted">Reading the index…</p>
              ) : !result.packs?.length ? (
                <p className="mt-1.5 text-[11.5px] text-muted">This index lists no packs.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {result.packs.map(entry => {
                    const have = installed.find(item => item.id === entry.id)
                    const perms = describePermissions({
                      id: entry.id,
                      name: entry.name,
                      version: entry.version,
                      author: entry.author,
                      description: entry.description,
                      license: 'unspecified',
                      permissions: entry.permissions as Pack['permissions'],
                      contributes: { skills: [], prompts: [], themes: [] },
                    })
                    return (
                      <li key={entry.id} className="rounded-lg border border-line p-2.5">
                        <p className="text-[12.5px] text-ink">
                          {entry.name}{' '}
                          <span className="text-[11px] text-muted">
                            v{entry.version} · {entry.author}
                          </span>
                          {have ? (
                            <span className="ml-2 rounded-md border border-ok/50 px-1.5 py-0.5 text-[10px] text-ok">
                              {have.version === entry.version ? 'installed' : `installed v${have.version}`}
                            </span>
                          ) : entry.verified ? (
                            <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">checksum verified</span>
                          ) : entry.downloadable ? (
                            <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">download · checked on arrival</span>
                          ) : (
                            <span className="ml-2 rounded-md border border-warn/50 px-1.5 py-0.5 text-[10px] text-warn">not installable</span>
                          )}
                        </p>
                        {entry.description ? <p className="mt-0.5 text-[11.5px] text-muted">{entry.description}</p> : null}
                        {!entry.verified && entry.problem ? <p className="mt-0.5 text-[11px] text-warn">{entry.problem}</p> : null}
                        {entry.downloadable ? <p className="mt-0.5 text-[11px] text-muted">Downloads beside its index, then must match the pinned checksum byte for byte before anything installs.</p> : null}
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-muted hover:text-ink">What it may do</summary>
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {perms.map(line => (
                              <li key={line} className="text-[11px] leading-relaxed text-muted">
                                · {line}
                              </li>
                            ))}
                          </ul>
                        </details>
                        {!have ? (
                          <button
                            type="button"
                            onClick={() => install(index.kind, index.locator, entry.id)}
                            disabled={busy || (!entry.verified && !entry.downloadable)}
                            title={entry.verified ? 'Verify the checksum again and install' : entry.downloadable ? 'Download, check against the pinned checksum, then install' : entry.problem || 'Cannot be verified against the index'}
                            className="mt-1.5 rounded-lg border border-line px-2.5 py-1 text-[11.5px] text-ink hover:border-accent disabled:opacity-50"
                          >
                            Install
                          </button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}

/**
 * Engine marketplaces, as their own labelled source.
 *
 * The app does not keep a catalog of another product's plugins. It asks the
 * engine what its own build documents, shows that answer word for word, and
 * runs the engine's own command only after the person has seen it.
 */
function EngineMarketplaces() {
  const [probes, setProbes] = useState<Record<string, { state: string; answer: string; commands: string[]; checkedAt: string }>>({})
  const [checking, setChecking] = useState('')
  const [locator, setLocator] = useState('')
  const [confirming, setConfirming] = useState<{ id: 'claude-code' | 'agy'; command: string } | null>(null)
  const [note, setNote] = useState('')

  const check = (id: 'claude-code' | 'agy'): void => {
    if (isDemo) {
      setProbes(current => ({ ...current, [id]: { state: 'no-answer', answer: 'The engine lives on the installed app; this preview cannot ask it.', commands: [], checkedAt: new Date().toISOString() } }))
      return
    }
    setChecking(id)
    setNote('')
    void bridge.mods
      .marketplaceProbe?.(id)
      .then((reply: { ok: boolean; probe?: unknown; answer?: string } | undefined) => {
        if (reply?.ok && reply.probe) setProbes(current => ({ ...current, [id]: reply.probe as never }))
        else setNote(reply?.answer || 'The engine could not be asked.')
      })
      .catch(() => setNote('The engine could not be asked.'))
      .finally(() => setChecking(''))
  }

  const stages = [
    { id: 'claude-code' as const, label: 'Claude Code marketplace' },
    { id: 'agy' as const, label: 'agy extensions' },
  ]

  return (
    <section className="ob-marketplaces" aria-label="Engine marketplaces">
      <header>
        <h3>Engine marketplaces</h3>
        <p>
          Each engine installs its own plugins with its own command. This app asks what your installed build documents,
          shows the answer unchanged, and keeps no copy of anyone else&apos;s catalog.
        </p>
      </header>
      {stages.map(stage => {
        const probe = probes[stage.id]
        return (
          <div className="ob-marketplace-source" key={stage.id}>
            <div className="ob-marketplace-head">
              <span className="ob-source-badge">{stage.label}</span>
              <button type="button" className="ob-text-button" disabled={checking === stage.id} onClick={() => check(stage.id)}>
                {checking === stage.id ? 'Asking…' : probe ? 'Ask again' : 'Check this build'}
              </button>
            </div>
            {probe ? (
              <>
                <p className="ob-marketplace-state" data-state={probe.state}>
                  {probe.state === 'supported'
                    ? `This build documents: ${probe.commands.join(', ')}.`
                    : probe.state === 'not-installed'
                      ? 'The engine is not installed on this machine.'
                      : probe.state === 'unsupported'
                        ? 'This build does not document that command, so nothing is offered here.'
                        : 'The engine did not answer in time.'}
                </p>
                <details className="ob-marketplace-words">
                  <summary>The engine&apos;s own words</summary>
                  <pre>{probe.answer}</pre>
                </details>
                {probe.state === 'supported' && probe.commands.includes('add') ? (
                  <div className="ob-form-line">
                    <input
                      aria-label={`Repository or marketplace name for ${stage.label}`}
                      placeholder="owner/repo or marketplace name"
                      value={locator}
                      onChange={event => setLocator(event.target.value)}
                    />
                    <button
                      type="button"
                      className="ob-small-button"
                      disabled={!locator.trim()}
                      onClick={() => setConfirming({ id: stage.id, command: `${stage.id === 'agy' ? 'agy' : 'claude'} plugin marketplace add ${locator.trim()}` })}
                    >
                      Review the command
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="ob-marketplace-state">Not asked yet. Checking runs one read-only command, once.</p>
            )}
          </div>
        )
      })}
      {note ? <p role="status" className="ob-inline-note">{note}</p> : null}
      {confirming ? (
        <div className="ob-marketplace-confirm" role="group" aria-label="Confirm marketplace command">
          <p>This runs exactly one command, and the engine does the installing:</p>
          <pre>{confirming.command}</pre>
          <div className="ob-inline-actions">
            <button
              type="button"
              className="ob-small-button is-primary"
              onClick={() => {
                const request = confirming
                setConfirming(null)
                void bridge.mods.marketplaceAdd?.(request.id, locator.trim(), true).then((reply: { ok: boolean; answer: string } | undefined) => setNote(reply?.answer || 'The command did not finish.')).catch(() => setNote('The command did not finish.'))
              }}
            >
              Run it
            </button>
            <button type="button" className="ob-text-button" onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
