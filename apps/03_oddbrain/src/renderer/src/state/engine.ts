import type { WorkQueueItem } from '@shared/lib/workQueue'
import type { NativeConversation, ContextReceipt } from '@shared/lib/nativeConversation'
import { effortTarget } from '@shared/lib/engineCapabilities'
import type { ThinkingMode } from '@shared/lib/engine'
import { selectEngine } from '@shared/lib/engine'
/**
 * The engine, as the interface sees it.
 *
 * All state lives in one small module-level store with a subscribe function —
 * the same shape the rest of this app's state uses, so both the composer's
 * toggle and the activity panel can look at the same engine without prop
 * drilling or a context. Nothing here talks to an engine directly: every
 * machine word goes through the bridge, and a missing machine (the browser
 * preview) gets honest refusals, never invented work.
 */
import { useSyncExternalStore } from 'react'
import type {
  ApprovalMode,
  EngineAvailability,
  EngineEvent,
  EngineId,
  EngineModelEntry,
  EngineSettings,
  EngineUsage,
} from '@shared/lib/engine'
import { DEFAULT_ENGINE } from '@shared/lib/engine'
import { getEngineApi, bridge } from '@/platform/bridge'

/** One finished thing the engine said, already shaped for drawing. */
export type EngineItem =
  | { kind: 'status'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; name: string; summary: string }
  | { kind: 'error'; text: string }

/** A question from the engine that a person must answer. */
const answering = new WeakSet<object>()
export type EnginePermission = { requestId: string; tool: string; summary: string; detail?: string }

/** The engine's brains, as its own door reports them. */
export type EngineModels = { loading: boolean; entries: EngineModelEntry[]; error: string }

/** What is really installed on this machine, as the last detection saw it. */
export type EngineDetection = { loading: boolean; engines: EngineAvailability[] }

/** Bringing a brain home, as the door reports its progress. */
export type PullState = {
  active: boolean
  name: string
  status: string
  /** 0..1 while downloading; null when the door gives no sizes. */
  fraction: number | null
  error: string
}

/** One work order, from the moment it is sent to the moment it lands. */
export type EngineTurn = {
  chatId?: string
  transcriptId?: string
  context?: ContextReceipt
  prompt: string
  items: EngineItem[]
  /**
   * The questions waiting for a person, in arrival order. The engine can ask
   * faster than a person answers: a queue means no question is lost under
   * the one being looked at (the old single card silently dropped all but
   * the last, and the engine waited forever on a card nobody held).
   */
  permissions: EnginePermission[]
  state: 'running' | 'done' | 'error'
  /** The engine's own session id, when it opened one — the resumable thread. */
  sessionId: string | null
  /** What the turn cost, as the engine itself reported. */
  usage: EngineUsage | null
  /** How many pictures rode with the words (drawn beside the prompt). */
  pictures?: number
  /** Tool errors and retries the engine hit and came back from. */
  bumps?: number
}

export type EngineState = {
  settings: EngineSettings
  /** Whether the composer sends work to the engine instead of the chat brain. */
  on: boolean
  turn: EngineTurn | null
  models: EngineModels
  detection: EngineDetection
  pull: PullState
  /** Whether the engine process is alive on this machine, as last reported. */
  alive: boolean
  /**
   * Live engine activity seen from ANOTHER window: this window has no turn of
   * its own, but the machine's engine is clearly working. Read-only by design
   * — the permission cards stay with the window that owns the turn.
   */
  ambient: { busy: boolean; note: string; updatedAt: string | null }
  /** What the engine's context holds, as far as this window honestly knows. */
  totals: ContextTotals
  /** Work orders waiting to run when the current turn closes. */
  line: LineItem[]
  queueError: string
  /** Finished turns kept from before this window opened. */
  journal: JournalEntry[]
}

export type ContextTotals = {
  turns: number
  inTokens: number
  outTokens: number
  costUsd: number
}

export type LineItem = WorkQueueItem

export type JournalEntry = {
  at: string
  prompt: string
  answer: string
  sessionId: string | null
  usage: string
  workspace: string
}

