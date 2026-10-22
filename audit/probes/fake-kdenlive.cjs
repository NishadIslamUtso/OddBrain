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
 * Corrected 2026-10-22 against src/mcp/mcpserver.cpp and src/livebridge*.cpp:
 *  - the bearer check comes BEFORE the method check (an unauthenticated GET is 401 only when a token is required, else 405)
 *  - Host must equal 127.0.0.1:<port> or localhost:<port>; DELETE ends a session (204, or 404); POST needs application/json
 *  - EVERY successful edit (save_as, render, preview_render included) advances the revision and embeds `state`
 *  - save_as/render/preview_render add no Undo entry; save_as keeps the session and switches documentUrl
 *  - render lifecycle, desktop_render_status and desktop_render_verify follow livebridge.cpp / livebridgeproduction.cpp
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
  desktop_render: [...EDIT, 'path'],
  desktop_render_verify: ['path'],
  desktop_project_save_as: [...EDIT, 'path'],
}
// 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function toolDefs() {
  return NAMES.map(name => ({ name, description: `fake ${name}`, inputSchema: { type: 'object', properties: {}, required: REQUIRED[name] || [], additionalProperties: false } }))
}

function newProject(folder) {
  return {
    sessionId: 'kd-session-' + crypto.randomUUID().slice(0, 8),
    revision: 12,
    sequenceId: 'a1b2c3d4-0000-4000-8000-000000000001',
    documentUrl: folder ? require('node:url').pathToFileURL(path.join(folder, 'reel.kdenlive')).href : 'file:///tmp/audit/work/project/reel.kdenlive',
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
  const projectFolder = options.projectFolder ? fs.realpathSync(options.projectFolder) : ''
  let project = newProject(projectFolder)
  if (projectFolder) fs.writeFileSync(path.join(projectFolder, 'reel.kdenlive'), '<mlt/>')
  const renders = new Map()
  const undo = [], redo = []
  const hits = { total: 0, byMethod: {} }

  const trackOf = ref => project.tracks.find(t => t.id === ref || t.tag === String(ref).toUpperCase() || String(t.id) === String(ref))

  function snapshot(include) {
    const defaults = ['tracks', 'clips', 'compositions', 'markers', 'bin', 'sequences']
    const sections = include && include.length ? include : defaults
    const out = {
      sessionId: project.sessionId, revision: project.revision, sequenceId: project.sequenceId, documentUrl: project.documentUrl,
      modified: project.modified, fps: project.fps, profile: { ...project.profile, duration: projectDuration() }, playhead: project.playhead, activeTrackId: project.activeTrackId,
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

  function edit(name, args, body, opts = {}) {
    for (const key of EDIT) if (args[key] === undefined) return err('INVALID_ARGUMENTS', `${key} is required.`)
    if (args.sessionId !== project.sessionId) return err('SESSION_CHANGED', 'Read the current timeline before editing.')
    const payload = JSON.stringify([name, args.expectedRevision, args.commands ?? args.path ?? null, args.range ?? null, args.start ?? null, args.end ?? null, args.preset ?? null])
    const seen = receipts.get(args.requestId)
    if (seen) return seen.payload === payload ? seen.result : err('REQUEST_REUSED', 'requestId was used with different arguments.')
    if (args.expectedRevision !== project.revision) return err('REVISION_CONFLICT', 'Project changed; read current state before editing.')
    const before = clone(project)
    const out = body()
    if (!out.ok) { project = before; return out }
    // Real engine: every successful edit advances the revision, even a no-op (livebridge.cpp, contentChanged()).
    if (opts.undo !== false) { undo.push({ text: out.undoText || name, snapshot: before }); redo.length = 0 }
    project.revision += 1; project.modified = opts.modified === undefined ? true : opts.modified
    if (opts.undo !== false) project.history.push({ undoIndex: undo.length, text: out.undoText || name, state: 'applied', origin: 'mcp', command: name })
    delete out.undoText
    const result = { ok: true, ...out, state: snapshot() }
    receipts.set(args.requestId, { payload, result }); return result
  }

  const projectDuration = () => project.tracks.reduce((m, t) => t.clips.reduce((n, c) => Math.max(n, c.position + c.duration), m), 0)
  const insideProject = target => { if (!projectFolder) return true; try { const dir = fs.realpathSync(path.dirname(target)); return dir === projectFolder || dir.startsWith(projectFolder + path.sep) } catch { return false } }
  const wav = () => { const n = 1600, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); return b.toString('base64') }
  const writeOutput = job => { try { if (options.renderSample && fs.existsSync(options.renderSample)) fs.copyFileSync(options.renderSample, job.path); else fs.writeFileSync(job.path, Buffer.alloc(2048, 1)) } catch {} }
  function startJob(a, preview) {
    if (typeof a.path !== 'string' || !path.isAbsolute(a.path)) return err('INVALID_PATH', 'path must be an absolute path.')
    if (!insideProject(a.path)) return err('PATH_NOT_ALLOWED', 'Output is outside the project folder and the additional media folder configured in MCP API settings.')
    if (fs.existsSync(a.path) || renders.has(a.path)) return err('FILE_EXISTS', 'Choose a new output file.')
    const dur = projectDuration(); if (dur < 2) return err('EMPTY_TIMELINE', 'Nothing to render.')
    let start = 0, end = dur
    if (preview) {
      start = a.start; end = a.end
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > dur) return err('INVALID_COMMAND', 'start/end must be whole frames inside the sequence.')
      if (end - start > 10 * 30) return err('INVALID_COMMAND', 'A preview is limited to 10 seconds.')
    } else if (a.range) {
      start = a.range.start; end = a.range.end
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > dur) return err('INVALID_COMMAND', 'range needs whole frames 0 <= start < end <= the sequence duration.')
    }
    const width = preview ? (a.width || 640) : project.profile.width, height = preview ? Math.round(width * project.profile.height / project.profile.width / 2) * 2 : project.profile.height
    const job = { path: a.path, preset: a.preset || 'MP4-H264/AAC', status: 'starting', progress: 0, frame: 0, started: Date.now(), preview, expectedFrames: end - start, range: { start, end }, width, height, fps: 30 }
    renders.set(a.path, job)
    return { ok: true, outputs: [a.path], preset: job.preset, preview, range: { start, end }, expectedFrames: job.expectedFrames, trackingPersisted: true }
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
      case 'desktop_project_save': return edit(name, a, () => ({ ok: true, saved: true, path: project.documentUrl }), { undo: false, modified: false })
      case 'desktop_project_save_as': return edit(name, a, () => {
        const target = a.path
        if (typeof target !== 'string' || !path.isAbsolute(target) || path.extname(target) !== '.kdenlive' || fs.existsSync(target)) return err('INVALID_PATH', 'save_as needs a new absolute .kdenlive path in a writable folder.')
        if (!insideProject(target)) return err('PATH_NOT_ALLOWED', 'Output is outside the project folder and the additional media folder configured in MCP API settings.')
        fs.writeFileSync(target, '<mlt/>'); project.documentUrl = require('node:url').pathToFileURL(fs.realpathSync(target)).href
        return { ok: true, documentUrl: project.documentUrl }
      }, { undo: false, modified: false })
      case 'desktop_render': return edit(name, a, () => startJob(a, false), { undo: false })
      case 'desktop_preview_render': return edit(name, a, () => startJob(a, true), { undo: false })
      case 'desktop_render_status': {
        const jobs = []
        for (const j of renders.values()) {
          if (j.status === 'starting') { j.status = 'running'; j.progress = 40; j.frame = Math.round(j.expectedFrames * 0.4) }
          else if (j.status === 'running') { j.status = 'finished'; j.progress = 100; j.frame = j.expectedFrames; writeOutput(j) }
          const o = { path: j.path, preset: j.preset, status: j.status, progress: j.progress, frame: j.frame, elapsedSeconds: Math.round((Date.now() - j.started) / 1000), preview: j.preview, expectedFrames: j.expectedFrames, range: j.range, startedAt: new Date(j.started).toISOString() }
          if (j.status === 'finished') o.bytes = fs.existsSync(j.path) ? fs.statSync(j.path).size : 0
          jobs.push(o)
        }
        return { ok: true, jobs }
      }
      case 'desktop_render_verify': {
        const job = renders.get(a.path)
        if (!job) return err('UNKNOWN_JOB', 'Only exports started through MCP can be verified.')
        if (job.status === 'starting' || job.status === 'running') return err('RENDER_BUSY', 'Wait for the renderer to finish.')
        if (job.status === 'aborted' || job.status === 'failed') return err('VERIFICATION_FAILED', `The render ${job.status}.`)
        const duration = job.expectedFrames / job.fps
        const out = { ok: true, path: a.path, verified: true, durationSeconds: duration, expectedFrames: job.expectedFrames, width: job.width, height: job.height, fps: job.fps, hasAudio: true, fullDecode: true }
        if (a.includeAudio === true) { if (!job.preview || duration > 10.1) return err('INVALID_ARGUMENTS', 'includeAudio is limited to short MCP preview renders.'); out.audio = { data: wav(), mimeType: 'audio/wav' } }
        out.resource = { uri: require('node:url').pathToFileURL(a.path).href, name: path.basename(a.path), mimeType: job.preview ? 'video/mp4' : 'application/octet-stream' }
        job.status = 'finished'; job.progress = 100
        return out
      }
      case 'desktop_render_cancel': {
        const job = renders.get(a.path)
        if (!job) return err('UNKNOWN_JOB', 'No such render.')
        if (job.status === 'starting' || job.status === 'running') { job.status = 'aborted'; try { fs.rmSync(job.path, { force: true }) } catch {} }
        return { ok: true, path: a.path, status: job.status }
      }
      case 'desktop_transcript': return err('NO_TRANSCRIPT', 'No word-level transcript is stored for this clip.')
      default: return err('NOT_IMPLEMENTED_IN_FAKE', `${name} is not simulated by this fake.`)
    }
  }

  const reply = (res, status, body, headers = {}) => { const text = body === undefined ? '' : JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(text) }
  const rpcError = (res, id, code, message, status = 200) => reply(res, status, { jsonrpc: '2.0', id: id ?? null, error: { code, message } })

  const server = http.createServer((req, res) => {
    hits.total += 1; hits.byMethod[req.method] = (hits.byMethod[req.method] || 0) + 1
    const hostHeader = String(req.headers.host || '').toLowerCase(), listening = server.address().port
    const localHost = hostHeader === `127.0.0.1:${listening}` || hostHeader === `localhost:${listening}`
    if (req.url.split('?')[0] !== '/mcp') return reply(res, 404, { error: 'Not found.' })
    if (req.headers.origin || !localHost) return reply(res, 403, { error: 'Only direct MCP clients are allowed.' })
    // Real order (mcpserver.cpp): token first, then method. So a tokenless GET is 401 in token mode and 405 otherwise.
    if (token && req.headers.authorization !== `Bearer ${token}`) return reply(res, 401, { error: 'A valid MCP bearer token is required.' }, { 'www-authenticate': 'Bearer realm="Kdenlive"' })
    if (req.method !== 'POST' && req.method !== 'DELETE') return reply(res, 405, { error: 'Use POST for MCP messages or DELETE to end a session.' }, { allow: 'POST, DELETE' })
    if (req.method === 'DELETE') {
      const sid = req.headers['mcp-session-id'] || ''
      if (!sid) return reply(res, 400, { error: 'Mcp-Session-Id is required.' })
      if (!sessions.delete(sid)) return reply(res, 404, { error: 'Session not found.' })
      res.writeHead(204); return res.end()
    }
    if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') return rpcError(res, null, -32600, 'Content-Type must be application/json.', 415)
    const accept = String(req.headers.accept || '').toLowerCase()
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) return rpcError(res, null, -32600, 'Accept must include application/json and text/event-stream.', 406)
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
      const result = callTool(params.name, params.arguments || {}), image = result.image, audio = result.audio, resource = result.resource
      const ok = result.ok === true; delete result.image; delete result.audio; delete result.resource
      const envelope = ok ? { ok: true, data: result } : result
      const content = [{ type: 'text', text: JSON.stringify(envelope) }]
      if (ok && image) content.push({ type: 'image', data: image.data, mimeType: image.mimeType })
      if (ok && audio) content.push({ type: 'audio', data: audio.data, mimeType: audio.mimeType })
      if (ok && resource && resource.uri) content.push({ type: 'resource_link', ...resource })
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
