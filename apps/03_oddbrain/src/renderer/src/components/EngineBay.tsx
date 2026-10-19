import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FolderOpen, RefreshCw, Trash2, Cpu, Cloud } from 'lucide-react'
import { useEngine, type EngineModels } from '@/state/engine'
import useDismiss from '@/hooks/useDismiss'
import { isValidModelName, type ApprovalMode, type EngineId } from '@shared/lib/engine'

/**
 * The engine bay — the app's own engine selection system.
 *
 * This is the shell's spine, not an accessory: which engine thinks (Claude
 * Code today, agy when its Windows check lands), which brain it thinks with
 * (the list comes FROM the engine's own door — what it can really use, with
 * cloud brains flagged because their work leaves the machine), and which
 * folder it works in ("open a folder", remembered).
 *
 * Everything here is real: the model list is what the brain door reports,
 * the folder is a folder on disk, and a choice is saved the moment it is
 * made. In the browser preview every control answers honestly that it needs
 * the desktop app.
 */

const ENGINES: Array<{ id: EngineId; label: string; hint: string }> = [
  { id: 'claude-code', label: 'Claude Code', hint: 'Claude Code' },
  { id: 'agy', label: 'agy', hint: 'agy' },
]

/** The honest fine print, per engine, shown where the engine is chosen. */
const ENGINE_NOTES: Partial<Record<EngineId, string>> = {
  agy:
    'agy is experimental here. Model and effort discovery, pictures and approval cards are not integrated yet. ' +
    'agy handles its own permissions; this screen cannot approve its actions.',
}

/** The last part of a path, whichever slash the platform uses. */
const leaf = (folder: string): string => folder.split(/[\\/]/).filter(Boolean).at(-1) ?? folder

/** The throttle: how much the engine may do before it asks. Its own official settings, nothing added. */
const THROTTLE: Array<{ id: ApprovalMode; label: string; note: string }> = [
  {
    id: 'ask',
    label: 'Ask me',
    note: 'Every step beyond reading asks you first, as a card in the chat.',
  },
  {
    id: 'plan',
    label: 'Plan first',
    note: 'It investigates and proposes a plan; nothing changes until you approve the plan itself.',
  },
  {
    id: 'edits',
    label: 'Auto-edits',
    note: 'Files in the workspace change without asking; other commands still ask.',
  },
  {
    id: 'full',
    label: 'Full speed',
    note:
      'Everything runs without asking. The engine\u2019s own deny rules and guarded deletions still block. ' +
      'Your machine, your call, takes hold from the next engine start.',
  },
]