type EngineStore = EngineState & {
  /** Wire the bridge up once: read the settings, listen for events. */
  init(): Promise<void>
  setOn(value: boolean): void
  send(prompt: string, pictures?: Array<{ mime: string; data: string }>, conversation?: NativeConversation, queuedId?: string): Promise<{ ok: boolean; answer: string; transcriptId?: string }>
  answer(allow: boolean): Promise<void>
  stop(): Promise<void>
  /** Fold one wire event into the turn. Public so tests can drive it directly. */
  ingest(event: EngineEvent): void
  /** Whether the engine process is alive on this machine. */
  running(): boolean
  /** Choose which engine thinks inside the app; persists. */
  pick(id: EngineId): Promise<{ ok: boolean; answer: string }>
  /** Ask the brain door what the engine can use. */
  loadModels(): Promise<void>
  /** Pick the engine's brain; persists. */
  setModel(name: string, provider?: 'anthropic' | 'native'): Promise<void>
  /** Set the throttle: how much the engine may do before asking; persists. */
  setApproval(mode: ApprovalMode): Promise<void>
  /** Requested reasoning effort, bound to the inspected route; persists. */
  setThinking(mode: ThinkingMode, target: string): Promise<{ ok: boolean; answer: string }>
  /** Park a work order for when the current turn closes. */
  enqueue(prompt: string, conversation?: NativeConversation): Promise<void>
  removeFromLine(id: string): Promise<void>
  clearLine(): Promise<void>
  refreshLine(): Promise<void>
  resumeLine(id: string, acknowledgeUncertain?: boolean): Promise<void>
  /** "Open a folder": pick where the engine works; persists. */
  pickWorkspace(): Promise<void>
  setWorkspace(folder: string): Promise<{ ok: boolean; answer: string }>
  /** Ask the machine which engines really exist. */
  checkEngines(fresh?: boolean): Promise<void>
  /** Bring a brain home; progress lands in `pull`. */
  startPull(name: string): Promise<{ ok: boolean; answer: string }>
  /** Take a brain off this machine. */
  removeModel(name: string): Promise<{ ok: boolean; answer: string }>
}

const state: EngineState = {
  settings: { ...DEFAULT_ENGINE },
  on: false,
  turn: null,
  models: { loading: false, entries: [], error: '' },
  detection: { loading: false, engines: [] },
  pull: { active: false, name: '', status: '', fraction: null, error: '' },
  alive: false,
  ambient: { busy: false, note: '', updatedAt: null },
  totals: { turns: 0, inTokens: 0, outTokens: 0, costUsd: 0 },
  line: [],
  queueError: '',
  journal: [],
}

/** The window's own totals, honestly scoped to what it has seen. */
const totals = (): ContextTotals => ({ ...state.totals })

/** Sequencers (battle, split, compact) hold the line while they drive. */
const lineHolds = new Set<() => boolean>()
export function registerLineHold(hold: () => boolean): () => void {
  lineHolds.add(hold)
  return () => lineHolds.delete(hold)
}
const lineHeld = (): boolean => [...lineHolds].some(hold => hold())

/** A finished turn is recorded once, whichever event closes it first. */
const journaled = new WeakSet<EngineTurn>()

let draining = false, queueRequest = 0
let drainTimer: ReturnType<typeof setTimeout> | null = null

const usageLine = (usage: EngineUsage | null): string =>
  usage
    ? `${usage.inTokens} in · ${usage.outTokens} out${usage.costUsd !== null ? ` · $${usage.costUsd.toFixed(4)}` : ''}`
    : ''

/** When a turn closes: keep the record, then let the next queued task go. */
const afterTurnClosed = (turn: EngineTurn): void => {
  if (journaled.has(turn)) return
  journaled.add(turn)
  if (replaying) return // replay is not another execution or another journal entry
  const record = {
    at: new Date().toISOString(),
    prompt: turn.prompt,
    answer: turn.items
      .filter((item): item is Extract<EngineItem, { text: string }> => item.kind === 'text')
      .map(item => item.text)
      .join(' ')
      .slice(0, 400),
    sessionId: turn.sessionId,
    usage: usageLine(turn.usage),
    workspace: state.settings.workspace,
  }
  void getEngineApi()
    .journal?.append?.(record)
    ?.catch?.(() => undefined)
  if (drainTimer) clearTimeout(drainTimer)
  drainTimer = setTimeout(() => {
    drainTimer = null
    drainLine()
  }, 600)
}

