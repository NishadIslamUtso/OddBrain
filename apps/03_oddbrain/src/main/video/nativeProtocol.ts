import { randomUUID } from 'node:crypto'
import type { KdenliveEditPlan, KdenlivePlanCommand, KdenliveProjectSnapshot } from '../../shared/lib/videoStudio'

/**
 * Protocol adapter for the separately installed native Kdenlive MCP build.
 * No GPL implementation code is bundled here. These names and envelopes are
 * independently implemented from the published protocol at the pinned review
 * reference below; Kdenlive remains a separate application.
 */
export const NATIVE_KDENLIVE_REFERENCE = {
  repository: 'https://github.com/lucasscariot/kdenlive',
  commit: 'b9a1a6ce0612d9bb6be2b7df2473c2ffbe71e798',
  serverName: 'kdenlive-native',
  serverVersion: '1.0.0',
  protocol: '2025-06-18',
} as const

export const NATIVE_WORKFLOW_TOOLS = [
  'desktop_capabilities',
  'desktop_state',
  'desktop_media_import',
  'desktop_batch_validate',
  'desktop_batch',
  'desktop_history',
  'desktop_undo',
  'desktop_redo',
  'desktop_frame_capture',
  'desktop_preview_render',
  'desktop_render',
  'desktop_render_status',
  'desktop_render_verify',
  'desktop_render_cancel',
] as const

const COMMAND_TYPES = new Set([
  // Exact batchable command names published by the pinned native protocol.
  'title_create', 'replace_clip', 'clip_fade', 'audio_duck', 'reframe',
  'effect_add', 'effect_set', 'effect_remove', 'title_edit', 'marker_add',
  'marker_edit', 'marker_remove', 'marker_import', 'import', 'remove_asset',
  'remove_clip', 'split', 'remove_range', 'remove_gap', 'insert_space', 'group',
  'ungroup', 'speed', 'enable', 'transcript_import', 'range_cut', 'insert',
  'move', 'trim', 'audio_envelope', 'rename_track',
])

const plain = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function boundedJson(value: unknown, depth = 0): unknown {
  if (depth > 8) throw Error('The edit plan is nested too deeply.')
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw Error('The edit plan contains an invalid number.')
    return value
  }
  if (typeof value === 'string') {
    if (value.length > 20_000 || /\u0000/.test(value)) throw Error('The edit plan contains invalid or oversized text.')
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > 500) throw Error('The edit plan contains an oversized list.')
    return value.map(item => boundedJson(item, depth + 1))
  }
  if (!plain(value) || Object.keys(value).length > 100) throw Error('The edit plan contains an unsupported value.')
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key)) throw Error('The edit plan contains an invalid field name.')
    return [key, boundedJson(item, depth + 1)]
  }))
}

const short = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return ''
  const clean = value.trim()
  return clean && clean.length <= max && !/[\u0000-\u001f]/.test(clean) ? clean : ''
}

const REQUIRED_FIELDS: Partial<Record<(typeof NATIVE_WORKFLOW_TOOLS)[number], string[]>> = {
  desktop_media_import: ['sessionId', 'expectedRevision', 'requestId', 'path'],
  desktop_batch_validate: ['commands'],
  desktop_batch: ['sessionId', 'expectedRevision', 'requestId', 'commands'],
  desktop_undo: ['sessionId', 'expectedRevision', 'requestId'],
  desktop_redo: ['sessionId', 'expectedRevision', 'requestId'],
  desktop_frame_capture: ['position'],
  desktop_preview_render: ['sessionId', 'expectedRevision', 'requestId', 'path', 'start', 'end'],
  desktop_render: ['sessionId', 'expectedRevision', 'requestId', 'path'],
  desktop_render_verify: ['path'],
  desktop_render_cancel: ['path'],
}

