'use strict'
/**
 * Spec-faithful FAKE of the Kdenlive native MCP server (lucasscariot/kdenlive @ b9a1a6c).
 * It is NOT Kdenlive. It reproduces the documented/observed protocol behaviour so the
 * REAL OddBrain adapter code can be exercised end to end:
 *  - Streamable HTTP, POST only (GET -> 405), JSON responses, 202 for notifications
 *  - initialize -> Mcp-Session-Id; unknown session -> HTTP 404 "Session not found. Initialize again."
 *  - rejects any Origin header, rejects non-loopback Host, optional bearer token
 *  - tools/call result: {isError, structuredContent: envelope, content:[text, image?]} where
 *    envelope = ok ? {ok:true, data:{...}} : {ok:false, error:{code,message}}   (mcpserver.cpp)
 *  - 60 real tool names (mcptools.cpp); real error codes SESSION_CHANGED, REVISION_CONFLICT,
 *    UNKNOWN_TRACK/CLIP/BIN, VALIDATION_UNSUPPORTED (livebridge*.cpp)
 *  - desktop_state default sections + snapshot shape (docs/native-mcp.md "State snapshot")
 *  - desktop_batch_validate: only normal `insert` is supported, every other command type yields
 *    a VALIDATION_UNSUPPORTED issue; result {ok,valid,issues[],sessionId,revision,supportedCommands}
 *  - edits need sessionId + expectedRevision + requestId; one Undo step per batch; atomic rollback
 */
const http = require('node:http')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const NAMES = fs.readFileSync(path.join(__dirname, 'native_tool_names.txt'), 'utf8').trim().split('\n')
const EDIT = ['sessionId', 'expectedRevision', 'requestId']
const REQUIRED = {
  desktop_media_import: [...EDIT, 'path'],
  desktop_batch_validate: ['commands'],
  desktop_batch: [...EDIT, 'commands'],
  desktop_undo: EDIT,
  desktop_redo: EDIT,
  desktop_frame_capture: ['position'],
  desktop_preview_render: [...EDIT, 'path', 'start', 'end'],
  desktop_render_cancel: ['path'],
  desktop_project_save: EDIT,
}
// 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function toolDefs() {
  return NAMES.map(name => ({ name, description: `fake ${name}`, inputSchema: { type: 'object', properties: {}, required: REQUIRED[name] || [], additionalProperties: false } }))
}

function newProject() {
  return {
    sessionId: 'kd-session-' + crypto.randomUUID().slice(0, 8),
    revision: 12,
    sequenceId: 'a1b2c3d4-0000-4000-8000-000000000001',
    documentUrl: 'file:///tmp/audit/work/project/reel.kdenlive',
    modified: false,
    fps: { numerator: 30, denominator: 1 },
    profile: { width: 1080, height: 1920, description: 'Vertical 1080x1920 30fps', duration: 0 },
    playhead: 0,
    activeTrackId: 3,
    tracks: [
      { id: 5, name: '', tag: 'V2', type: 'video', audio: false, locked: false, hidden: false, active: false, clips: [] },
      { id: 3, name: '', tag: 'V1', type: 'video', audio: false, locked: false, hidden: false, active: true, clips: [] },
      { id: 4, name: '', tag: 'A1', type: 'audio', audio: true, locked: false, muted: false, active: false, clips: [] },
      { id: 6, name: '', tag: 'A2', type: 'audio', audio: true, locked: false, muted: false, active: false, clips: [] },
    ],
    bin: [{ id: '3', name: 'interview.mp4', type: 'av', parentId: null, url: '/tmp/audit/work/project/interview.mp4', ready: true, inUse: false, duration: 900 }],
    markers: [],
    history: [],
    nextClip: 20,
    nextBin: 4,
  }
}

const clone = value => JSON.parse(JSON.stringify(value))
const err = (code, message, extra = {}) => ({ ok: false, error: { code, message, ...extra } })