/** The line: parked work orders, run in order when the engine is free. */
const drainLine = (): void => {
  if (lineHeld() || sending || draining || state.ambient.busy || state.turn?.state === 'running') return
  const next = state.line.find(item => item.status === 'queued' && item.eligible)
  if (!next) return
  draining = true
  void store.send(next.prompt, [], next.conversation, next.id).then(async answer => {
    if (!answer.ok && answer.answer.includes('could not be confirmed')) { try { await bridge.engine.queue.hold(next.id) } catch { setState({ queueError: 'Queue response is uncertain. Inspect recorded work before retrying.' }) } }
  }).finally(async () => {
    // Never remove before acknowledgement. Main owns the one-use handoff and
    // retains failures/uncertainty, including a lost response after dispatch.
    await store.refreshLine(); draining = false
    // A refused/unknown request is not an invitation to retry in a loop.
  })
}

let lastSequence = 0, replaying = false
let subscribed = false
let initialization: Promise<void> | null = null
let sending = false, sendGeneration = 0
let modelRequest = 0
let version = 0
const listeners = new Set<() => void>()

const emit = (): void => {
  version += 1
  for (const listener of listeners) listener()
}

const setState = (patch: Partial<EngineState>): void => {
  Object.assign(state, patch)
  emit()
}

/** Runaway-loop guard: the same tool on the same target, back to back. */
const repeats = { key: '', count: 0 }

