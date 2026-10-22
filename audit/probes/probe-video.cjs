'use strict'
const { world, record, results, aiClient, fs, path } = require('./harness.cjs')
const { WORK, OUT } = require('./paths.cjs')
const shared = require(path.join(OUT, 'video-shared.cjs'))

const safe = async (id, title, fn) => { try { await fn() } catch (e) { record(id, title, 'DEFECT', `probe threw: ${e.stack?.split('\n').slice(0, 3).join(' | ') || e}`) } }
const json = (v) => JSON.stringify(v)

// ---------------------------------------------------------------------------------------------
// A. Native Kdenlive connection + the AI-facing review server + the reviewed plan flow
// ---------------------------------------------------------------------------------------------
async function groupA() {
  await safe('A01', 'connect to a native-protocol server and judge compatibility', async () => {
    const w = await world(); const view = await w.svc.testKdenlive()
    const ok = view.mcpConnected && view.nativeKdenlive.compatible && view.mcpTools.length === 60
    record('A01', 'Handshake, tool inventory and compatibility verdict against a spec-faithful native server', ok ? 'PASS' : 'DEFECT',
      `mcpConnected=${view.mcpConnected} compatible=${view.nativeKdenlive.compatible} tools=${view.mcpTools.length}\nnotice: ${view.notice || '(none)'}`)
    await w.fake.stop()
  })

  await safe('A02', 'AI tool list', async () => {
    const w = await world(); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const listed = await c.list(); const names = listed.body.result.tools.map(t => t.name)
    record('A02', 'Tools the AI actually receives from OddBrain', 'INFO', `${names.length} tools: ${names.join(', ')}\nserver instructions: ${c.init.body.result.instructions}`)
    await w.fake.stop()
  })

  let worldPlan
  await safe('A03', 'can the AI see the IDs it needs', async () => {
    const w = await world(); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const state = await c.call('oddbrain_kdenlive_state')
    // 2026-10-22 build: IDs come from oddbrain_kdenlive_timeline. Older build: only counts existed.
    const names = (await c.list()).body.result.tools.map(t => t.name)
    const timeline = names.includes('oddbrain_kdenlive_timeline') ? await c.call('oddbrain_kdenlive_timeline', { include: ['tracks', 'bin'] }) : null
    const view = timeline?.data?.snapshot || state.data.project, text = json(timeline?.data || state.data)
    const sees = { tracks: Array.isArray(view.tracks), bin: Array.isArray(view.bin), trackTagV1: /\bV1\b/.test(text), binId3: (view.bin || []).some(b => b.id === '3') }
    const fakeState = w.fake.project()
    const needed = `The project the fake holds has ${fakeState.tracks.length} tracks (${fakeState.tracks.map(t => t.tag).join(',')}) and bin item "${fakeState.bin[0].name}" with binId "${fakeState.bin[0].id}".`
    const visible = sees.tracks && sees.bin && sees.trackTagV1 && sees.binId3
    record('A03', 'can the AI read tracks / clips / bin IDs?', visible ? 'PASS' : 'DEFECT',
      `timeline tool present: ${!!timeline}\nAI can see -> ${json(sees)}\n${needed}`)
    const sources = await c.call('oddbrain_video_sources')
    record('A03b', 'any other AI tool revealing binId/trackId/clipId?', /binId|clipId|trackId/.test(json(sources.data)) ? 'PASS' : 'INFO', `oddbrain_video_sources keys: ${json(Object.keys(sources.data))} (no timeline ids expected there)`)
    await w.fake.stop()
  })

  await safe('A04', 'plan built from AI-visible info only vs. with real IDs', async () => {
    const w = await world(); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const s = (await c.call('oddbrain_kdenlive_state')).data.project
    const base = { title: 'B-roll over intro', purpose: 'Cover the first 3 seconds with B-roll', expectedProject: { documentUrl: s.documentUrl, sequenceId: s.sequenceId, revision: s.revision } }
    // What an AI limited to OddBrain's tools can do: guess an id.
    const guessed = { ...base, commands: [{ type: 'insert', binId: '1', trackId: 'V1', position: 0, sourceIn: 0, media: 'video' }] }
    let r = await c.call('oddbrain_edit_plan_propose', { plan: guessed }); const accepted = r.data?.acceptedForReview
    const review1 = await w.svc.prepareEditPlan(1)
    record('A04a', 'a plan with a GUESSED binId is refused before the owner sees it', review1.ok ? 'WARN' : 'PASS', `AI submission accepted for review: ${accepted}\npreflight: ok=${review1.ok} error="${review1.error || ''}"\nissues: ${json(review1.validation?.issues || [])}`)
    // Same plan with the id only desktop_state reveals:
    const real = { ...base, commands: [{ type: 'insert', binId: w.fake.project().bin[0].id, trackId: 'V1', position: 0, sourceIn: 0, media: 'video' }] }
    await c.call('oddbrain_edit_plan_propose', { plan: real }); const review2 = await w.svc.prepareEditPlan(1)
    const before = w.fake.project().revision
    const decided = review2.ok ? await w.svc.decideEditPlan(1, review2.token, 'allow') : { ok: false, answer: review2.error }
    const after = w.fake.project()
    const landed = after.tracks.find(t => t.tag === 'V1').clips.length === 1 && after.revision === before + 1
    const batchCall = w.fake.calls.filter(x => x.tool === 'desktop_batch').at(-1)
    record('A04b', 'same plan with the REAL binId: review -> approve -> apply', landed ? 'PASS' : 'DEFECT',
      `review.ok=${review2.ok} validation=${json(review2.validation)}\napply: ${decided.answer}\ncommand reached the editor as ONE desktop_batch with sessionId/expectedRevision/requestId = ${!!batchCall?.args?.sessionId}/${batchCall?.args?.expectedRevision}/${!!batchCall?.args?.requestId}; clips on V1 now: ${after.tracks.find(t => t.tag === 'V1').clips.length}; revision ${before} -> ${after.revision}`)
    worldPlan = { w, c }
    // Undo through the reviewed action flow
    const rev = await w.svc.prepareKdenliveAction(1, 'undo'); const done = rev.ok ? await w.svc.decideKdenliveAction(1, rev.token, 'allow') : rev
    const undone = w.fake.project().tracks.find(t => t.tag === 'V1').clips.length === 0
    record('A04c', 'reviewed Undo reverses the applied batch', undone ? 'PASS' : 'DEFECT', `${done.answer}; clips on V1 after undo: ${w.fake.project().tracks.find(t => t.tag === 'V1').clips.length}`)
    await w.fake.stop()
  })

  await safe('A05', 'mixed plan masks a real preflight error', async () => {
    const w = await world(); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const s = (await c.call('oddbrain_kdenlive_state')).data.project
    // put a clip in place first so a second insert overlaps
    const seed = { title: 'seed', purpose: 'seed', expectedProject: s, commands: [{ type: 'insert', binId: '3', trackId: 'V1', position: 0, sourceIn: 0, media: 'video' }] }
    await c.call('oddbrain_edit_plan_propose', { plan: { ...seed, expectedProject: { documentUrl: s.documentUrl, sequenceId: s.sequenceId, revision: s.revision } } })
    const r0 = await w.svc.prepareEditPlan(1); await w.svc.decideEditPlan(1, r0.token, 'allow')
    const s2 = (await c.call('oddbrain_kdenlive_state')).data.project
    const mixed = { title: 'overlap + title', purpose: 'mixed', expectedProject: { documentUrl: s2.documentUrl, sequenceId: s2.sequenceId, revision: s2.revision }, commands: [
      { type: 'insert', binId: '3', trackId: 'V1', position: 100, sourceIn: 0, media: 'video' }, // overlaps existing clip
      { type: 'title_create', name: 'Hook', position: 0, duration: 60, trackId: 'V2' },
    ] }
    await c.call('oddbrain_edit_plan_propose', { plan: mixed }); const review = await w.svc.prepareEditPlan(1)
    const before = JSON.stringify(w.fake.project().tracks)
    const applied = review.ok ? await w.svc.decideEditPlan(1, review.token, 'allow') : { ok: false, answer: review.error }
    const unchanged = JSON.stringify(w.fake.project().tracks) === before
    record('A05', 'real error (overlap) inside a plan that also has an unsupported-by-preflight command', review.ok && !applied.ok ? 'WARN' : (review.ok ? 'DEFECT' : 'PASS'),
      `preflight let it through to owner review: ${review.ok}; issues shown to owner: ${json(review.validation?.issues)}\napply result: ${applied.answer}\nproject unchanged after the failed apply (atomic rollback): ${unchanged}\nverdict note: the overlap IS listed to the owner and nothing is corrupted, but the hard stop is skipped.`)
    await w.fake.stop()
  })

  await safe('A06', 'owner edits while plan is under review', async () => {
    const w = await world(); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const s = (await c.call('oddbrain_kdenlive_state')).data.project
    await c.call('oddbrain_edit_plan_propose', { plan: { title: 't', purpose: 'p', expectedProject: { documentUrl: s.documentUrl, sequenceId: s.sequenceId, revision: s.revision }, commands: [{ type: 'insert', binId: '3', trackId: 'V1', position: 0, sourceIn: 0, media: 'video' }] } })
    const review = await w.svc.prepareEditPlan(1); w.fake.userEdit()
    const decided = await w.svc.decideEditPlan(1, review.token, 'allow'); const clips = w.fake.project().tracks.find(t => t.tag === 'V1').clips.length
    record('A06', 'a manual change between review and approval blocks the apply', !decided.ok && clips === 0 ? 'PASS' : 'DEFECT', `${decided.answer}\nclips applied: ${clips}`)
    await w.fake.stop()
  })

  await safe('A07', 'session expiry / reconnect', async () => {
    const w = await world(); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const okBefore = (await w.svc.workspace()).project !== null
    w.fake.expireSessions() // documented 30-min idle expiry, or Kdenlive restarted
    const ws = await w.svc.workspace()
    const aiState = await c.call('oddbrain_kdenlive_state')
    const candidate = { title: 't', purpose: 'p', expectedProject: { documentUrl: w.fake.project().documentUrl, sequenceId: w.fake.project().sequenceId, revision: w.fake.project().revision }, commands: [{ type: 'insert', binId: '3', trackId: 'V1', position: 0, sourceIn: 0, media: 'video' }] }
    const review = await w.svc.prepareEditPlan(1, candidate)
    const frame = await w.svc.captureKdenliveFrame(10)
    const recovered = await w.svc.testKdenlive(); const afterManual = (await w.svc.workspace()).project !== null
    const stuck = ws.project === null && aiState.error && !review.ok && !frame.ok
    record('A07', 'after the editor session expires, does OddBrain reconnect by itself?', stuck ? 'DEFECT' : 'PASS',
      `before expiry state readable: ${okBefore}\nafter expiry -> workspace.project=${ws.project}; notice="${ws.notice}"\nAI oddbrain_kdenlive_state -> "${aiState.error}"\nprepareEditPlan -> "${review.error}"; frame capture -> "${frame.error}"\nonly a manual "Test connection" recovers it: reconnect via testKdenlive -> state readable=${afterManual}\nHTTP calls the fake saw as 404 are the stale-session ones; OddBrain never re-sent initialize on its own.`)
    await w.fake.stop()
  })

  await safe('A08', 'save-version action', async () => {
    const w = await world(); await w.svc.testKdenlive()
    const r = await w.svc.prepareKdenliveAction(1, 'save-version')
    const exposes = (await w.svc.read()).mcpTools.filter(n => /save/.test(n))
    record('A08', '"Versions" (save-version) against a server that DOES have project-save tools', r.ok ? 'PASS' : 'DEFECT', `server exposes: ${exposes.join(', ')}\nOddBrain answer: ok=${r.ok} "${r.error || ''}"\nservice maps save-version -> desktop_project_checkpoint | project_checkpoint | checkpoint_save | save_version (none exist upstream)`)
    await w.fake.stop()
  })

  await safe('A09', 'frame capture', async () => {
    const w = await world(); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const direct = await w.svc.captureKdenliveFrame(30); const viaAi = await c.call('oddbrain_kdenlive_frame', { position: 30 })
    const img = viaAi.content?.find(x => x.type === 'image')
    record('A09', 'rendered frame reaches the owner UI and the AI as an image block', direct.ok && img && img.mimeType === 'image/png' ? 'PASS' : 'DEFECT', `direct ok=${direct.ok} mime=${direct.mime}; AI tool returned content types: ${viaAi.content?.map(x => x.type).join(', ')}`)
    const widthArg = w.fake.calls.find(x => x.tool === 'desktop_frame_capture')?.args
    record('A09b', 'arguments sent for frame capture', 'INFO', json(widthArg))
    await w.fake.stop()
  })

  await safe('A10', 'bearer token', async () => {
    const w = await world({ token: 's3cret' }); const noKey = await w.svc.testKdenlive()
    await w.svc.saveSecret('mcp', 's3cret'); const withKey = await w.svc.testKdenlive()
    record('A10', 'optional bearer token: refused without it, works with it', !noKey.mcpConnected && withKey.mcpConnected ? 'PASS' : 'DEFECT', `without token: connected=${noKey.mcpConnected} notice="${noKey.notice}"\nwith token: connected=${withKey.mcpConnected}`)
    await w.fake.stop()
  })

  await safe('A11', 'review-server session expiry returns the spec-required 404?', async () => {
    const w = await world(); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    w.advance(31 * 60_000) // 31 min idle
    const reply = await w.svc.aiMcp({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }, c.session)
    record('A11', 'OddBrain review MCP: request with an expired Mcp-Session-Id', reply.status === 404 ? 'PASS' : 'DEFECT',
      `HTTP status returned: ${reply.status} (MCP spec: server MUST answer 404 so the client re-initialises)\nbody: ${json(reply.body)}`)
    await w.fake.stop()
  })

  await safe('A12', 'ping', async () => {
    const w = await world(); const c = await aiClient(w.svc)
    const reply = await w.svc.aiMcp({ jsonrpc: '2.0', id: 5, method: 'ping' }, c.session)
    record('A12', 'MCP "ping" on the review server', reply.body?.result ? 'PASS' : 'DEFECT', `reply: ${json(reply.body)}`)
    await w.fake.stop()
  })

  await safe('A13', 'tool errors surfaced as JSON-RPC errors vs isError results', async () => {
    const w = await world(); const c = await aiClient(w.svc)
    const r = await c.call('oddbrain_video_evidence', { sourceId: 'nope' })
    record('A13', 'a failing AI tool call is reported as', r.error ? 'INFO' : 'PASS', `JSON-RPC error (not an isError tool result): ${r.error ? 'yes' : 'no'} -> "${r.error}"\n(MCP guidance: tool-execution failures belong in result.isError so the model can read and self-correct; many clients still surface JSON-RPC errors to the model.)`)
    await w.fake.stop()
  })


  await safe('A15', 'does the AI get the command grammar', async () => {
    const w = await world(); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const tools = (await c.list()).body.result.tools; const propose = tools.find(t => t.name === 'oddbrain_edit_plan_propose')
    const { KDENLIVE_EDITING_SKILL_BODY } = require(path.join(OUT, 'skill.cjs'))
    const types = ['insert','range_cut','title_create','audio_duck','clip_fade','reframe','effect_add','split','trim','move','remove_range','transcript_import']
    const mentioned = types.filter(t => new RegExp('\\b' + t + '\\b').test(KDENLIVE_EDITING_SKILL_BODY))
    const planSchema = propose.inputSchema.properties.plan
    record('A15', 'schema/grammar the AI is given for the 31 batch command types', Object.keys(planSchema).length <= 1 && mentioned.length < 8 ? 'DEFECT' : 'PASS',
      `oddbrain_edit_plan_propose.inputSchema.plan = ${json(planSchema)}\ncommand types named anywhere in the installed Skill text: ${mentioned.length ? mentioned.join(', ') : 'none'} (checked: ${types.join(', ')})\nupstream desktop_batch publishes commands.items.oneOf = one JSON Schema per command type; OddBrain does not forward it.`)
    await w.fake.stop()
  })

  await safe('A14', 'no-Kdenlive-executable gate', async () => {
    const w = await world(); await w.svc.update({ kdenlive: '' })
    const v = await w.svc.testKdenlive()
    record('A14', 'MCP connection attempt when only the endpoint is known (no local executable path)', v.mcpConnected ? 'PASS' : 'DEFECT', `connected=${v.mcpConnected}; notice="${v.notice}"\n(testKdenlive requires a runnable local executable and runs "<kdenlive> --version" before it even tries the endpoint)`)
    await w.fake.stop()
  })
}