export function nativeCompatibility(serverInfo: unknown, protocol: unknown, tools: Array<string | { name: string; inputSchema?: { required?: string[] } }>): { compatible: boolean; missing: string[]; identity: string; reason: string } {
  const info = plain(serverInfo) ? serverInfo : {}
  const name = short(info.name, 100), version = short(info.version, 100)
  const toolNames = tools.map(tool => typeof tool === 'string' ? tool : tool.name)
  const missing = NATIVE_WORKFLOW_TOOLS.filter(tool => !toolNames.includes(tool)) as string[]
  for (const [name, fields] of Object.entries(REQUIRED_FIELDS)) {
    const candidate = tools.find(value => typeof value !== 'string' && value.name === name)
    const tool = typeof candidate === 'string' ? undefined : candidate
    if (tool && fields!.some(field => !tool.inputSchema?.required?.includes(field))) missing.push(`${name} schema(${fields!.join(',')})`)
  }
  const identity = [name || 'unidentified MCP server', version].filter(Boolean).join(' ')
  const compatible = name === NATIVE_KDENLIVE_REFERENCE.serverName && version === NATIVE_KDENLIVE_REFERENCE.serverVersion && protocol === NATIVE_KDENLIVE_REFERENCE.protocol && missing.length === 0
  const reason = compatible
    ? `Matches the reviewed native protocol identity and core workflow at ${NATIVE_KDENLIVE_REFERENCE.commit.slice(0, 12)}. This is protocol compatibility, not proof of its Windows build or source provenance.`
    : name !== NATIVE_KDENLIVE_REFERENCE.serverName
      ? `Expected ${NATIVE_KDENLIVE_REFERENCE.serverName}; the endpoint identified itself as ${identity}. Generic discovery remains available, but reviewed edit batches are disabled.`
      : version !== NATIVE_KDENLIVE_REFERENCE.serverVersion
        ? `Expected native MCP protocol ${NATIVE_KDENLIVE_REFERENCE.serverVersion}; the endpoint reported ${version || 'no version'}. Review the new protocol before editing.`
        : protocol !== NATIVE_KDENLIVE_REFERENCE.protocol
          ? `Expected MCP ${NATIVE_KDENLIVE_REFERENCE.protocol}; the endpoint negotiated ${String(protocol || 'no version')}.`
          : `The native server is missing required workflow tools: ${missing.join(', ')}.`
  return { compatible, missing: [...missing], identity, reason }
}

/** MCP tool results carry protocol data as a JSON text content block. */
export function toolPayload(result: unknown): any {
  if (!plain(result)) throw Error('Kdenlive MCP returned an invalid tool result.')
  const block = Array.isArray(result.content) ? result.content.find(item => plain(item) && item.type === 'text' && typeof item.text === 'string') : undefined
  let parsed: any = plain(result.structuredContent) ? result.structuredContent : undefined
  if (plain(block) && typeof block.text === 'string') {
    try { parsed = JSON.parse(block.text) } catch { throw Error('Kdenlive MCP returned unreadable tool JSON.') }
  }
  if (!plain(parsed)) throw Error('Kdenlive MCP returned no readable tool payload.')
  if (result.isError === true || parsed.ok === false) {
    const nested = plain(parsed.error) ? parsed.error : {}
    const message = short(nested.message, 1000) || (typeof parsed.error === 'string' ? parsed.error.slice(0, 1000) : 'The native tool reported an error.')
    const code = short(nested.code, 100)
    throw Error(`Kdenlive MCP${code ? ` ${code}` : ''}: ${message}`)
  }
  // The pinned server wraps every successful native result as { ok: true, data }.
  // Accepting the older direct shape keeps read-only compatibility without
  // weakening identity/schema checks for editing.
  return parsed.ok === true && plain(parsed.data) ? parsed.data : parsed
}