/** Fold one wire event into the current turn, whatever order they arrive in. */
const ingest = (event: EngineEvent): void => {
  if (event.sequence !== undefined) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= lastSequence) return
    lastSequence = event.sequence
  }
  // The engine's existence is not a per-turn fact: even with no task under
  // way, a closed engine must dim its light.
  if (event.kind === 'closed') state.alive = false
  if (event.kind === 'done' || event.kind === 'error') {
    repeats.key = ''
    repeats.count = 0
  }
  // A window with no turn of its own still SEES the machine working: this is
  // how the quick-ask window (and any second window) knows the engine is
  // mid-turn elsewhere instead of sitting in silent ignorance. Cards and
  // answers remain the owning window's business.
  if (!state.turn && event.kind !== 'closed') {
    const note =
      event.kind === 'status' && 'text' in (event as Record<string, unknown>)
        ? String((event as { text?: unknown }).text ?? '').slice(0, 120)
        : event.kind === 'tool'
          ? 'using a tool'
          : event.kind === 'text'
            ? 'writing'
            : 'working'
    state.ambient = { busy: true, note, updatedAt: new Date().toISOString() }
  }
  const turn = state.turn
  if (turn && ((event.chatId && turn.chatId && event.chatId !== turn.chatId) || (event.transcriptId && turn.transcriptId && event.transcriptId !== turn.transcriptId))) {
    state.ambient = { busy: !['done', 'error', 'closed'].includes(event.kind), note: 'Work in another conversation', updatedAt: new Date().toISOString() }; emit(); if (!state.ambient.busy && state.line.length) queueMicrotask(drainLine); return
  }
  if (turn) {
    if (event.chatId) turn.chatId = event.chatId
    if (event.transcriptId) turn.transcriptId = event.transcriptId
    if (event.context) turn.context = event.context
  }
  if (!turn) {
    if (event.kind === 'done' || event.kind === 'error' || event.kind === 'closed') {
      state.ambient = { busy: false, note: '', updatedAt: state.ambient.updatedAt }
    }
    emit(); if (!state.ambient.busy && state.line.length) queueMicrotask(drainLine)
    return
  }
  if (event.kind === 'session') {
    turn.sessionId = event.id
  } else if (event.kind === 'status') {
    // The honest bump counter: the engine's own words about a failed tool
    // call or a retry, counted so the finished card can say "recovered"
    // with the engine's numbers, never invented ones.
    if (/tool call failed|retry/i.test(event.text)) turn.bumps = (turn.bumps ?? 0) + 1
    turn.items.push({ kind: 'status', text: event.text })
  } else if (event.kind === 'text') {
    turn.items.push({ kind: 'text', text: event.text })
  } else if (event.kind === 'delta') {
    // The stream, as it forms: the engine's last item grows word by word
    // instead of a hundred one-word items being stacked up.
    const last = turn.items.at(-1)
    if (last?.kind === 'text') last.text += event.text
    else turn.items.push({ kind: 'text', text: event.text })
  } else if (event.kind === 'thinking') {
    // The model's scratchwork, folded away from the answer. It grows like a
    // delta while the thinking block streams, and stays one item, not a
    // hundred fragments.
    const last = turn.items.at(-1)
    if (last?.kind === 'thinking') last.text += event.text
    else turn.items.push({ kind: 'thinking', text: event.text })
  } else if (event.kind === 'tool') {
    // The repetition inspector: an engine stuck in a loop does the same step
    // over and over. Say it once, at the third identical step, so a person
    // can press Stop before the burn; any different step resets the count.
    const key = `${event.name}\u0000${event.summary}`
    repeats.count = repeats.key === key ? repeats.count + 1 : 1
    repeats.key = key
    turn.items.push({ kind: 'tool', name: event.name, summary: event.summary })
    if (repeats.count === 3) {
      turn.items.push({
        kind: 'status',
        text: 'The engine has done the same step three times in a row. Stop is in the header if it is stuck.',
      })
    }
  } else if (event.kind === 'permission') {
    turn.permissions.push({
      requestId: event.requestId,
      tool: event.tool,
      summary: event.summary,
      detail: event.detail,
    })
  } else if (event.kind === 'done') {
    // The wire says the same goodbye twice (once as the engine's last words,
    // once as the result) — show it once.
    const last = turn.items.at(-1)
    const alreadySaid = event.text && last?.kind === 'text' && last.text === event.text
    if (event.text && !alreadySaid && !event.alreadyDisplayed) turn.items.push({ kind: 'text', text: event.text })
    // Small or broken models sometimes end a turn with no words at all. A
    // silent blank reply would look like the app froze; one muted line says
    // what actually happened and what to do next.
    if (!event.text?.trim() && !turn.items.some((item) => (item.kind === 'text' && item.text.trim()) || (item.kind === 'status' && item.text.startsWith('This turn ended with no words')))) {
      turn.items.push({ kind: 'status', text: 'This turn ended with no words from the model. Ask again, or try another model.' })
    }
    if (event.usage) {
      turn.usage = event.usage
      state.totals = {
        turns: state.totals.turns + 1,
        inTokens: state.totals.inTokens + event.usage.inTokens,
        outTokens: state.totals.outTokens + event.usage.outTokens,
        costUsd: state.totals.costUsd + (event.usage.costUsd ?? 0),
      }
    }
    turn.state = 'done'
    turn.permissions = []
    afterTurnClosed(turn)
  } else if (event.kind === 'closed') {
    // The engine process ended. After a finished task this changes nothing;
    // after a Stop or a crash it is what closes the turn — without it the
    // panel would say "working" forever (a reviewed-and-reproduced bug).
    if (turn.state === 'running') {
      turn.items.push({ kind: 'status', text: 'engine stopped' })
      turn.state = 'done'
      turn.permissions = []
      afterTurnClosed(turn)
    }
  } else {
    turn.items.push({ kind: 'error', text: event.text })
    if ('usage' in event && event.usage) {
      turn.usage = event.usage
      state.totals = {
        turns: state.totals.turns + 1,
        inTokens: state.totals.inTokens + event.usage.inTokens,
        outTokens: state.totals.outTokens + event.usage.outTokens,
        costUsd: state.totals.costUsd + (event.usage.costUsd ?? 0),
      }
    }
    turn.state = 'error'
    turn.permissions = []
    afterTurnClosed(turn)
  }
  emit()
}

