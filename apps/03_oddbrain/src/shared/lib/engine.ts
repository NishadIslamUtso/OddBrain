/**
 * The engine contract — shared by the machine side and the window side.
 *
 * An "engine" is a worker that reads files, edits them and runs commands on the
 * user's behalf: Claude Code today, agy after its Windows check, others later.
 * The app never talks to an engine's private details — it only ever speaks this
 * shape, which is why a second engine can be added without touching a screen.
 *
 * Everything here is plain data on purpose: it crosses the preload bridge, and
 * the window only ever draws it — it never decides anything about it.
 */

export type EngineId = 'claude-code' | 'agy'

/**
 * Which engine to use, which brain to think with, and where the brain lives.
 * The defaults are the ones the owner already verified work on this machine:
 * the big free cloud brain through the local Ollama door.
 */
/** How much the engine may do before it asks. The app imposes no more. */
export type ApprovalMode = 'ask' | 'plan' | 'edits' | 'full'
/** How much room the engine's own thinking gets: its flag, our switch. */
export const THINKING_MODES = ['default', 'extended'] as const
export type ThinkingMode = (typeof THINKING_MODES)[number]

export const APPROVAL_MODES: ApprovalMode[] = ['ask', 'plan', 'edits', 'full']

/**
 * The engine's own official values for each setting of the throttle. `manual`
 * is Claude Code's alias for its default (ask before anything sensitive);
 * `acceptEdits` lets files change unasked inside the workspace; and
 * `bypassPermissions` is the engine's own full-speed mode — which still
 * respects its deny rules and guarded deletions, because even at full speed
 * an engine keeps its nature.
 */
export const PERMISSION_MODE: Record<ApprovalMode, string> = {
  ask: 'manual',
  plan: 'plan',
  edits: 'acceptEdits',
  full: 'bypassPermissions',
}

export type EngineSettings = {
  id: EngineId
  /** The brain the engine thinks with, e.g. `gemma4:cloud`. */
  model: string
  /**
   * Where the engine works — a folder the owner picked, like "open a folder"
   * in a real code app. Empty means the vault, which is the default workplace.
   */
  workspace: string
  /** The throttle: how much the engine may do before asking. */
  approval: ApprovalMode
  /** The engine's own thinking budget, as its environment variable. */
  thinking: ThinkingMode
  /**
   * The door the brain lives behind. Empty means "whatever this machine
   * already has", which lets an Anthropic key work later without app changes.
   */
  baseUrl: string
  /**
   * When the chosen brain comes from a provider (a key saved in Models),
   * the engine is launched pointed there WITH that key — riding the engine,
   * never around it. Empty means the engine's own local door.
   */
  cloudProvider: '' | 'anthropic'
}

export const DEFAULT_ENGINE: EngineSettings = {
  id: 'claude-code',
  // Empty on purpose: the engine runs AS ITSELF — its own login, its own
  // default brain. The old default here was `gemma4:cloud`, a name this app
  // invented and painted as if the machine had said it; the owner caught it
  // ("fake model names") and the fabrication dies today. A model is only
  // ever set from a list the MACHINE produced.
  model: '',
  baseUrl: 'http://localhost:11434',
  workspace: '',
  approval: 'ask',
  thinking: 'default',
  cloudProvider: '',
}

/** What a turn cost, as the engine itself reports it. */
export type EngineUsage = {
  inTokens: number
  outTokens: number
  durationMs: number | null
  /** A cloud brain's cost in dollars, when the engine names one. */
  costUsd: number | null
}

/** One brain the engine can use, as the engine itself reports it. */
export type EngineModelEntry = {
  name: string
  /** A cloud brain: its work leaves the machine, so the label must say so. */
  cloud: boolean
  /** Gigabytes on disk, for local brains. Cloud brains carry no size. */
  sizeGB: number | null
  /**
   * Which provider door this brain was read from. Empty = the engine's own
   * local door. 'anthropic' = read from the Anthropic API with a key from
   * Models; sending routes the ENGINE there with that key — the app itself
   * never calls the provider.
   */
  provider?: 'anthropic'
}

/** What a whole engine looks like from the machine it runs on. */
export type EngineAvailability = {
  id: EngineId
  found: boolean
  /** The engine's own version line, when it answers. */
  version: string
  /** The one-liner that fixes a missing engine. */
  install: string
  /** Where the working binary was found — absolute when probed directly. */
  path?: string
}

/** What an empty model choice is called, everywhere the UI shows it. */
export const OWN_CHOICE_MODEL_LABEL = 'the engine’s own choice'

/** The honest label for a model: the name, or what empty means. */
export function modelLabel(model: string): string {
  return model || OWN_CHOICE_MODEL_LABEL
}

const ENGINES: readonly EngineId[] = ['claude-code', 'agy']