function startFake(options = {}) {
  const token = options.token || ''
  const sessions = new Map()
  const calls = []
  const receipts = new Map()
  let project = newProject()
  const undo = [], redo = []
  const hits = { total: 0, byMethod: {} }

  const trackOf = ref => project.tracks.find(t => t.id === ref || t.tag === String(ref).toUpperCase() || String(t.id) === String(ref))

  function snapshot(include) {
    const defaults = ['tracks', 'clips', 'compositions', 'markers', 'bin', 'sequences']
    const sections = include && include.length ? include : defaults
    const out = {
      sessionId: project.sessionId, revision: project.revision, sequenceId: project.sequenceId, documentUrl: project.documentUrl,
      modified: project.modified, fps: project.fps, profile: project.profile, playhead: project.playhead, activeTrackId: project.activeTrackId,
      undo: { index: undo.length, canUndo: undo.length > 0, canRedo: redo.length > 0, undoText: undo.length ? undo.at(-1).text : '', redoText: redo.length ? redo.at(-1).text : '' },
      lastChange: null, sections,
      counts: { tracks: project.tracks.length, clips: project.tracks.reduce((n, t) => n + t.clips.length, 0), compositions: 0, markers: project.markers.length, subtitles: 0, bin: project.bin.length },
    }
    if (sections.some(s => ['tracks', 'clips', 'compositions', 'effects'].includes(s))) {
      out.tracks = project.tracks.map(t => ({ id: t.id, name: t.name, tag: t.tag, type: t.type, audio: t.audio, locked: t.locked, active: t.active, ...(sections.includes('clips') ? { clips: clone(t.clips), gaps: [] } : {}) }))
    }
    if (sections.includes('markers')) out.markers = clone(project.markers)
    if (sections.includes('bin')) { out.bin = clone(project.bin); out.folders = [] }
    if (sections.includes('sequences')) out.sequences = [{ id: project.sequenceId, binId: '2', name: 'Sequence 1', active: true, open: true }]
    return out
  }

  // ---- command semantics (enough to prove structure, not to emulate MLT) ----
  function applyCommand(draft, command, index) {
    const type = command.type
    const fail = (code, message) => err(code, message, { commandIndex: index })
    const bin = id => draft.bin.find(b => b.id === String(id))
    const clipById = id => { for (const t of draft.tracks) { const c = t.clips.find(x => x.id === Number(id)); if (c) return { c, t } } return null }
    const track = ref => draft.tracks.find(t => t.id === ref || t.tag === String(ref).toUpperCase())
    if (type === 'insert') {
      const b = bin(command.binId); if (!b) return fail('UNKNOWN_BIN', 'binId is not in the bin.')
      const t = track(command.trackId); if (!t) return fail('UNKNOWN_TRACK', 'No track has that tag; desktop_state lists tracks[].tag.')
      const pos = Number(command.position), dur = b.duration - Number(command.sourceIn || 0)
      if (!Number.isInteger(pos) || pos < 0) return fail('INVALID_ARGUMENTS', 'position must be a frame.')
      for (const c of t.clips) if (c.position < pos + dur && c.position + c.duration > pos) return fail('OVERLAP', `Insertion overlaps clip ${c.id} on track ${t.id}.`)
      t.clips.push({ id: draft.nextClip++, binId: b.id, name: b.name, type: b.type, position: pos, duration: dur, sourceIn: Number(command.sourceIn || 0), sourceOut: Number(command.sourceIn || 0) + dur, speed: 1, enabled: true, effectCount: 0 })
      t.clips.sort((a, c) => a.position - c.position); return { ok: true }
    }
    if (type === 'title_create') {
      const t = track(command.trackId || 'V2'); if (!t) return fail('UNKNOWN_TRACK', 'Track does not exist.')
      const id = String(draft.nextBin++); draft.bin.push({ id, name: command.name || 'Title', type: 'title', parentId: null, url: '', ready: true, inUse: true, duration: Number(command.duration || 90) })
      t.clips.push({ id: draft.nextClip++, binId: id, name: command.name || 'Title', type: 'title', position: Number(command.position || 0), duration: Number(command.duration || 90), sourceIn: 0, sourceOut: 90, speed: 1, enabled: true, effectCount: 0 }); return { ok: true }
    }
    if (['clip_fade', 'audio_duck', 'reframe', 'effect_add', 'effect_set', 'effect_remove', 'speed', 'enable', 'remove_clip', 'move', 'trim', 'split', 'audio_envelope', 'replace_clip', 'group', 'ungroup'].includes(type)) {
      const id = command.clipId ?? (Array.isArray(command.clipIds) ? command.clipIds[0] : undefined)
      const found = clipById(id); if (!found) return fail('UNKNOWN_CLIP', 'Timeline clip does not exist.')
      if (type === 'remove_clip') found.t.clips = found.t.clips.filter(x => x.id !== found.c.id); else found.c.effectCount += 1
      return { ok: true }
    }
    if (['range_cut', 'remove_range', 'remove_gap', 'insert_space', 'marker_add', 'marker_edit', 'marker_remove', 'marker_import', 'import', 'remove_asset', 'transcript_import', 'title_edit', 'rename_track'].includes(type)) return { ok: true }
    return fail('INVALID_ARGUMENTS', `Unknown command type ${type}.`)
  }

  function edit(name, args, body) {
    for (const key of EDIT) if (args[key] === undefined) return err('INVALID_ARGUMENTS', `${key} is required.`)
    if (args.sessionId !== project.sessionId) return err('SESSION_CHANGED', 'Read the current timeline before editing.')
    const payload = JSON.stringify([name, args.expectedRevision, args.commands ?? args.path ?? null])
    const seen = receipts.get(args.requestId)
    if (seen) return seen.payload === payload ? seen.result : err('REQUEST_REUSED', 'requestId was used with different arguments.')
    if (args.expectedRevision !== project.revision) return err('REVISION_CONFLICT', 'Project changed; read current state before editing.')
    const before = clone(project)
    const out = body()
    if (!out.ok) { project = before; return out }
    undo.push({ text: out.undoText || name, snapshot: before }); redo.length = 0
    project.revision += 1; project.modified = true
    project.history.push({ undoIndex: undo.length, text: out.undoText || name, state: 'applied', origin: 'mcp', command: name })
    delete out.undoText
    const result = { ok: true, ...out, state: snapshot() }
    receipts.set(args.requestId, { payload, result }); return result
  }

  function callTool(name, a) {
    switch (name) {
      case 'desktop_capabilities': return { ok: true, server: 'kdenlive-native', tools: NAMES.length }
      case 'desktop_state': return { ok: true, ...snapshot(a.include) }
      case 'desktop_history': return { ok: true, entries: clone(project.history).slice(-(a.limit || 50)), counts: { total: project.history.length }, logFile: '' }
      case 'desktop_media_import': return edit(name, a, () => { const id = String(project.nextBin++); project.bin.push({ id, name: path.basename(a.path), type: 'av', parentId: null, url: a.path, ready: true, inUse: false, duration: 450 }); return { ok: true, binId: id, undoText: 'Import clip' } })
      case 'desktop_batch_validate': {
        if (!Array.isArray(a.commands) || !a.commands.length || a.commands.length > 200) return err('INVALID_ARGUMENTS', 'Expected 1 to 200 commands.')
        const issues = []; const draft = clone(project)
        a.commands.forEach((c, i) => {
          if (!c || c.type !== 'insert' || (c.mode || 'normal') !== 'normal') { issues.push({ code: 'VALIDATION_UNSUPPORTED', message: 'Preflight currently supports only normal insert commands.', commandIndex: i }); return }
          const r = applyCommand(draft, c, i); if (!r.ok) issues.push({ ...r.error, commandIndex: i })
        })
        return { ok: true, valid: issues.length === 0, issues, sessionId: project.sessionId, revision: project.revision, supportedCommands: ['insert'] }
      }
      case 'desktop_batch': return edit(name, a, () => {
        if (!Array.isArray(a.commands) || !a.commands.length || a.commands.length > 200) return err('INVALID_ARGUMENTS', 'Expected 1 to 200 commands.')
        for (let i = 0; i < a.commands.length; i++) { const r = applyCommand(project, a.commands[i], i); if (!r.ok) return r }
        return { ok: true, applied: a.commands.length, undoText: `Batch (${a.commands.length} commands)` }
      })
      case 'desktop_undo': return edit(name, a, () => { const step = undo.pop(); if (!step) return err('NOTHING_TO_UNDO', 'Nothing to undo.'); redo.push({ text: step.text, snapshot: clone(project) }); const rev = project.revision, hist = project.history; project = step.snapshot; project.revision = rev; project.history = hist; return { ok: true, undoText: undefined } })
      case 'desktop_redo': return edit(name, a, () => { const step = redo.pop(); if (!step) return err('NOTHING_TO_REDO', 'Nothing to redo.'); undo.push({ text: step.text, snapshot: clone(project) }); const rev = project.revision, hist = project.history; project = step.snapshot; project.revision = rev; project.history = hist; return { ok: true } })
      case 'desktop_frame_capture': return { ok: true, position: a.position, width: a.width || 540, image: { data: PNG, mimeType: 'image/png' } }
      case 'desktop_project_save': return edit(name, a, () => ({ ok: true, saved: true, path: project.documentUrl }))
      case 'desktop_project_save_as': return err('NOT_IMPLEMENTED_IN_FAKE', 'fake')
      default: return err('NOT_IMPLEMENTED_IN_FAKE', `${name} is not simulated by this fake.`)
    }
  }

  const reply = (res, status, body, headers = {}) => { const text = body === undefined ? '' : JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(text) }
  const rpcError = (res, id, code, message, status = 200) => reply(res, status, { jsonrpc: '2.0', id: id ?? null, error: { code, message } })

  const server = http.createServer((req, res) => {
    hits.total += 1; hits.byMethod[req.method] = (hits.byMethod[req.method] || 0) + 1
    const host = String(req.headers.host || '').replace(/:\d+$/, '')
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return reply(res, 403, { error: 'Non-loopback Host.' })
    if (req.headers.origin) return reply(res, 403, { error: 'Origin header rejected.' })
    if (req.url.split('?')[0] !== '/mcp') return reply(res, 404, { error: 'Not found.' })
    if (req.method !== 'POST') return reply(res, 405, { error: 'POST only.' })
    if (token && req.headers.authorization !== `Bearer ${token}`) return reply(res, 401, { error: 'Unauthorized.' })
    let raw = ''; req.on('data', c => { raw += c })
    req.on('end', () => {
      let message; try { message = JSON.parse(raw) } catch { return rpcError(res, null, -32700, 'Parse error.', 400) }
      const notification = !('id' in message), id = message.id, params = message.params || {}, sid = req.headers['mcp-session-id'] || ''
      calls.push({ method: message.method, tool: params.name, args: params.arguments, session: sid })
      if (message.method === 'initialize') {
        if (sessions.size >= 32) return reply(res, 503, { error: 'Too many MCP sessions.' })
        const versions = ['2025-11-25', '2025-06-18', '2025-03-26'], asked = String(params.protocolVersion || '')
        const version = versions.includes(asked) ? asked : versions[0], allocated = crypto.randomUUID()
        sessions.set(allocated, { version, initialized: false })
        return reply(res, 200, { jsonrpc: '2.0', id, result: { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'kdenlive-native', version: '1.0.0' }, instructions: 'fake' } }, { 'mcp-session-id': allocated })
      }
      if (!sid) return rpcError(res, id, -32600, 'Mcp-Session-Id is required.', 400)
      const session = sessions.get(sid)
      if (!session) return reply(res, 404, { error: 'Session not found. Initialize again.' })
      if (notification) { if (message.method === 'notifications/initialized') session.initialized = true; res.writeHead(202); return res.end() }
      if (message.method === 'ping') return reply(res, 200, { jsonrpc: '2.0', id, result: {} })
      if (!session.initialized) return rpcError(res, id, -32000, 'Send notifications/initialized before using tools.')
      if (message.method === 'tools/list') return reply(res, 200, { jsonrpc: '2.0', id, result: { tools: toolDefs() } })
      if (message.method !== 'tools/call') return rpcError(res, id, -32601, 'Method not found.')
      if (!NAMES.includes(params.name) || (params.arguments !== undefined && (typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) return rpcError(res, id, -32602, 'Unknown tool or invalid arguments.')
      const result = callTool(params.name, params.arguments || {}), image = result.image
      const ok = result.ok === true; if (image) delete result.image
      const envelope = ok ? { ok: true, data: result } : result
      const content = [{ type: 'text', text: JSON.stringify(envelope) }]
      if (ok && image) content.push({ type: 'image', data: image.data, mimeType: image.mimeType })
      return reply(res, 200, { jsonrpc: '2.0', id, result: { isError: !ok, structuredContent: envelope, content } })
    })
  })

  return new Promise(resolve => server.listen(options.port || 0, '127.0.0.1', () => {
    const port = server.address().port
    resolve({
      url: `http://127.0.0.1:${port}/mcp`, port, calls, hits, sessions,
      project: () => project,
      /** Simulates the documented 30-minute idle expiry (or a Kdenlive restart): every MCP session vanishes. */
      expireSessions: () => sessions.clear(),
      userEdit: () => { project.revision += 1; project.modified = true },
      stop: () => new Promise(done => server.close(() => done())),
    })
  }))
}

module.exports = { startFake, NAMES }