const store: EngineStore = {
  // Getters, not copies: anything that reads the store reads the live state,
  // and React's snapshot is the version counter bumped on every change.
  get settings() {
    return state.settings
  },
  get on() {
    return state.on
  },
  get turn() {
    return state.turn
  },
  get models() {
    return state.models
  },
  get alive() {
    return state.alive
  },
  get ambient() {
    return state.ambient
  },
  get detection() {
    return state.detection
  },
  get pull() {
    return state.pull
  },
  get totals() {
    return totals()
  },
  get line() {
    return state.line
  },
  get queueError() { return state.queueError },
  get journal() {
    return state.journal
  },

  async init(): Promise<void> {
    if (subscribed) return
    if (initialization) return initialization
    initialization = (async () => {
    const api = getEngineApi()
    const buffered: EngineEvent[] = []; let hydrated = false
    const unsubscribe = api.onEvent(event => { if (hydrated) ingest(event); else buffered.push(event) })
    try {
      const read = await api.read()
      setState({ settings: read.engine, alive: read.running })
      // Hydrate-or-drop. A window opened mid-turn (or reloaded after one)
      // replays the remembered events so the work is not invisible. A turn
      // that cannot be told whole is dropped, never half-shown: whatever
      // still says "running" when the engine is not is a phantom, and is
      // closed as one.
      const remembered = (Array.isArray(read.history) ? read.history : []).filter(
        (event): event is EngineEvent => Boolean(event && typeof event === 'object' && 'kind' in event)
      )
      const worthShowing = remembered.some((event) =>
        ['status', 'text', 'thinking', 'tool', 'permission', 'done', 'error'].includes(event.kind)
      )
      if ((worthShowing || read.active) && !state.turn) {
        state.turn = {
          prompt: read.active?.prompt || '(from before this window opened)',
          chatId: read.active?.chatId || remembered.find(event => event.chatId)?.chatId,
          transcriptId: read.active?.transcriptId,
          items: [],
          permissions: [],
          // Replayed as if live; reconciled with the machine below.
        state: 'running',
          sessionId: null,
          usage: null,
        }
        replaying = true
        try { for (const event of remembered) ingest(event) } finally { replaying = false }
        // The engine being gone changes the story: a still-"running" replay
        // is closed honestly, and a question it still waits on is dropped —
        // nobody can answer it anymore.
        if (!read.running) {
          state.turn.permissions = []
          if (state.turn.state === 'running') {
            state.turn.items.push({ kind: 'status', text: 'engine stopped' })
            state.turn.state = 'done'
          }
        }
        emit()
      }
      if (Number.isSafeInteger(read.lastSequence)) lastSequence = Math.max(lastSequence, read.lastSequence!)
      hydrated = true
      for (const event of buffered) ingest(event)
      buffered.length = 0
    } catch (error) { if (typeof unsubscribe === 'function') unsubscribe(); throw error }
    // The record of earlier sessions, bounded and read-only.
    const earlier = api.journal?.list?.()
    if (earlier && typeof earlier.then === 'function') {
      earlier
        .then((answer: { entries?: JournalEntry[] }) => {
          if (answer?.entries?.length) setState({ journal: answer.entries })
        })
        .catch(() => undefined)
    }
    api.onPullEvent((tick) => {
      const record = (tick && typeof tick === 'object' ? tick : {}) as Record<string, unknown>
      const status = typeof record.status === 'string' ? record.status : ''
      const error = typeof record.error === 'string' ? record.error : ''
      const total = typeof record.total === 'number' ? record.total : null
      const completed = typeof record.completed === 'number' ? record.completed : null
      const fraction = total !== null && completed !== null && total > 0 ? Math.min(1, completed / total) : null
      setState({ pull: { ...state.pull, status, error, fraction } })
    })
    subscribed = true
    await store.refreshLine()
    })()
    try { await initialization } finally { initialization = null }
  },

  setOn(value: boolean): void {
    setState({ on: value === true })
    if (state.on) void store.init()
  },

  async send(prompt: string, pictures: Array<{ mime: string; data: string }> = [], conversation?: NativeConversation, queuedId?: string): Promise<{ ok: boolean; answer: string; transcriptId?: string }> {
    if (sending || state.ambient.busy || state.turn?.state === 'running') {
      return { ok: false, answer: 'The engine is already working on the last task.' }
    }
    // Hydrate BEFORE the first send, not beside it: a cold window that sends
    // immediately must go out with the real engine and folder, not defaults.
    sending = true; const own = sendGeneration
    try {
    await store.init()
    if (own !== sendGeneration) return { ok: false, answer: 'Send canceled before dispatch. Your draft was not sent.' }
    if (store.turn?.state === 'running') return { ok: false, answer: 'The engine is already working on the last task.' }
    repeats.key = ''
    repeats.count = 0
    const turn: EngineTurn = { chatId: conversation?.chatId, prompt, items: [], permissions: [], state: 'running', sessionId: null, usage: null, pictures: pictures.length }
    setState({ turn })
    const answer = await getEngineApi().send(prompt, '', pictures, conversation, queuedId)
    if (answer.transcriptId) turn.transcriptId = answer.transcriptId
    if (answer.ok) { state.alive = true; emit() }
    if (!answer.ok) {
      // The refusal is the result, shown where the work would have appeared —
      // the same honesty rule the rest of the app follows.
      turn.items.push({ kind: 'error', text: answer.answer })
      turn.state = 'error'
      emit()
    }
    return answer
    } catch {
      const answer = 'The send could not be confirmed. Inspect the transcript before retrying; your draft is retained.'
      if (store.turn?.state === 'running' && state.turn) { state.turn.state = 'error'; state.turn.items.push({ kind: 'error', text: answer }); emit() }
      return { ok: false, answer }
    } finally { sending = false; if (state.line.length) queueMicrotask(drainLine) }
  },

  async answer(allow: boolean): Promise<void> {
    const turn = state.turn
    const permission = turn?.permissions[0]
    if (!turn || !permission || answering.has(permission)) return
    answering.add(permission)
    try {
      const reply = await getEngineApi().answer(permission.requestId, allow)
      if (state.turn !== turn) return
      if (reply.ok) turn.permissions = turn.permissions.filter(p => p !== permission)
      else turn.items.push({ kind: 'status', text: 'The engine did not accept that permission response. It may have expired; no approval is assumed.' })
    } catch { if (state.turn === turn) turn.items.push({ kind: 'status', text: 'The permission response could not be delivered. No approval is assumed.' }) }
    finally { answering.delete(permission); emit() }
  },

  running(): boolean {
    return state.alive
  },

  async pick(id: EngineId): Promise<{ ok: boolean; answer: string }> {
    const answer = await getEngineApi().pick(id)
    if (!answer.ok) { setState({ models: { ...state.models, error: answer.answer } }); return answer }
    if (state.settings.id !== id) {
      modelRequest++
      setState({ settings: selectEngine(state.settings, id), models: { loading: false, entries: [], error: '' } })
      await store.loadModels()
    }
    return answer
  },

  async loadModels(): Promise<void> {
    if (state.models.loading) return
    const request = ++modelRequest
    setState({ models: { ...state.models, loading: true, error: '' } })
    try {
      const answer = await getEngineApi().models()
      if (request !== modelRequest) return
      setState({ models: { loading: false, entries: answer.models, error: answer.error || (!answer.ok ? 'The model sources did not answer.' : '') } })
    } catch {
      if (request === modelRequest) setState({ models: { loading: false, entries: [], error: 'The model sources could not be read. Try refreshing.' } })
    }
  },

  async setModel(name: string, provider?: 'anthropic' | 'native'): Promise<void> {
    const expectedEngine = state.settings.id
    const answer = await getEngineApi().setModel(name, provider, expectedEngine)
    if (answer.ok && state.settings.id === expectedEngine) setState({ settings: { ...state.settings, model: name, cloudProvider: provider === 'anthropic' || provider === 'native' ? provider : '', thinking: 'default', effortTarget: undefined } })
  },

  async setApproval(mode: ApprovalMode): Promise<void> {
    const answer = await getEngineApi().setApproval(mode)
    if (answer.ok) setState({ settings: { ...state.settings, approval: mode } })
  },

  async setThinking(mode: ThinkingMode, target: string): Promise<{ ok: boolean; answer: string }> {
    const answer = await getEngineApi().setThinking(mode, target)
    if (answer.ok && target === effortTarget(state.settings)) setState({ settings: { ...state.settings, thinking: mode, effortTarget: target } })
    return answer
  },

  async enqueue(prompt: string, conversation?: NativeConversation): Promise<void> {
    const own = ++queueRequest, items = await bridge.engine.queue.enqueue(prompt, conversation)
    if (own !== queueRequest) return
    setState({ line: items, queueError: '' }); drainLine()
  },
  async refreshLine(): Promise<void> {
    const own = ++queueRequest
    try { const line = await bridge.engine.queue.read(); if (own !== queueRequest) return; setState({ line, queueError: '' }); if (!draining && !sending) queueMicrotask(drainLine) }
    catch (error) { if (own !== queueRequest) return; setState({ queueError: (error as Error).message || 'Saved queue could not be read. No automatic task was started.' }) }
  },
  async resumeLine(id: string, acknowledgeUncertain = false): Promise<void> {
    const own = ++queueRequest
    try { const line = await bridge.engine.queue.resume(id, acknowledgeUncertain); if (own !== queueRequest) return; setState({ line, queueError: '' }); drainLine() }
    catch (error) { if (own !== queueRequest) return; setState({ queueError: (error as Error).message }) }
  },
  async removeFromLine(id: string): Promise<void> {
    const own = ++queueRequest
    try { const line = await bridge.engine.queue.cancel(id); if (own !== queueRequest) return; setState({ line, queueError: '' }) }
    catch (error) { if (own !== queueRequest) return; setState({ queueError: (error as Error).message }) }
  },
  async clearLine(): Promise<void> {
    // Explicit removal archives the records; it never pretends to stop work.
    for (const item of [...state.line].filter(item => item.status !== 'starting')) await store.removeFromLine(item.id)
    if (state.line.some(item => item.status === 'starting')) setState({ queueError: 'In-flight handoffs were retained. Use Stop on active work if needed.' })
  },

  async checkEngines(fresh = false): Promise<void> {
    if (state.detection.loading) return
    setState({ detection: { ...state.detection, loading: true } })
    const engines = await getEngineApi().detect(fresh)
    setState({ detection: { loading: false, engines } })
  },

  async startPull(name: string): Promise<{ ok: boolean; answer: string }> {
    if (state.pull.active) return { ok: false, answer: 'A brain is already downloading.' }
    setState({ pull: { active: true, name, status: 'asking the door', fraction: null, error: '' } })
    const answer = await getEngineApi().pull(name)
    setState({
      pull: answer.ok
        ? { active: false, name: '', status: 'done', fraction: 1, error: '' }
        : { ...state.pull, active: false, error: answer.answer },
    })
    if (answer.ok) void store.loadModels()
    return answer
  },

  async removeModel(name: string): Promise<{ ok: boolean; answer: string }> {
    const answer = await getEngineApi().deleteModel(name)
    if (answer.ok) void store.loadModels()
    return answer
  },

  async setWorkspace(folder: string): Promise<{ ok: boolean; answer: string }> {
    const answer = await bridge.engine.setWorkspace(folder)
    if (answer.ok) setState({ settings: { ...state.settings, workspace: answer.answer } })
    return answer
  },

  async pickWorkspace(): Promise<void> {
    const answer = await getEngineApi().pickWorkspace()
    if (answer.ok) setState({ settings: { ...state.settings, workspace: answer.answer } })
  },

  async stop(): Promise<void> {
    sendGeneration++
    await getEngineApi().stop()
    // Belt and suspenders: the 'closed' event also closes the turn, but the
    // person who pressed Stop should never wait for a wire to agree.
    state.alive = false
    const turn = state.turn
    if (turn?.state === 'running') {
      turn.items.push({ kind: 'status', text: 'stopped by you' })
      turn.state = 'done'
      turn.permissions = []
      emit()
    }
  },

  ingest,
}