// ---------------------------------------------------------------------------------------------
// B. Creative Library
// ---------------------------------------------------------------------------------------------
function mockFetch(log) {
  const json = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
  return async (input) => {
    const url = String(input); log.push(url)
    const u = new URL(url)
    if (u.hostname === 'api.openverse.org' && u.pathname.startsWith('/v1/images/')) return json({ results: Array.from({ length: 8 }, (_, i) => ({ id: `ov-img-${i}`, title: `OV image ${i}`, creator: `c${i}`, url: `https://cdn.example/ov${i}.jpg`, thumbnail: `https://cdn.example/ov${i}-t.jpg`, foreign_landing_url: `https://example.org/ov${i}`, license: i % 3 === 0 ? 'by-nc' : 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', width: 4000, height: 3000 })) })
    if (u.hostname === 'api.openverse.org' && u.pathname.startsWith('/v1/audio/')) return json({ results: [
      { id: 'a1', title: 'Calm piano (CC BY-NC)', creator: 'x', url: 'https://cdn.example/a1.mp3', thumbnail: 'https://cdn.example/a1.jpg', foreign_landing_url: 'https://example.org/a1', license: 'by-nc', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by-nc/4.0/', duration: 180000 },
      { id: 'a2', title: 'Beat (CC BY-ND)', creator: 'y', url: 'https://cdn.example/a2.mp3', thumbnail: 'https://cdn.example/a2.jpg', foreign_landing_url: 'https://example.org/a2', license: 'by-nd', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by-nd/4.0/', duration: 95000 },
      { id: 'a3', title: 'Ambient (CC0)', creator: 'z', url: 'https://cdn.example/a3.mp3', thumbnail: 'https://cdn.example/a3.jpg', foreign_landing_url: 'https://example.org/a3', license: 'cc0', license_version: '1.0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', duration: 30000 },
    ] })
    if (u.hostname === 'commons.wikimedia.org') return json({ query: { pages: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(100 + i), { pageid: 100 + i, title: `File:Wiki ${i}.jpg`, imageinfo: [{ url: `https://upload.example/w${i}.jpg`, thumburl: `https://upload.example/w${i}-t.jpg`, width: 3000, height: 2000, extmetadata: { Artist: { value: 'A' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' }, Credit: { value: 'C' } } }] }])) } })
    if (u.hostname === 'pixabay.com' && u.pathname === '/api/') return json({ hits: Array.from({ length: 8 }, (_, i) => ({ id: 900 + i, pageURL: `https://pixabay.com/photos/${900 + i}/`, user: `px${i}`, tags: 'city, night', largeImageURL: `https://cdn.pixabay.com/p${i}.jpg`, webformatURL: `https://cdn.pixabay.com/p${i}-w.jpg`, previewURL: `https://cdn.pixabay.com/p${i}-p.jpg`, imageWidth: 5000, imageHeight: 3000 })) })
    if (u.hostname === 'pixabay.com' && u.pathname === '/api/videos/') return json({ hits: Array.from({ length: 8 }, (_, i) => ({ id: 700 + i, pageURL: `https://pixabay.com/videos/${700 + i}/`, user: `pv${i}`, tags: 'city, timelapse', picture_id: `pic${i}`, duration: 14 + i, videos: { medium: { url: `https://cdn.pixabay.com/v${i}.mp4`, width: 1920, height: 1080 } } })) })
    return new Response('not mocked', { status: 404 })
  }
}

async function groupB() {
  await safe('B01', 'AI search provider starvation', async () => {
    const log = []; const w = await world({ fetchImpl: mockFetch(log), keys: { 'oddbrain-pixabay': 'k' } }); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const owner = await w.svc.search(1, 'city night', 'image')
    const byProvider = a => a.reduce((m, x) => (m[x.provider] = (m[x.provider] || 0) + 1, m), {})
    const viaUi = byProvider(owner.assets)
    const viaAi = await c.call('oddbrain_creative_search', { query: 'city night', kind: 'image', purpose: 'establishing shot' })
    const viaAi12 = await c.call('oddbrain_creative_search', { query: 'city night', kind: 'image', purpose: 'establishing shot', maxResults: 12 })
    const a8 = byProvider(viaAi.data.assets), a12 = byProvider(viaAi12.data.assets)
    record('B01', 'AI-facing creative search sees every provider?', a8.pixabay && a8.wikimedia ? 'PASS' : 'DEFECT',
      `owner UI search returns   : ${json(viaUi)} (24 results)\nAI default (maxResults 8): ${json(a8)}\nAI maxResults 12         : ${json(a12)}\nproviders are concatenated Openverse -> Wikimedia -> Pixabay and then cut, so the AI never sees the later providers.`)
    await w.fake.stop()
  })

  await safe('B02', 'licence handling: NC / ND', async () => {
    const log = []; const w = await world({ fetchImpl: mockFetch(log) }); const found = await w.svc.search(1, 'calm piano', 'audio')
    const rows = found.assets.map(a => `${a.title} | ${a.licence} | duration=${a.duration}`)
    const nc = found.assets.find(a => /BY-NC/.test(a.licence)), nd = found.assets.find(a => /BY-ND/.test(a.licence))
    const rNc = await w.svc.prepareAsset(1, nc.token), rNd = await w.svc.prepareAsset(1, nd.token)
    const url = log.find(u => u.includes('/v1/audio/'))
    record('B02', 'non-commercial / no-derivatives CC licences can be approved for download', rNc.ok || rNd.ok ? 'DEFECT' : 'PASS',
      `${rows.join('\n')}\nprepareAsset(BY-NC) ok=${rNc.ok}; prepareAsset(BY-ND) ok=${rNd.ok}\nrequest sent to Openverse: ${url}\n(Openverse supports license_type=commercial,modification; it is not sent.)`)
    const a1 = found.assets.find(a => /Calm piano/.test(a.title))
    record('B03', 'Openverse audio duration units', a1.duration === 180 ? 'PASS' : 'DEFECT', `Openverse returns duration in MILLISECONDS (its own model: duration_in_s = duration / 1e3). Mock returned 180000 ms for a 3-minute track; OddBrain reports duration=${a1.duration}. The AI is told to rank by duration.`)
    await w.fake.stop()
  })

  await safe('B04', 'no Pixabay key', async () => {
    const log = []; const w = await world({ fetchImpl: mockFetch(log) }); const r = await w.svc.search(1, 'city night', 'video')
    record('B04', 'video search with no Pixabay key (Openverse/Wikimedia have no video)', r.assets.length === 0 ? 'INFO' : 'PASS', `results=${r.assets.length}; ok=${r.ok}; problems=${json(r.problems)}\nnotice: ${r.notice}\n=> without a Pixabay key the library cannot return ANY video B-roll; no other video provider exists in the code.`)
    await w.fake.stop()
  })

  await safe('B05', 'kinds actually covered', async () => {
    const log = []; const w = await world({ fetchImpl: mockFetch(log), keys: { 'oddbrain-pixabay': 'k' } })
    const out = {}
    for (const kind of ['image', 'video', 'audio']) { const r = await w.svc.search(1, 'sunrise', kind); out[kind] = [...new Set(r.assets.map(a => a.provider))].join('+') || 'none' }
    record('B05', 'providers per kind (mocked responses, live keys assumed)', 'INFO', `${json(out)}\nnot covered at all: music packs with SFX categories, fonts, icons, transitions, title templates, caption styles, LUT/template catalogues`)
    await w.fake.stop()
  })
}

// ---------------------------------------------------------------------------------------------
// C. Link classification (pure function used by preflight)
// ---------------------------------------------------------------------------------------------
function groupC() {
  const urls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=abc', 'https://www.youtube.com/shorts/abc', 'https://music.youtube.com/watch?v=abc',
    'https://www.tiktok.com/@u/video/123', 'https://vm.tiktok.com/ZMabc/', 'https://www.instagram.com/reel/abc/', 'https://www.instagram.com/p/abc/',
    'https://www.facebook.com/watch/?v=123', 'https://fb.watch/abc/', 'https://x.com/user/status/123', 'https://twitter.com/user/status/123', 'https://www.reddit.com/r/videos/comments/abc/x/', 'https://v.redd.it/abc',
    'https://vimeo.com/123456', 'https://www.dailymotion.com/video/x7', 'https://www.twitch.tv/videos/123', 'https://rumble.com/v123-x.html', 'https://www.bilibili.com/video/BV1',
    'https://cdn.example.com/clip.mp4', 'https://cdn.example.com/clip.mp4?token=abc', 'https://cdn.example.com:8443/clip.mp4', 'https://cdn.example.com/stream.m3u8', 'http://cdn.example.com/clip.mp4',
    'https://user:pass@cdn.example.com/clip.mp4', 'https://127.0.0.1/clip.mp4', 'https://www.youtube.com/playlist?list=PL123', 'https://www.youtube.com/@channel',
  ]
  const rows = urls.map(u => { let r; try { r = shared.classifyVideoUrl(u) } catch (e) { r = { error: e.message } } return `${(r.provider || (r.ok === false ? 'REFUSED' : '?')).toString().padEnd(13)} ${u}${r.error ? '   <- ' + r.error : ''}` })
  record('C01', 'which public links the safe preflight accepts', 'INFO', rows.join('\n'))
}

;(async () => {
  console.log('=== GROUP A: Kdenlive protocol, AI tools, reviewed plan flow ===')
  await groupA()
  console.log('\n=== GROUP B: Creative Library ===')
  await groupB()
  console.log('\n=== GROUP C: link classification ===')
  groupC()
  const tally = results.reduce((m, r) => (m[r.verdict] = (m[r.verdict] || 0) + 1, m), {})
  console.log('\nTALLY', JSON.stringify(tally))
  fs.writeFileSync(path.join(WORK, 'probe-video-results.json'), JSON.stringify(results, null, 2))
  process.exit(0)
})()