export default function EngineBay() {
  const engine = useEngine()
  // A subscription login has no model list to enumerate: the CLI's own default
  // is what runs. This field exists for the person who knows a name its CLI
  // accepts; empty still means "engine default". Nothing is invented here.
  const [typedModel, setTypedModel] = useState('')
  const [typedProvider, setTypedProvider] = useState<'native' | ''>('native')
  const [modelNote, setModelNote] = useState('')
  // What a swap actually did. Choosing an engine is a saved decision, not a
  // promise that a running turn changes hands — it cannot, and says so.
  const [swapNote, setSwapNote] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useDismiss(menuRef, () => setMenuOpen(false), menuOpen)

  // Real data only: the brain list from the engine's door, and what engines
  // actually exist on this machine — asked once when the bay appears.
  useEffect(() => {
    void engine.loadModels()
    void engine.checkEngines()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const label = (id: EngineId): string => ENGINES.find(entry => entry.id === id)?.label ?? id
  const choose = (id: EngineId, missing: boolean): void => {
    const previous = engine.settings.id
    const midTurn = engine.turn?.state === 'running'
    void engine.pick(id).then(answer => {
    if (!answer.ok) { setSwapNote(answer.answer); return }
    setSwapNote(missing
      ? `${label(id)} is not installed on this machine. A turn will refuse with its install command until it is.`
      : midTurn && previous !== id
        ? `This turn stays on ${label(previous)} until it ends; the next one uses ${label(id)}.`
        : '')
    }).catch(() => setSwapNote('The engine choice could not be saved.'))
  }

  const models: EngineModels = engine.models
  const workspaceLabel = engine.settings.workspace ? leaf(engine.settings.workspace) : 'Vault (default)'

  return (
    <section aria-label="Engine" className="ob-engine-settings">
      <header className="flex items-center gap-1.5 px-1 pb-1.5">
        <Cpu size={12} className="text-muted" aria-hidden />
        <h2 className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Engine</h2>
        <button
          type="button"
          onClick={() => void engine.checkEngines(true)}
          disabled={engine.detection.loading}
          title="Check installed engines"
          className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          {engine.detection.loading ? 'scanning…' : 'Re-scan'}
        </button>
      </header>

      {/* The engine selection system. An engine that is not on this machine
          is shown as missing, with the one command that fixes it, the bay
          refuses to offer a pickable lie. */}
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Which engine">
        {ENGINES.map((entry) => {
          const active = engine.settings.id === entry.id
          const known = engine.detection.engines.find((knownEngine) => knownEngine.id === entry.id)
          const missing = known ? !known.found : false
          const title = missing
            ? `Not found on this machine. ${known?.install ?? ''}`
            : known?.path
              ? `${entry.hint}, ${known.version} — ${known.path}`
              : known?.version
                ? `${entry.hint}, ${known.version}`
                : entry.hint
          return (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={title}
              onClick={() => choose(entry.id, missing)}
              className={`rounded-lg border px-2 py-1.5 text-left text-[12px] transition-colors ${
                active ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'
              } ${missing ? 'opacity-60' : ''}`}
            >
              <span className="block truncate">{entry.label}</span>
              {missing ? (
                <span className="text-[10px] text-warn">not installed</span>
              ) : known?.version ? (
                <span className="block truncate text-[10px] text-muted" title={known.path || ''}>
                  installed · {known.version}
                </span>
              ) : null}
            </button>
          )
        })}
        {ENGINE_NOTES[engine.settings.id] ? (
          <p className="col-span-2 rounded-lg border border-line bg-card px-2.5 py-2 text-[11px] leading-relaxed text-muted" role="note">
            {ENGINE_NOTES[engine.settings.id]}
          </p>
        ) : null}
      </div>
      {swapNote ? <p role="status" className="px-1 pt-1 text-[11px] leading-relaxed text-muted">{swapNote}</p> : null}

      {/* The brain, chosen from the engine's own list. */}
      <div className="relative mt-1.5" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex w-full items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-left text-[12px] text-muted hover:text-ink"
        >
          <span className="min-w-0 flex-1 truncate">{engine.settings.model || "Engine default model"}</span>
          <ChevronDown size={12} aria-hidden />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            aria-label="Available models"
            className="absolute bottom-9 left-0 z-30 w-[240px] rounded-xl border border-line bg-card p-1.5 shadow-xl"
          >
            {models.loading ? (
              <p className="px-2.5 py-2 text-[12px] text-muted">Loading models…</p>
            ) : models.error && !models.entries.length ? (
              <p className="px-2.5 py-2 text-[12px] leading-relaxed text-muted">{models.error}</p>
            ) : (
              models.entries.map((entry) => (
                <div key={`${entry.provider || "ollama"}:${entry.name}`} className="ob-engine-model-row" role="none">
                  <button type="button" role="menuitemradio" aria-checked={entry.name === engine.settings.model && (entry.provider || '') === engine.settings.cloudProvider}
                    onClick={() => { void engine.setModel(entry.name, entry.provider); setMenuOpen(false) }}>
                    <span>{entry.displayName || entry.name}</span>
                    {entry.cloud ? <small><Cloud size={10} /> {entry.provider === 'native' ? 'CLI login' : entry.provider === 'anthropic' ? 'Anthropic API' : 'Cloud'}</small> : entry.sizeGB !== null ? <small>{entry.sizeGB.toFixed(1)} GB</small> : null}
                  </button>
                  {!entry.cloud && !entry.provider ? <button type="button" role="menuitem" title={`Remove ${entry.name}`} aria-label={`Remove ${entry.name}`} onClick={() => void engine.removeModel(entry.name)}><Trash2 size={12} /></button> : null}
                </div>
              ))
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => void engine.loadModels()}
              className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-t border-line px-2.5 py-1.5 text-left text-[12px] text-muted hover:text-ink"
            >
              <RefreshCw size={11} aria-hidden /> Refresh models
            </button>

          </div>
        ) : null}
      </div>

      {/* A model name the engine's CLI already knows, for logins that publish
          no list. Validated before it can reach the launch line. */}
      {engine.settings.id === 'claude-code' ? (
        <div className="mt-1.5">
          <label className="mb-1 flex items-center gap-2 text-[11px] text-muted">
            Model source
            <select aria-label="Typed model source" value={typedProvider} onChange={event => setTypedProvider(event.target.value === 'native' ? 'native' : '')}>
              <option value="native">CLI login</option><option value="">Ollama endpoint</option>
            </select>
          </label>
          <div className="ob-form-line">
            <input
              aria-label="Type a model name"
              placeholder="or type a model identifier"
              value={typedModel}
              onChange={(event) => { setTypedModel(event.target.value); setModelNote('') }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                const value = typedModel.trim()
                if (!isValidModelName(value)) { setModelNote('Letters, digits, dots, colons, @, / and dashes only.'); return }
                void engine.setModel(value, typedProvider || undefined).then(() => setTypedModel(''))
              }}
            />
            <button
              type="button"
              disabled={!typedModel.trim()}
              onClick={() => {
                const value = typedModel.trim()
                if (!isValidModelName(value)) { setModelNote('Letters, digits, dots, colons, @, / and dashes only.'); return }
                void engine.setModel(value, typedProvider || undefined).then(() => setTypedModel(''))
              }}
            >
              Use this name
            </button>
          </div>
          {engine.settings.model ? (
            <button type="button" className="mt-1 text-[11px] text-muted hover:text-ink" onClick={() => void engine.setModel('')}>
              Back to the engine's default model
            </button>
          ) : null}
          {modelNote ? <p className="mt-1 text-[11px] text-warn">{modelNote}</p> : null}
        </div>
      ) : null}

      {/* Where the engine works. */}
      <button
        type="button"
        onClick={() => void engine.pickWorkspace()}
        title={engine.settings.workspace || 'The vault is the workplace until a folder is chosen'}
        className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] text-muted hover:text-ink"
      >
        <FolderOpen size={12} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{workspaceLabel}</span>
      </button>

      {/* The throttle: the engine's own settings, from ask-me to full speed. */}
      <div
        role="radiogroup"
        aria-label="How much the engine may do before asking"
        className="mt-1 grid grid-cols-4 gap-1 rounded-lg border border-line p-1"
      >
        {THROTTLE.map((step) => {
          const active = (engine.settings.approval ?? 'ask') === step.id
          return (
            <button
              key={step.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={step.note}
              onClick={() => void engine.setApproval(step.id)}
              className={`rounded-md px-1 py-1 text-[11px] transition-colors ${
                active ? 'bg-accent text-[var(--accent-ink)]' : 'text-muted hover:text-ink'
              }`}
            >
              {step.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