/**
 * A model name may only be a model name. It reaches a command line, so the
 * rule is a pattern, not a comment: letters, digits, dots, colons, and a few
 * separator characters — nothing that a shell could interpret.
 */
const MODEL_PATTERN = /^[\w.:@/-]+$/

/** True for a model name the launch line can carry without a shell seeing it. */
export function isValidModelName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 120 && MODEL_PATTERN.test(value)
}

/**
 * Read engine settings from a parsed settings file without ever throwing —
 * the same promise the rest of the settings make. Anything missing, unknown
 * or absurd falls back to the default, because a damaged line in a file must
 * never cost somebody their working assistant.
 */
export function normalizeEngine(raw: unknown): EngineSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = ENGINES.includes(value.id as EngineId) ? (value.id as EngineId) : DEFAULT_ENGINE.id
  const text = (input: unknown, fallback: string, limit: number): string => {
    const trimmed = typeof input === 'string' ? input.trim().slice(0, limit) : ''
    return trimmed || fallback
  }
  const model = text(value.model, DEFAULT_ENGINE.model, 300)
  return {
    id,
    // `gemma4:cloud` was this app's own invented default; settings saved by
    // older builds carry it. It migrates to the honest empty choice.
    model: MODEL_PATTERN.test(model) && model !== 'gemma4:cloud' ? model : '',
    baseUrl: text(value.baseUrl, DEFAULT_ENGINE.baseUrl, 2048),
    workspace: typeof value.workspace === 'string' ? value.workspace.trim().slice(0, 4096) : '',
    approval: APPROVAL_MODES.includes(value.approval as ApprovalMode)
      ? (value.approval as ApprovalMode)
      : 'ask',
    thinking: value.thinking === 'extended' ? 'extended' : 'default',
    cloudProvider: value.cloudProvider === 'anthropic' ? 'anthropic' : '',
  }
}

/**
 * One thing the engine did, in the order it happened. The window draws these
 * as they arrive: text becomes bubbles, tool entries become activity cards,
 * a permission becomes an approve/deny card, done/error closes the turn.
 */
export type EngineEvent =
  | { kind: 'status'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; summary: string }
  | { kind: 'permission'; requestId: string; tool: string; summary: string; detail?: string; file?: string }
  /** The engine opened a resumable session (its init sentence carries the id). */
  | { kind: 'session'; id: string }
  /** A piece of the engine's words as they form — the stream, not the summary. */
  | { kind: 'delta'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'done'; text: string; usage?: EngineUsage }
  | { kind: 'error'; text: string; usage?: EngineUsage }
  | { kind: 'closed' }

/**
 * A short human sentence about a tool call — what it touches, not its whole
 * input. "runs `npm test`" beats forty lines of JSON in a chat bubble.
 */
/**
 * The detail a person needs to judge an approval: what exactly would change.
 * For file tools that is a before/after preview, for commands the line itself.
 * Everything is truncated — the card is a decision, not a log viewer.
 */
export function toolDetail(tool: string, input: unknown): string {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const str = (key: string): string => (typeof record[key] === 'string' ? (record[key] as string) : '')
  const clip = (text: string, limit: number): string =>
    text.length > limit ? `${text.slice(0, limit)}\n… (${text.length - limit} more characters)` : text
  const cap = 1200
  if (tool === 'Edit' || tool === 'NotebookEdit') {
    return clip(`--- before ---\n${str('old_string')}\n--- after ---\n${str('new_string')}`, cap)
  }
  if (tool === 'Write') return clip(`--- file content ---\n${str('content')}`, cap)
  if (tool === 'Bash' || tool === 'PowerShell') return clip(str('command') || str('script'), cap)
  if (tool === 'Read' || tool === 'Glob' || tool === 'Grep') {
    return clip(str('file_path') || str('pattern') || str('path'), 300)
  }
  const json = JSON.stringify(record) ?? ''
  return json ? clip(json, 400) : ''
}

export function toolSummary(name: string, input: unknown): string {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const string_ = (key: string): string => (typeof value[key] === 'string' ? (value[key] as string) : '')
  if (name === 'Bash' || name === 'bash') return string_('command').slice(0, 160)
  if (name === 'Read' || name === 'Write' || name === 'Edit' || name === 'NotebookEdit')
    return string_('file_path').slice(0, 200)
  if (name === 'Glob' || name === 'Grep') return string_('pattern').slice(0, 120)
  const text = JSON.stringify(value) ?? ''
  return text.length <= 160 ? text : `${text.slice(0, 157)}…`
}

/** Engine-specific model/provider choices never leak into another adapter. */
export function selectEngine(current: EngineSettings, id: EngineId): EngineSettings {
  return current.id === id ? current : { ...current, id, model: '', cloudProvider: '' }
}