export function projectSnapshot(value: unknown): KdenliveProjectSnapshot {
  if (!plain(value)) throw Error('Kdenlive did not return a project state.')
  const state = plain(value.state) ? value.state : value
  const sessionId = short(state.sessionId, 200), sequenceId = short(state.sequenceId, 200), documentUrl = short(state.documentUrl, 4096)
  const revision = Number(state.revision)
  if (!sessionId || !sequenceId || !Number.isSafeInteger(revision) || revision < 0) throw Error('Kdenlive state is missing its editing session, sequence, or revision.')
  const profile = plain(state.profile) ? state.profile : {}
  const fpsValue = plain(state.fps) && Number(state.fps.denominator) > 0 ? Number(state.fps.numerator) / Number(state.fps.denominator) : 0
  const undo = plain(state.undo) ? state.undo : {}
  return {
    documentUrl,
    sequenceId,
    sessionId,
    revision,
    modified: state.modified === true,
    profile: {
      width: Number.isSafeInteger(Number(profile.width)) ? Number(profile.width) : 0,
      height: Number.isSafeInteger(Number(profile.height)) ? Number(profile.height) : 0,
      description: short(profile.description, 300),
      duration: Number.isSafeInteger(Number(profile.duration)) ? Number(profile.duration) : 0,
      fps: Number.isFinite(fpsValue) && fpsValue > 0 ? fpsValue : 0,
    },
    undo: {
      index: Number.isSafeInteger(Number(undo.index)) ? Number(undo.index) : 0,
      canUndo: undo.canUndo === true,
      canRedo: undo.canRedo === true,
      undoText: short(undo.undoText, 500),
      redoText: short(undo.redoText, 500),
    },
    counts: plain(state.counts) ? Object.fromEntries(Object.entries(state.counts).filter(([, count]) => Number.isSafeInteger(Number(count))).map(([key, count]) => [key, Number(count)])) : {},
  }
}

export function normalizeEditPlan(value: unknown): KdenliveEditPlan {
  if (!plain(value)) throw Error('The proposed edit plan must be a structured object.')
  const title = short(value.title, 200), purpose = short(value.purpose, 2000)
  if (!title || !purpose) throw Error('The edit plan needs a title and purpose.')
  if (!Array.isArray(value.commands) || value.commands.length < 1 || value.commands.length > 200) throw Error('The edit plan needs 1–200 exact Kdenlive commands.')
  const commands = value.commands.map((raw, index): KdenlivePlanCommand => {
    if (!plain(raw)) throw Error(`Edit command ${index + 1} is not an object.`)
    const type = short(raw.type, 80)
    if (!COMMAND_TYPES.has(type)) throw Error(`Edit command ${index + 1} uses unsupported native command “${type || 'missing'}”.`)
    return boundedJson(raw) as KdenlivePlanCommand
  })
  const sourceEvidenceIds = Array.isArray(value.sourceEvidenceIds) ? value.sourceEvidenceIds.map(item => short(item, 200)).filter(Boolean).slice(0, 100) : []
  const assetNeeds = Array.isArray(value.assetNeeds) ? value.assetNeeds.slice(0, 50).map((need, index) => {
    if (!plain(need)) throw Error(`Asset need ${index + 1} is invalid.`)
    const kind = need.kind, query = short(need.query, 160), purpose = short(need.purpose, 1000), placement = short(need.placement, 500)
    if (!['image', 'video', 'audio'].includes(String(kind)) || !query || !purpose || !placement) throw Error(`Asset need ${index + 1} is incomplete.`)
    return { kind: kind as 'image' | 'video' | 'audio', query, purpose, placement }
  }) : []
  const expected = plain(value.expectedProject) ? value.expectedProject : {}
  return {
    id: short(value.id, 200) || randomUUID(),
    title,
    purpose,
    sourceEvidenceIds,
    expectedProject: {
      documentUrl: short(expected.documentUrl, 4096),
      sequenceId: short(expected.sequenceId, 200),
      revision: Number.isSafeInteger(Number(expected.revision)) && Number(expected.revision) >= 0 ? Number(expected.revision) : -1,
    },
    commands,
    assetNeeds,
    notes: short(value.notes, 5000),
  }
}

export function commandSummary(commands: KdenlivePlanCommand[]): string[] {
  return commands.map((command, index) => {
    const target = ['trackId', 'clipId', 'binId', 'position', 'start', 'end'].flatMap(key => command[key] === undefined ? [] : [`${key}=${String(command[key]).slice(0, 80)}`]).join(', ')
    return `${index + 1}. ${command.type}${target ? ` · ${target}` : ''}`
  })
}