/** Subscribe React to the store. The selector keeps redraws small. */
export function useEngine(): EngineStore & EngineState {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
  return store
}

/** The store without React, for tests and for non-drawing callers. */
export function engineStore(): EngineStore {
  return store
}

/** Subscribe to store changes without React (the watcher harvests on close). */
export function subscribeEngine(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * How many engine questions are waiting on a person, as a subscription that
 * re-renders only when THAT number changes — a header pulse must not redraw
 * on every streamed word, and the full store hook would make it.
 */
export function usePermissionsWaiting(): number {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => store.turn?.permissions.length ?? 0,
  )
  return store.turn?.permissions.length ?? 0
}

/** Test seam: put the store back to its first day. */
export function resetEngineForTests(): void {
  modelRequest++; sendGeneration++; sending = false; lastSequence = 0; replaying = false
  subscribed = false
  state.on = false
  state.turn = null
  state.line = []; state.queueError = ''; draining = false; queueRequest++
  state.settings = { ...DEFAULT_ENGINE }
  state.models = { loading: false, entries: [], error: '' }
  state.detection = { loading: false, engines: [] }
  state.pull = { active: false, name: '', status: '', fraction: null, error: '' }
  state.alive = false
  state.ambient = { busy: false, note: '', updatedAt: null }
  emit()
}
