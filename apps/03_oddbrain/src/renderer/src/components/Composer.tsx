import CommandPanel from '../ui/CommandPanel'
import PromptEditor from '../ui/PromptEditor'
import { draftLease, replaceDraft, looksLikeNativeSlashCommand } from '@shared/lib/chatDraft'
import { insertFileMentions } from '@shared/lib/fileMentions'
import SavedDrafts from '../ui/SavedDrafts'
import { AGY_APPROVAL_CHOICES, AGY_APPROVAL_NOTE } from '@shared/lib/engineApproval'
import ReasoningEffort from './ReasoningEffort'
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ChevronDown, CookingPot, Cpu, FolderOpen, Layers, ListOrdered, Map, MoreHorizontal, Mic, MicOff, Paperclip, Play, ScrollText, Square, Swords, X } from 'lucide-react'
import { filterPrompts, loadPrompts } from '@shared/lib/prompts'
import useDictation from '../hooks/useDictation'
import { modelLabel } from '@shared/lib/engine'
import type { Project } from '@shared/lib/projects'
import type { Attachment } from '@shared/types'
import type { Recipe } from '@shared/lib/recipes'
import { renderRecipe } from '@shared/lib/recipes'
import { loadRecipes, runRecipe, useRecipes } from '@/state/recipes'
import { mapContextBlock } from '@shared/lib/repoMap'
import { getEngineApi, bridge, isDemo } from '@/platform/bridge'
import { vaultGet, type VaultReply } from '@shared/lib/vault'
import { useEngine, type EngineTurn } from '@/state/engine'
import useDismiss from '@/hooks/useDismiss'
import BriefContext from '../ui/BriefContext'
import ComposerSurface from '../ui/ComposerSurface'
import { LookActions, useLook } from '../ui/LookContext'

/**
 * The composer.
 *
 * Enter sends, Shift+Enter starts a new line, Escape stops work still running.
 * The draft is kept in the parent so that a failed send keeps the text where
 * it was instead of clearing the box and losing it.
 *
 * There is exactly one way to talk: through the engine. There is no toggle,
 * no second brain behind the app — the app adds nothing of its own. The two
 * small chips at the bottom are the engine's own controls wearing the app's
 * face: the first chooses WHICH engine and how much it may do before asking
 * (the engine's own modes, nothing invented); the second lists the models
 * THAT engine can really use, from the engine's own door.
 */
export default function Composer({
  value,
  draftScope = 'unscoped',
  onChange,
  onSend,
  onStop,
  busy,
  notice,
  preview,
  projects = [],
  project = null,
  onProject,
  /** Pictures and files waiting to ride with the next send. */
  attachments = [],
  onFiles,
  fileTools,
  onDetach,
}: {
  value: string
  draftScope?: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  notice: string
  /** Set in the browser preview, where there is no machine behind the window. */
  preview?: string
  /** The project picker, as the approved composer shows it. */
  projects?: Project[]
  project?: string | null
  onProject?: (id: string | null) => void
  attachments?: Attachment[]
  /** Hand the app the files a person picked or pasted; it reads and refuses honestly. */
  fileTools?: ReactNode
  onFiles?: (files: File[]) => void
  onDetach?: (id: string) => void
}) {
  const box = useRef<HTMLTextAreaElement | null>(null)
  const [boxOpen, setBoxOpen] = useState<'engine' | 'models' | null>(null)
  const [commandsOpen, setCommandsOpen] = useState<'command' | 'workflows' | null>(null)
  const [cook, setCook] = useState(false)
  const [editor, setEditor] = useState<{ scope: string; text: string } | null>(null)
  const cookBase = useRef({ scope: draftScope, text: value })
  const lease = useRef(draftLease()), picking = useRef(false), currentScope = useRef(draftScope)
  if (currentScope.current !== draftScope) { currentScope.current = draftScope; lease.current.invalidate() }
  useEffect(() => { if (busy) lease.current.invalidate() }, [busy])
  const sendDraft = () => { if (looksLikeNativeSlashCommand(liveDraft.current)) { setFileNote('Native slash commands need a verified engine action. Choose a saved prompt template or use the engine’s supported controls; nothing was sent.'); return }; lease.current.invalidate(); onSend() }
  const [savedDrafts, setSavedDrafts] = useState(false)
  const [fileNote, setFileNote] = useState(''), [pickingFiles, setPickingFiles] = useState(false)
  const liveDraft = useRef(value); liveDraft.current = value
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; lease.current.invalidate() } }, [])
  const mentionFiles = async () => {
    if (isDemo) { setFileNote('File references require the desktop picker. No paths or files were sent.'); return }
    if (picking.current) return
    picking.current = true
    const request = lease.current.begin()
    setPickingFiles(true)
    try { const paths = await bridge.engine.pickFiles(); if (mounted.current && lease.current.current(request) && paths.length) { onChange(insertFileMentions(liveDraft.current, paths)); setFileNote('Paths inserted, not file contents. The engine uses its own tools and permissions when you send.') } }
    catch (e) { if (mounted.current && lease.current.current(request)) setFileNote((e as Error).message || 'Files could not be selected.') }
    finally { picking.current = false; if (mounted.current) setPickingFiles(false) }
  }
  const [tools, setTools] = useState(false)
  const toolsRef = useRef<HTMLDivElement | null>(null)
  const look = useLook(), changeLook = useContext(LookActions)
  useDismiss(toolsRef, () => setTools(false), tools)
  const dictation = useDictation(value, onChange)
  const listening = dictation.active
  const fileInput = useRef<HTMLInputElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  useDismiss(pickerRef, () => setBoxOpen(null), boxOpen !== null)
  const toggleDictation = (): void => { void dictation.toggle() }

  // Grow with the text, up to a point, then scroll. A composer that stays one
  // line high while you write a paragraph hides what you are writing.
  useEffect(() => {
    const element = box.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [value])

  const [slashDismissed, setSlashDismissed] = useState(false), [slashIndex, setSlashIndex] = useState(0)
  useEffect(() => { setSlashDismissed(false); setSlashIndex(0) }, [value])
  const promptChoices = value.startsWith('/') && !/\s/.test(value.slice(1)) ? filterPrompts(loadPrompts(), value.slice(1)) : []
  const slashOpen = !slashDismissed && !busy && !listening && promptChoices.length > 0
  const pickPrompt = (index: number): void => { const chosen = promptChoices[index]; if (chosen) { onChange(chosen.body); setSlashDismissed(true); box.current?.focus() } }
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !busy && !listening

  /** Files pasted straight onto the box ride like picked files. */
  const paste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(event.clipboardData?.files ?? [])
    if (files.length && onFiles) {
      event.preventDefault()
      onFiles(files)
    }
  }

  const keydown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) return
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); setEditor({ scope: draftScope, text: value }); return }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); setSavedDrafts(true); return }
    if (slashOpen && ['ArrowDown', 'ArrowUp', 'Escape', 'Tab', 'Enter'].includes(event.key)) {
      event.preventDefault()
      if (event.key === 'Escape') setSlashDismissed(true)
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') setSlashIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + promptChoices.length) % promptChoices.length)
      else pickPrompt(Math.min(slashIndex, promptChoices.length - 1))
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) sendDraft()
      return
    }
    if (event.key === 'Escape') {
      if (boxOpen) setBoxOpen(null)
      else if (busy) onStop()
    }
  }

  return (
    <div className="ob-composer-host shrink-0 px-6 pb-4">
      <BriefContext />
      <ComposerSurface>
        {/(?:^|\s)@$/.test(value) && !listening ? <div className="px-4 py-2 text-[12px]"><button type="button" className="ob-text-button" disabled={pickingFiles} onClick={() => void mentionFiles()}>Choose files to mention</button><span className="text-muted"> · Paths only, not an upload</span></div> : null}
        {slashOpen ? <ul id="composer-prompts" role="listbox" aria-label="Prompt templates" className="max-h-[160px] overflow-y-auto border-b border-line p-2">{promptChoices.map((prompt, index) => <li key={prompt.id} id={`composer-prompt-${index}`} role="option" aria-selected={index === slashIndex}><button type="button" className="w-full px-2 py-1 text-left text-[12px] hover:bg-panel" onClick={() => pickPrompt(index)}><strong>/{prompt.name}</strong> · {prompt.hint}</button></li>)}</ul> : null}
        <textarea
          ref={box}
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={keydown}
          onPaste={paste}
          rows={1}
          placeholder="Ask anything"
          aria-label="Message"
          aria-controls={slashOpen ? "composer-prompts" : undefined}
          aria-activedescendant={slashOpen ? `composer-prompt-${slashIndex}` : undefined}
          className="block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted"
        />
        {dictation.active ? <div role="status" className="px-4 py-2 text-[12px] text-muted">{dictation.label}<button type="button" className="ml-3 underline" onClick={dictation.cancel}>Cancel dictation</button></div> : null}
        {fileTools}
        {attachments.length > 0 && onDetach ? (
          <ul className="flex flex-wrap gap-1.5 px-4 pt-2" aria-label="Attached">
            {attachments.map(entry => (
              <li key={entry.id} className="flex items-center gap-1 rounded-lg border border-line bg-bg px-1.5 py-1 text-[11px] text-muted">
                {entry.kind === 'image' && entry.data ? (
                  <img src={`data:${entry.mime};base64,${entry.data}`} alt="" className="h-6 w-6 rounded object-cover" />
                ) : (
                  <span className="max-w-[140px] truncate">{entry.name}</span>
                )}
                <button type="button" onClick={() => onDetach(entry.id)} aria-label={`Remove ${entry.name}`} className="text-muted hover:text-ink">
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-center gap-1.5 px-2.5 pb-2 pt-1" ref={pickerRef}>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={event => {
              const files = Array.from(event.target.files ?? [])
              if (files.length && onFiles) onFiles(files)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label="Attach"
            title="Attach a document, image, audio or video"
            disabled={listening}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-ink"
          >
            <Paperclip size={13} />
          </button>
          <button
            type="button"
            onClick={toggleDictation}
            aria-label={listening ? 'Stop dictation' : 'Dictate'}
            aria-pressed={listening}
            title={listening ? 'Press again to stop. Use Cancel to discard.' : 'Dictate using the mode selected in Voice & files'}
            disabled={busy && !listening}
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${listening ? 'text-warn' : 'text-muted hover:text-ink'}`}
          >
            {listening ? <MicOff size={13} /> : <Mic size={13} />}
          </button>
          <span className="ml-auto" />
          <EngineChip open={boxOpen === 'engine'} onToggle={() => setBoxOpen(boxOpen === 'engine' ? null : 'engine')} />
          <ModelChip open={boxOpen === 'models'} onToggle={() => setBoxOpen(boxOpen === 'models' ? null : 'models')} />
          <div className="ob-more-tools" ref={toolsRef}>
            <button type="button" className="ob-icon-button" onClick={() => setTools(v => !v)} aria-label="More chat tools" aria-expanded={tools} title="More chat tools"><MoreHorizontal size={15} /></button>
            {tools ? <div className="ob-tools-popup" role="dialog" aria-label="Chat tools">
              <ProjectDropdown projects={projects} project={project} onProject={onProject} />
              <RecipeButton />
              <button type="button" onClick={() => { setCommandsOpen('command'); setTools(false) }}>Review an OS command</button>
              <button type="button" onClick={() => { setCommandsOpen('workflows'); setTools(false) }}>Workflows &amp; schedules</button>
              <button type="button" disabled={listening || pickingFiles} onClick={() => { void mentionFiles(); setTools(false) }}><Paperclip size={14} />Mention files</button>
              <button type="button" disabled={listening} onClick={() => { setSavedDrafts(true); setTools(false) }}><ScrollText size={14} />Saved drafts</button>
              <MapButton onInsert={map => onChange(value.trim() ? `${value.trimEnd()}\n\n${map}\n` : `${map}\n`)} />
              <button type="button" onClick={() => { setEditor({ scope: draftScope, text: value }); setTools(false) }}>Edit prompt text · Ctrl+Shift+E</button>
              <button type="button" disabled={!value.trim() || busy} onClick={() => { cookBase.current = { scope: draftScope, text: value }; setCook(true); setTools(false) }}><CookingPot size={14} />Cook context</button>
              <button type="button" disabled={!value.trim() || busy} onClick={() => { window.dispatchEvent(new CustomEvent('app:battle', { detail: value })); setTools(false) }}><Swords size={14} />Brain battle</button>
              <button type="button" disabled={!value.trim() || busy} onClick={() => { window.dispatchEvent(new CustomEvent('app:split', { detail: value })); setTools(false) }}><ListOrdered size={14} />Split a task</button>
              <button type="button" aria-pressed={look.showThinking} title="Only shows thinking supplied by the engine. This does not change reasoning effort or request an explanation." onClick={() => changeLook({ showThinking: !look.showThinking })}><ScrollText size={14} />Show thinking<span>{look.showThinking ? 'On' : 'Off'}</span></button>
              <button type="button" onClick={() => { window.dispatchEvent(new CustomEvent('app:memory-open', { detail: 'Memory inbox' })); setTools(false) }}><ListOrdered size={14} />Memory inbox</button>
              <button type="button" onClick={() => { window.dispatchEvent(new Event('app:show-journal')); setTools(false) }}><ListOrdered size={14} />Turn journal</button>
            </div> : null}
          </div>
          <span className="ml-auto flex items-center gap-2">
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                title="Stop (Esc)"
                className="flex h-7 items-center gap-1.5 rounded-lg border border-line px-2 text-[11.5px] text-muted hover:text-ink"
              >
                <Square size={10} />
                Stop
              </button>
            ) : null}
            <button
              type="button"
              onClick={sendDraft}
              disabled={!canSend}
              aria-label="Send"
              title="Send (Enter)"
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                canSend ? 'bg-accent text-[var(--accent-ink)] hover:bg-accent/90' : 'bg-white/[0.06] text-muted'
              }`}
            >
              <ArrowUp size={15} />
            </button>
          </span>
        </div>
      </ComposerSurface>
      {commandsOpen && <CommandPanel initialView={commandsOpen} close={() => setCommandsOpen(null)} />}
      {editor ? <PromptEditor initial={editor.text} apply={text => onChange(replaceDraft({ scope: currentScope.current, text: liveDraft.current }, editor, text))} close={() => setEditor(null)} /> : null}
      {savedDrafts ? <SavedDrafts draft={value} insert={text => onChange(liveDraft.current ? `${liveDraft.current}\n\n${text}` : text)} close={() => setSavedDrafts(false)} /> : null}
      {cook ? <CookDialog draft={value} onDone={next => { if (next !== null) { try { onChange(replaceDraft({ scope: currentScope.current, text: liveDraft.current }, cookBase.current, next)) } catch { setFileNote('Cook result was not inserted because the draft changed. Reopen Cook context for the current draft; your draft and attachments are unchanged.') } } setCook(false) }} /> : null}
      {preview ? <p className="px-1 pt-2 text-[12px] text-muted">{preview}</p> : null}
      {looksLikeNativeSlashCommand(value) && !slashOpen ? <p className="ob-control-scope">Native slash commands cannot be sent as ordinary prompts. Use a verified engine action.</p> : null}
      {fileNote ? <p role="status" className="px-1 pt-2 text-[12px] text-muted">{fileNote}</p> : null}
      {notice ? <p className="px-1 pt-2 text-[12px] text-warn">{notice}</p> : null}
    </div>
  )
}

/** The picker on the composer's left: which project this work belongs to. */
function ProjectDropdown({
  projects,
  project,
  onProject,
}: {
  projects: Project[]
  project: string | null
  onProject?: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useDismiss(ref, () => setOpen(false), open)
  const current = projects.find(entry => entry.id === project)
  if (!onProject) return null
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Which project this conversation belongs to"
        className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-muted hover:text-ink"
      >
        <FolderOpen size={11} aria-hidden />
        <span className="min-w-0 max-w-[120px] truncate">{current ? current.name : 'Project'}</span>
        <ChevronDown size={11} />
      </button>
      {open ? (
        <div role="menu" aria-label="Projects" className="absolute bottom-9 left-0 z-20 w-[220px] rounded-xl border border-line bg-card p-1.5 shadow-xl">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={project === null}
            onClick={() => { onProject(null); setOpen(false) }}
            className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-muted hover:text-ink"
          >
            No project
          </button>
          {projects.map(entry => (
            <button
              key={entry.id}
              type="button"
              role="menuitemradio"
              aria-checked={entry.id === project}
              onClick={() => { onProject(entry.id); setOpen(false) }}
              className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[12.5px] ${
                entry.id === project ? 'bg-white/[0.06] text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            </button>
          ))}
          {projects.length === 0 ? (
            <p className="px-2.5 py-2 text-[11.5px] leading-relaxed text-muted">
              No projects yet. Projects is where one is made.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Cook This Prompt: the vault as context, in the approved format. The draft's
 * own words are the search against the vault's content; the hits become
 * `[Title: line]` entries, shown for a yes or no — nothing enters the prompt
 * unshown, and nothing leaves the machine.
 */
function CookDialog({ draft, onDone }: { draft: string; onDone: (next: string | null) => void }) {
  const [hits, setHits] = useState<Array<{ path: string; line: number; text: string }>>([])
  const [state, setState] = useState('looking')
  const [picked, setPicked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const words = Array.from(new Set(draft.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 3))).slice(0, 3)
    if (!words.length) {
      setState('empty')
      return
    }
    const controller = new AbortController()
    // One search per word: the grep matches a whole needle as one phrase, and
    // a three-word phrase rarely survives verbatim in the vault. Word by word
    // finds the files that matter, and the merge keeps the best six.
    void Promise.all(
      words.map(word =>
        vaultGet(`/grep?q=${encodeURIComponent(word)}`, controller.signal).catch(() => 'failed'),
      ),
    ).then((replies) => {
      // A refused or unreachable door is not the same as an empty vault — the
      // two states get different sentences.
      if (replies.some(reply => reply === 'failed')) {
        setState('offline')
        return
      }
      const seen = new Set<string>()
      const found: Array<{ path: string; line: number; text: string }> = []
      for (const reply of replies as VaultReply[]) {
        for (const hit of Array.isArray(reply?.hits) ? reply.hits : []) {
          const key = `${hit.path}:${hit.line}`
          if (seen.has(key)) continue
          seen.add(key)
          found.push(hit)
          if (found.length >= 6) break
        }
        if (found.length >= 6) break
      }
      setHits(found)
      setPicked(Object.fromEntries(found.map((hit: { path: string }) => [hit.path, true])))
      setState(found.length ? 'ready' : 'nothing')
    })
    return () => controller.abort()
  }, [draft])

  const title = (path: string): string => path.replace(/\.md$/i, '').split('/').at(-1) ?? path

  return (
    <div className="absolute bottom-9 left-1 z-30 w-[340px] rounded-xl border border-line bg-card p-3 shadow-xl" role="dialog" aria-label="Cook this prompt">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Enhanced prompt</p>
      {state === 'looking' ? <p className="mt-2 text-[12px] text-muted">Searching the vault…</p> : null}
      {state === 'empty' ? <p className="mt-2 text-[12px] text-muted">Write the prompt first, its words are the search.</p> : null}
      {state === 'offline' ? <p className="mt-2 text-[12px] text-muted">The vault is not reachable right now.</p> : null}
      {state === 'nothing' ? <p className="mt-2 text-[12px] text-muted">Nothing in the vault matches this prompt.</p> : null}
      {state === 'ready' ? (
        <div className="mt-2 flex max-h-[180px] flex-col gap-1 overflow-y-auto">
          {hits.map(hit => (
            <label key={`${hit.path}:${hit.line}`} className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={picked[hit.path] === true}
                onChange={() => setPicked(previous => ({ ...previous, [hit.path]: previous[hit.path] !== true }))}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <span className="min-w-0">
                <span className="block text-[12px] text-ink">[{title(hit.path)}]</span>
                <span className="block truncate text-[11px] text-muted">{hit.text}</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={() => onDone(null)} className="rounded-lg px-3 py-1 text-[12px] text-muted hover:text-ink">
          Cancel
        </button>
        <button
          type="button"
          disabled={state !== 'ready'}
          onClick={() => {
            const lines = hits.filter(hit => picked[hit.path] === true).map(hit => `[${title(hit.path)}: ${hit.text.trim().slice(0, 120)}]`)
            onDone(lines.length ? `${lines.join('\n')}\n\n${draft}` : draft)
          }}
          className="rounded-lg bg-accent px-3 py-1 text-[12px] font-medium text-[var(--accent-ink)] hover:bg-accent/90 disabled:opacity-50"
        >
          OK
        </button>
      </div>
    </div>
  )
}

/** The engine chip: which engine, and its own modes (plan included). Nothing from the app. */
function EngineChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const engine = useEngine()
  const modes: Array<{ id: 'ask' | 'plan' | 'edits' | 'full'; label: string; note: string }> = [
    { id: 'ask', label: 'Ask me', note: 'Every step beyond reading asks you first.' },
    { id: 'plan', label: 'Plan first', note: 'It investigates and proposes; nothing changes until you approve the plan.' },
    { id: 'edits', label: 'Auto-edits', note: 'Files change unasked; other commands still ask.' },
    { id: 'full', label: 'Full speed', note: 'Everything runs unasked. The engine\u2019s own deny rules still hold.' },
  ]
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Which engine works here, and how much it may do before asking"
        className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-muted hover:text-ink"
      >
        <Cpu size={11} aria-hidden />
        {engine.settings.id}
        <ChevronDown size={11} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Engines and how much they may do"
          className="absolute bottom-9 left-0 z-20 w-[270px] rounded-xl border border-line bg-card p-1.5 shadow-xl"
        >
          {engine.detection.engines.length === 0 ? (
            <button
              type="button"
              onClick={() => void engine.checkEngines()}
              className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] text-muted hover:text-ink"
            >
              Asking this machine which engines are installed…
            </button>
          ) : (
            engine.detection.engines.map(entry => (
              <button
                key={entry.id}
                type="button"
                role="menuitemradio"
                aria-checked={entry.id === engine.settings.id}
                onClick={() => {
                  if (entry.found) void engine.pick(entry.id)
                }}
                title={entry.found ? entry.version : entry.install}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] ${
                  entry.id === engine.settings.id ? 'bg-white/[0.06] text-ink' : entry.found ? 'text-muted hover:text-ink' : 'text-muted/50'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{entry.id}</span>
                {/* Words, not a coloured dot: a green light here read as
                    "this engine works" while turns were failing — the owner
                    called it a fake green dot, and it was. */}
                {!entry.found ? <span className="shrink-0 text-[10px] text-warn">not installed</span> : null}
              </button>
            ))
          )}
          <div className="mt-1 border-t border-line px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted">
            Before it acts
          </div>
          {(engine.settings.id === 'agy' ? AGY_APPROVAL_CHOICES : modes).map(mode => (
            <button
              key={mode.id}
              type="button"
              role="menuitemradio"
              aria-checked={(engine.settings.approval ?? 'ask') === mode.id}
              title={mode.note}
              onClick={() => void engine.setApproval(mode.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] ${
                (engine.settings.approval ?? 'ask') === mode.id ? 'bg-white/[0.06] text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {mode.label}
            </button>
          ))}
          <ReasoningEffort />
          <p className="px-2.5 pb-1.5 pt-1.5 text-[10.5px] leading-relaxed text-muted">
            {engine.settings.id === 'agy' ? AGY_APPROVAL_NOTE : 'These are the engine’s own modes. The app adds no rules of its own.'}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** The models chip: what the CHOSEN engine can really use, from its own door. */
function ModelChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const engine = useEngine()
  const [filter, setFilter] = useState('')
  const entries = engine.models.entries.filter((entry) => entry.name.toLowerCase().includes(filter.toLowerCase()))
  // Adopted from the better pickers in the landscape (nexu-io's model search,
  // backchat's shared picker): a long list is searched, not scrolled blind.
  const searchable = engine.models.entries.length > 8
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open) void engine.loadModels()
          onToggle()
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="The models this engine can use, from the engine itself"
        className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-muted hover:text-ink"
      >
        <Layers size={11} aria-hidden />
        <span className="min-w-0 max-w-[160px] truncate">{modelLabel(engine.settings.model)}</span>
        <ChevronDown size={11} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={`Models for ${engine.settings.id}`}
          className="absolute bottom-9 left-0 z-20 max-h-[280px] w-[260px] overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-xl"
        >
          {searchable ? (
            <input
              autoFocus
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter models…"
              aria-label="Filter models"
              className="mb-1 h-7 w-full rounded-lg border border-line bg-bg px-2 text-[12px] text-ink outline-none placeholder:text-muted focus:border-accent/60"
            />
          ) : null}
          {/* The engine's own choice, always first and always real: it is
              whatever the engine itself logs in with — never a name this app
              invented. */}
          <button
              type="button"
              role="menuitemradio"
              aria-checked={engine.settings.model === ''}
              onClick={() => {
                void engine.setModel('')
                onToggle()
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] ${
                engine.settings.model === '' ? 'bg-white/[0.06] text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{modelLabel('')}</span>
              <span className="shrink-0 text-[10.5px] text-muted">its own login</span>
          </button>
          {engine.models.entries.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] leading-relaxed text-muted">
              {engine.models.loading
                ? 'Asking the engine what it can use…'
                : engine.models.error || `The engine named no models. ${engine.settings.id === 'claude-code' ? 'Log in once with the CLI, or point it at a brain in Settings.' : 'Its own check has not run yet.'}`}
            </p>
          ) : (
            entries.map(entry => (
              <button
                key={`${entry.provider || "ollama"}:${entry.name}`}
                type="button"
                role="menuitemradio"
                aria-checked={entry.name === engine.settings.model && (entry.provider || '') === engine.settings.cloudProvider}
                onClick={() => {
                  void engine.setModel(entry.name, entry.provider)
                  onToggle()
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] ${
                  entry.name === engine.settings.model && (entry.provider || '') === engine.settings.cloudProvider ? 'bg-white/[0.06] text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{entry.displayName || entry.name}</span>
                {entry.cloud ? (
                  <span className="shrink-0 rounded-md border border-line px-1.5 text-[10px] text-muted">{entry.provider === 'native' ? (engine.settings.id === 'agy' ? 'agy' : 'CLI login') : entry.provider === 'anthropic' ? 'Anthropic API' : 'cloud'}</span>
                ) : typeof entry.sizeGB === 'number' ? (
                  <span className="shrink-0 text-[10.5px] text-muted">{entry.sizeGB.toFixed(1)} GB</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export type { EngineTurn }

/**
 * Recipes, right where commands belong: press, pick, fill in, run. The menu
 * lists what is on this machine; the dialog shows the whole rendered prompt
 * BEFORE it is sent — a recipe is read in full, never trusted blind (the
 * poisoned-recipe lesson), and it runs as a plain work order with the
 * engine's own permission cards still wide awake.
 */
function RecipeButton() {
  const recipes = useRecipes()
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<Recipe | null>(null)
  const area = useRef<HTMLDivElement | null>(null)
  useDismiss(area, () => setOpen(false), open && !chosen)

  useEffect(() => {
    if (open) void loadRecipes()
  }, [open])

  return (
    <div className="relative" ref={area}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Recipes: saved work orders — pick one, fill it in, see it in full, run it"
        title="Recipes: saved work orders — pick one, fill it in, see it in full, run it"
        className="flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-muted hover:text-ink"
      >
        <ScrollText size={13} aria-hidden />
      </button>
      {open && !chosen ? (
        <div role="menu" aria-label="Recipes" className="absolute bottom-9 left-0 z-20 max-h-[300px] w-[280px] overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-xl">
          {recipes.recipes.map(recipe => (
            <button
              key={recipe.name}
              type="button"
              role="menuitem"
              onClick={() => { setChosen(recipe); setOpen(false) }}
              className="flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left hover:bg-white/[0.06]"
            >
              <span className="text-[12.5px] text-ink">{recipe.name}</span>
              {recipe.description ? (
                <span className="text-[11px] leading-snug text-muted">{recipe.description}</span>
              ) : null}
            </button>
          ))}
          {recipes.recipes.length === 0 ? (
            <p className="px-2.5 py-2 text-[11.5px] leading-relaxed text-muted">
              No recipes yet. Settings has a Recipes pane with three starters, one press away.
            </p>
          ) : null}
          {recipes.broken.length ? (
            <p className="px-2.5 py-2 text-[11px] leading-relaxed text-warn">
              {recipes.broken.length} file{recipes.broken.length === 1 ? '' : 's'} in the recipe folder could not be read. Settings names them.
            </p>
          ) : null}
        </div>
      ) : null}
      {chosen ? <RecipeRunDialog recipe={chosen} onClose={() => setChosen(null)} /> : null}
    </div>
  )
}

function RecipeRunDialog({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(recipe.parameters.map(parameter => [parameter.name, ''])),
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const rendered = renderRecipe(recipe, values)
  const preview = rendered.ok ? rendered.prompt : rendered.answer

  const run = async (): Promise<void> => {
    if (!rendered.ok || sending) {
      if (!rendered.ok) setError(rendered.answer)
      return
    }
    setSending(true)
    setError('')
    const answer = await runRecipe(recipe, values)
    setSending(false)
    if (answer.ok) onClose()
    else setError(answer.answer)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-label={`Run ${recipe.name}`} onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-line bg-card p-5" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{recipe.name}</h2>
            {recipe.description ? <p className="mt-0.5 text-[12px] text-muted">{recipe.description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={15} />
          </button>
        </div>
        {recipe.parameters.length ? (
          <div className="mt-4 space-y-3">
            {recipe.parameters.map(parameter => (
              <label key={parameter.name} className="block">
                <span className="text-[12px] font-medium text-ink">{parameter.name}</span>
                {parameter.description ? <span className="ml-1.5 text-[11px] text-muted">{parameter.description}</span> : null}
                <input
                  type="text"
                  value={values[parameter.name] ?? ''}
                  onChange={event => setValues(current => ({ ...current, [parameter.name]: event.target.value }))}
                  placeholder={parameter.default ? `default: ${parameter.default}` : 'type it here'}
                  aria-label={parameter.name}
                  className="mt-1 w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted"
                />
              </label>
            ))}
          </div>
        ) : null}
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">What will be sent</p>
          <pre className="mt-1.5 max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg p-2.5 text-[12px] leading-relaxed text-ink">
            {preview}
          </pre>
        </div>
        {error ? <p className="mt-2 text-[11.5px] text-warn">{error}</p> : null}
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-[11px] leading-snug text-muted">It runs like any work order: the engine still asks before it acts.</p>
          <button
            type="button"
            onClick={() => void run()}
            disabled={!rendered.ok || sending}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium ${rendered.ok && !sending ? 'bg-accent text-[var(--accent-ink)] hover:bg-accent/90' : 'bg-white/[0.06] text-muted'}`}
          >
            <Play size={11} aria-hidden />
            {sending ? 'Sending…' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * The map of the working folder, one press away: structure only, bounded,
 * honest about cuts. Copy takes it anywhere; Add to message rides it with
 * the next work order so the engine starts knowing what lives where.
 */
function MapButton({ onInsert }: { onInsert: (mapBlock: string) => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<{ ok: boolean; map?: string; files?: number; dirs?: number; truncated?: boolean; answer?: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setCopied(false)
    void getEngineApi().repoMap().then((reply) => {
      setAnswer(reply)
      setLoading(false)
    })
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Map the working folder: structure on one page, bounded, honest about cuts"
        aria-label="Map the working folder"
        className="flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-muted hover:text-ink"
      >
        <Map size={13} aria-hidden />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-label="Map of the working folder" onClick={() => setOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-line bg-card p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">Map of the working folder</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-ink">
                <X size={15} />
              </button>
            </div>
            {loading ? <p className="mt-3 text-[12.5px] text-muted">Walking the folder…</p> : null}
            {!loading && answer && !answer.ok ? <p className="mt-3 text-[12px] text-warn">{answer.answer}</p> : null}
            {!loading && answer?.ok ? (
              <>
                <p className="mt-2 text-[11.5px] text-muted">
                  {answer.files} files · {answer.dirs} folders{answer.truncated ? ' · cut at the bounds, and the map says so' : ''} · the engine still reads the files itself
                </p>
                <pre className="mt-1.5 max-h-[320px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg p-2.5 text-[11.5px] leading-relaxed text-ink">
                  {answer.map}
                </pre>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard?.writeText(answer.map ?? '').catch(() => undefined); setCopied(true) }}
                    className="h-8 rounded-lg border border-line px-3 text-[12px] text-ink hover:border-ok"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { onInsert(mapContextBlock(answer.map ?? '')); setOpen(false) }}
                    className="h-8 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-accent/90"
                  >
                    Add to message
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
