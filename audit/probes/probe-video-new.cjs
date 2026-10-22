'use strict'
// Probes for the features added on 2026-10-22 (arena/81a07155-oddbrain, commits bc38e74, aa7a10a, 434233e):
//   K  mandatory editor bearer token       T  AI timeline readback (real IDs)   V  "Save version"
//   R  render, preview, verify, inspect, export, stop                          L  Creative Library ranking and providers
// They need the 2026-10-22 build; against the older build most of them report DEFECT because the feature is absent.
// The editor is the stand-in server (see fake-kdenlive.cjs), the reader is the real ffmpeg pipeline.
const { world, record, results, aiClient, fs, path } = require('./harness.cjs')
const { WORK, OUT, MEDIA_WORK } = require('./paths.cjs')
const { createMediaService } = require(path.join(OUT, 'media-service.cjs'))
const json = v => JSON.stringify(v)
const safe = async (id, title, fn) => { try { await fn() } catch (e) { record(id, title, 'DEFECT', `probe threw: ${e.stack?.split('\n').slice(0, 3).join(' | ') || e}`) } }
const toolCalls = w => w.fake.calls.filter(x => x.method === 'tools/call')

/** The real local reader, wired the way index.ts wires it (12-frame budget, optional OCR flag). */
function reader() {
  const root = fs.mkdtempSync(path.join(WORK, 'm-new-'))
  const media = createMediaService({ file: path.join(root, 'media.json'), sourceRoot: path.join(root, 'o'), access: () => ({ permissions: { local: true }, external: false, key: () => '', customBaseUrl: '' }), recognize: async () => 'placeholder transcript text' })
  return (owner, p, videoOcr = false) => media.decodeFile(owner, p, { name: path.basename(p), mime: 'video/mp4', size: fs.statSync(p).size, route: 'local', storage: 'in-place', videoOcr, videoFrameBudget: 12 })
}
const fresh = async (opts = {}) => { const w = await world({ renderSample: path.join(MEDIA_WORK, 'render-sample.mp4'), ...opts }); await w.svc.testKdenlive(); return { w, c: await aiClient(w.svc) } }

/** Put the interview on V1 using only what the AI can read through its own tools. */
async function placeClip(w, c) {
  const tl = await c.call('oddbrain_kdenlive_timeline', { include: ['tracks', 'bin'] })
  if (tl.error) return { ok: false, why: `timeline tool: ${tl.error}` }
  const bin = tl.data.snapshot.bin[0].id, track = tl.data.snapshot.tracks.find(t => t.tag === 'V1').tag
  const st = (await c.call('oddbrain_kdenlive_state')).data.project
  const plan = { title: 'Place interview', purpose: 'Put the interview on V1', expectedProject: { documentUrl: st.documentUrl, sequenceId: st.sequenceId, revision: st.revision }, commands: [{ type: 'insert', binId: bin, trackId: track, position: 0, sourceIn: 0, media: 'video' }] }
  await c.call('oddbrain_edit_plan_propose', { plan })
  const review = await w.svc.prepareEditPlan(1)
  const applied = review.ok ? await w.svc.decideEditPlan(1, review.token, 'allow') : { ok: false, answer: review.error }
  return { ok: applied.ok, why: applied.answer, review }
}

;(async () => {
  // ---------------------------------------------------------------- K: mandatory bearer token
  await safe('K01', 'editor endpoint without a token requirement', async () => {
    const w = await world({ noToken: true }); const v = await w.svc.testKdenlive(); const ws = await w.svc.workspace()
    const review = await w.svc.prepareEditPlan(1, { title: 't', purpose: 'p', expectedProject: { documentUrl: w.fake.project().documentUrl, sequenceId: w.fake.project().sequenceId, revision: w.fake.project().revision }, commands: [{ type: 'insert', binId: '3', trackId: 'V1', position: 0, sourceIn: 0, media: 'video' }] })
    const calls = toolCalls(w).length
    record('K01', 'editor with NO token requirement: is it refused, with zero native tool calls?', !v.nativeKdenlive.compatible && !ws.project && !review.ok && calls === 0 ? 'PASS' : 'DEFECT',
      `compatible=${v.nativeKdenlive.compatible}; state readable=${!!ws.project}; plan review ok=${review.ok}; native tools/call requests received=${calls}\nreason shown to the owner: ${v.nativeKdenlive.reason}`)
    await w.fake.stop()
  })
  await safe('K02', 'token required by the editor but not saved in OddBrain', async () => {
    const w = await world({ token: 'srv-secret' }); const v = await w.svc.testKdenlive(); const calls = toolCalls(w).length
    record('K02', 'editor requires a token that OddBrain does not have', !v.mcpConnected && calls === 0 ? 'PASS' : 'DEFECT', `connected=${v.mcpConnected}; tools/call requests=${calls}\nnotice: ${v.notice}`)
    await w.fake.stop()
  })

  // ---------------------------------------------------------------- T: AI timeline readback
  await safe('T01', 'AI timeline tool', async () => {
    const { w, c } = await fresh(); const names = (await c.list()).body.result.tools.map(t => t.name)
    const tl = await c.call('oddbrain_kdenlive_timeline', { include: ['tracks', 'bin'] })
    const text = json(tl.data || tl.error), session = w.fake.project().sessionId, binPath = 'project/interview.mp4'
    const tags = (tl.data?.snapshot?.tracks || []).map(t => t.tag), binIds = (tl.data?.snapshot?.bin || []).map(b => b.id)
    const tooMany = await c.call('oddbrain_kdenlive_timeline', { include: ['tracks', 'clips', 'compositions', 'markers', 'subtitles', 'bin', 'sequences'] })
    record('T01', 'AI can read track tags, bin IDs; secrets and file paths removed; section count bounded', tags.includes('V1') && binIds.includes('3') && !text.includes(session) && !text.includes(binPath) && !!tooMany.error ? 'PASS' : 'DEFECT',
      `tool present: ${names.includes('oddbrain_kdenlive_timeline')}\ntrack tags: ${tags.join(',')}; bin ids: ${binIds.join(',')}\neditor session id leaked: ${text.includes(session)}; bin file path leaked: ${text.includes(binPath)}\n7 sections requested -> ${tooMany.error ? 'refused: ' + tooMany.error : 'allowed'}`)
    await w.fake.stop()
  })
  await safe('T02', 'plan built from AI-readable IDs, end to end', async () => {
    const { w, c } = await fresh(); const first = await placeClip(w, c)
    const tl = await c.call('oddbrain_kdenlive_timeline', { include: ['tracks', 'clips'] })
    const clip = tl.data?.snapshot?.tracks?.flatMap(t => t.clips || [])?.[0]
    let second = { ok: false, answer: 'no clip id was readable' }
    if (clip) {
      const st = (await c.call('oddbrain_kdenlive_state')).data.project
      await c.call('oddbrain_edit_plan_propose', { plan: { title: 'Fade in', purpose: 'Fade the clip in', expectedProject: { documentUrl: st.documentUrl, sequenceId: st.sequenceId, revision: st.revision }, commands: [{ type: 'clip_fade', clipId: clip.id, fadeIn: 15 }] } })
      const review = await w.svc.prepareEditPlan(1); second = review.ok ? await w.svc.decideEditPlan(1, review.token, 'allow') : { ok: false, answer: review.error }
    }
    const effect = w.fake.project().tracks.flatMap(t => t.clips).find(x => x.id === clip?.id)?.effectCount
    record('T02', 'insert with a read bin ID, then clip_fade with a read clip ID, both reviewed and applied', first.ok && second.ok && effect === 1 ? 'PASS' : 'DEFECT', `insert: ${first.ok ? 'applied' : first.why}\nclip_fade on clip ${clip?.id}: ${second.ok ? 'applied (effects on clip: ' + effect + ')' : second.answer}`)
    await w.fake.stop()
  })
  await safe('T03', 'plan with unresolved library needs', async () => {
    const { w, c } = await fresh(); const st = (await c.call('oddbrain_kdenlive_state')).data.project
    await c.call('oddbrain_edit_plan_propose', { plan: { title: 'B-roll', purpose: 'needs footage', expectedProject: { documentUrl: st.documentUrl, sequenceId: st.sequenceId, revision: st.revision }, assetNeeds: [{ kind: 'video', query: 'city night', purpose: 'cutaway', placement: '0-3 s' }], commands: [{ type: 'insert', binId: '3', trackId: 'V1', position: 0, sourceIn: 0, media: 'video' }] } })
    const review = await w.svc.prepareEditPlan(1)
    record('T03', 'a plan that still has asset needs is not offered for approval', !review.ok && /asset need/.test(review.error || '') ? 'PASS' : 'DEFECT', `ok=${review.ok}; ${review.error || ''}`)
    await w.fake.stop()
  })
  await safe('T04', 'command grammar given to the AI', async () => {
    const { w, c } = await fresh(); const tools = (await c.list()).body.result.tools; const plan = tools.find(t => t.name === 'oddbrain_edit_plan_propose').inputSchema.properties.plan
    const { KDENLIVE_EDITING_SKILL_BODY: skill } = require(path.join(OUT, 'skill.cjs'))
    const types = ['insert', 'range_cut', 'title_create', 'audio_duck', 'clip_fade', 'reframe', 'effect_add', 'split', 'trim', 'move', 'remove_range', 'transcript_import']
    const named = types.filter(t => new RegExp('\\b' + t + '\\b').test(skill)), described = Object.keys(plan).length > 1
    const phantom = ['oddbrain_evidence_inventory', 'oddbrain_evidence_search', 'oddbrain_evidence_expand'].filter(n => skill.includes(n) && !tools.some(t => t.name === n))
    record('T04a', 'does the AI learn the exact fields of insert, clip_fade, audio_duck, range_cut…?', described || named.length >= 8 ? 'PASS' : 'DEFECT', `plan schema: ${json(plan)}\ncommand types named in the Skill: ${named.join(', ') || 'none'} (of ${types.length} checked)`)
    record('T04b', 'every tool the Skill tells the AI to call exists', phantom.length ? 'DEFECT' : 'PASS', phantom.length ? `the Skill names tools that the review server does not offer: ${phantom.join(', ')}\ntools it does offer: ${tools.map(t => t.name).join(', ')}` : 'all named tools exist')
    await w.fake.stop()
  })

  // ---------------------------------------------------------------- V: save version
  await safe('V01', 'save a version', async () => {
    const { w } = await fresh(); const before = w.fake.project().documentUrl, revBefore = w.fake.project().revision
    const review = await w.svc.prepareKdenliveAction(1, 'save-version')
    const done = review.ok ? await w.svc.decideKdenliveAction(1, review.token, 'allow') : { ok: false, answer: review.error }
    const dir = path.join(w.projectFolder, 'OddBrain Versions'), files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
    const after = w.fake.project()
    record('V01', 'reviewed "Save version" writes one new file and the editor continues on that copy', done.ok && files.length === 1 && after.documentUrl !== before && after.revision > revBefore ? 'PASS' : 'DEFECT',
      `review says: ${review.summary || review.error}\nresult: ${done.answer}\nfiles in OddBrain Versions: ${files.join(', ') || 'none'}\nopen document changed: ${after.documentUrl !== before}; revision ${revBefore} -> ${after.revision}`)
    await w.fake.stop()
  })

  // ---------------------------------------------------------------- R: render lifecycle
  await safe('R01', 'preview -> status -> verify -> inspect -> export -> stop', async () => {
    const { w, c } = await fresh({ analyzeVideo: reader() }); const placed = await placeClip(w, c)
    if (!placed.ok) { record('R01', 'render lifecycle', 'DEFECT', `could not set up a clip first: ${placed.why}`); return }
    const log = []
    // 1) owner-approved preview, frames 0-60
    const pr = await w.svc.prepareKdenliveRender(1, 'preview', 0, 60); log.push(`preview review ok=${pr.ok} ${pr.error || ''} -> ${pr.destination ? path.relative(w.projectFolder, pr.destination) : ''}`)
    const started = pr.ok ? await w.svc.decideKdenliveRender(1, pr.token, 'allow') : { ok: false, answer: pr.error }; log.push(`start: ${started.answer}`)
    const args = w.fake.calls.find(x => x.tool === 'desktop_preview_render')?.args
    log.push(`desktop_preview_render args: ${json({ ...args, sessionId: args ? '(present)' : undefined, requestId: args ? '(present)' : undefined, path: args?.path ? path.relative(w.projectFolder, args.path) : undefined })}`)
    // 2) status until finished + natively verified
    let status
    for (let i = 0; i < 5; i++) { status = await w.svc.kdenliveRenderStatus(); if (status.jobs.some(j => j.verification?.verified)) break }
    const job = status.jobs[0]; log.push(`status after polling: ${job?.status}, verified=${job?.verification?.verified}, hasAudio=${job?.verification?.hasAudio}`)
    // 3) the AI sees only path-free metadata until the owner approves inspection
    const ai1 = await c.call('oddbrain_kdenlive_review_output'); const leaks = pr.destination && json(ai1.data).includes(path.basename(pr.destination))
    log.push(`AI review_output before inspection: job=${ai1.data?.job ? 'present' : 'none'}, file name leaked=${!!leaks}, evidence=${ai1.data?.evidence ? 'yes' : 'no'}`)
    // 4) owner approves inspection -> real reader runs on the rendered file
    const ins = await w.svc.prepareKdenlivePreviewInspection(1, pr.destination); const inspected = ins.ok ? await w.svc.decideKdenlivePreviewInspection(1, ins.token, 'allow') : { ok: false, answer: ins.error }
    log.push(`inspect preview: ${inspected.ok ? 'ready' : 'blocked'} (${inspected.answer.slice(0, 150)})`)
    const sources = (await c.call('oddbrain_video_sources')).data?.sources || []; log.push(`evidence maps the AI can list: ${sources.length} (${sources.map(s => s.name).join(' | ')})`)
    // 5) full export, vertical short
    const ex = await w.svc.prepareKdenliveRender(1, 'export', undefined, undefined, 'vertical-short'); const exStarted = ex.ok ? await w.svc.decideKdenliveRender(1, ex.token, 'allow') : { ok: false, answer: ex.error }
    log.push(`vertical-short export review ok=${ex.ok} ${ex.error || ''}; start: ${exStarted.answer.slice(0, 120)}`)
    for (let i = 0; i < 5; i++) { status = await w.svc.kdenliveRenderStatus(); if (status.jobs.filter(j => j.verification?.verified).length === 2) break }
    log.push(`jobs now: ${status.jobs.map(j => `${j.mode}:${j.status}:verified=${j.verification?.verified}`).join(', ')}`)
    // 6) a new export, then Stop while it runs
    const ex2 = await w.svc.prepareKdenliveRender(1, 'export', undefined, undefined, 'current-sequence'); const ex2s = ex2.ok ? await w.svc.decideKdenliveRender(1, ex2.token, 'allow') : { ok: false, answer: ex2.error }
    const stopped = await w.svc.stop(1); const cancelCall = w.fake.calls.find(x => x.tool === 'desktop_render_cancel')
    log.push(`second export started=${ex2s.ok}; Stop -> ${stopped.answer.slice(0, 150)}; desktop_render_cancel sent=${!!cancelCall}`)
    const ok = started.ok && job?.verification?.verified && inspected.ok && sources.length >= 1 && ex.ok && exStarted.ok && !!cancelCall && !leaks
    record('R01', 'owner-approved preview, native status and verification, inspection into an evidence map, vertical export, Stop', ok ? 'PASS' : 'DEFECT', log.join('\n'))
    await w.fake.stop()
  })
  await safe('R02', 'vertical-short export refuses a landscape sequence', async () => {
    const { w, c } = await fresh(); await placeClip(w, c)
    w.fake.project().profile.width = 1920; w.fake.project().profile.height = 1080
    const ex = await w.svc.prepareKdenliveRender(1, 'export', undefined, undefined, 'vertical-short')
    record('R02', 'vertical-short export of a 1920x1080 sequence is refused before anything starts', !ex.ok && /not portrait/.test(ex.error || '') && toolCalls(w).every(x => !['desktop_render', 'desktop_preview_render'].includes(x.tool)) ? 'PASS' : 'DEFECT', `ok=${ex.ok}; ${ex.error || ''}`)
    await w.fake.stop()
  })
  await safe('R03', 'edit between render review and approval', async () => {
    const { w, c } = await fresh(); await placeClip(w, c)
    const pr = await w.svc.prepareKdenliveRender(1, 'preview', 0, 60); w.fake.userEdit()
    const started = await w.svc.decideKdenliveRender(1, pr.token, 'allow')
    record('R03', 'a manual change after the render review blocks the render', !started.ok && !w.fake.calls.some(x => x.tool === 'desktop_preview_render') ? 'PASS' : 'DEFECT', started.answer)
    await w.fake.stop()
  })
  await safe('R04', 'revision after a render', async () => {
    const { w, c } = await fresh(); await placeClip(w, c)
    const st1 = (await c.call('oddbrain_kdenlive_state')).data.project
    const pr = await w.svc.prepareKdenliveRender(1, 'preview', 0, 60); await w.svc.decideKdenliveRender(1, pr.token, 'allow')
    const st2 = (await c.call('oddbrain_kdenlive_state')).data.project
    // A real engine bumps the revision on render. A plan written before the render must now be refused, not silently applied.
    await c.call('oddbrain_edit_plan_propose', { plan: { title: 'stale', purpose: 'p', expectedProject: { documentUrl: st1.documentUrl, sequenceId: st1.sequenceId, revision: st1.revision }, commands: [{ type: 'insert', binId: '3', trackId: 'V2', position: 0, sourceIn: 0, media: 'video' }] } })
    const review = await w.svc.prepareEditPlan(1)
    record('R04', 'plan written before a render is refused afterwards (revision moved)', st2.revision > st1.revision && !review.ok ? 'PASS' : 'DEFECT', `revision ${st1.revision} -> ${st2.revision}; stale plan review ok=${review.ok} ${review.error || ''}`)
    await w.fake.stop()
  })

  await safe('R05', 'editor folder is not OddBrain project folder', async () => {
    // The real server only allows imports and outputs inside the open project's folder or one configured "additional media folder".
    const editorFolder = path.join(WORK, 'somewhere-else-' + process.pid)
    const { w, c } = await fresh({ editorFolder }); await placeClip(w, c)
    const pr = await w.svc.prepareKdenliveRender(1, 'preview', 0, 60), started = pr.ok ? await w.svc.decideKdenliveRender(1, pr.token, 'allow') : { ok: false, answer: pr.error }
    const vr = await w.svc.prepareKdenliveAction(1, 'save-version'), saved = vr.ok ? await w.svc.decideKdenliveAction(1, vr.token, 'allow') : { ok: false, answer: vr.error }
    const setupHint = /additional media folder|same folder|project folder/i.test(started.answer + saved.answer)
    record('R05', 'when Kdenlive only allows another folder (real server wording), is the failure explained to the owner?', !started.ok && setupHint ? 'PASS' : 'DEFECT',
      `render: ${started.answer}\nsave version: ${saved.answer}\nthe message names the setting to change (additional media folder): ${setupHint}\nbut README, RULES and the Settings page never tell the owner to set it up in advance`)
    await w.fake.stop()
  })

  // ---------------------------------------------------------------- L: Creative Library
  const mockLibrary = (log) => {
    const reply = obj => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
    return async (input) => {
      const url = String(input); log.push(url); const u = new URL(url)
      const word = 'city night'
      if (u.hostname === 'api.openverse.org' && u.pathname.startsWith('/v1/images/')) return reply({ results: Array.from({ length: 12 }, (_, i) => ({ id: `ov${i}`, title: `${word} view ${i}`, creator: `c${i}`, url: `https://cdn.example/ov${i}.jpg`, thumbnail: `https://cdn.example/ov${i}-t.jpg`, foreign_landing_url: `https://example.org/ov${i}`, license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', width: 4000, height: 3000 })) })
      if (u.hostname === 'api.openverse.org' && u.pathname.startsWith('/v1/audio/')) return reply({ results: [
        { id: 'a1', title: 'Calm piano (CC BY-NC)', creator: 'x', url: 'https://cdn.example/a1.mp3', thumbnail: 'https://cdn.example/a1.jpg', foreign_landing_url: 'https://example.org/a1', license: 'by-nc', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by-nc/4.0/', duration: 180000 },
        { id: 'a2', title: 'Beat (CC BY-ND)', creator: 'y', url: 'https://cdn.example/a2.mp3', thumbnail: 'https://cdn.example/a2.jpg', foreign_landing_url: 'https://example.org/a2', license: 'by-nd', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by-nd/4.0/', duration: 95000 }] })
      if (u.hostname === 'commons.wikimedia.org') {
        const q = u.searchParams.get('gsrsearch') || '', kind = /filetype:video/.test(q) ? 'video' : /filetype:audio/.test(q) ? 'audio' : 'image'
        const mime = kind === 'video' ? 'video/webm' : kind === 'audio' ? 'audio/ogg' : 'image/jpeg', mediatype = kind === 'video' ? 'VIDEO' : kind === 'audio' ? 'AUDIO' : 'BITMAP'
        return reply({ query: { pages: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(100 + i), { pageid: 100 + i, title: `File:${word} ${kind} ${i}.${kind === 'image' ? 'jpg' : kind === 'video' ? 'webm' : 'ogg'}`, imageinfo: [{ url: `https://upload.example/w${i}`, thumburl: kind === 'audio' ? '' : `https://upload.example/w${i}-t.jpg`, width: 1920, height: 1080, duration: kind === 'image' ? undefined : 12.5, mime, mediatype, extmetadata: { Artist: { value: 'A' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' }, Credit: { value: 'C' } } }] }])) } })
      }
      if (u.hostname === 'pixabay.com' && u.pathname === '/api/') return reply({ hits: Array.from({ length: 12 }, (_, i) => ({ id: 900 + i, pageURL: `https://pixabay.com/photos/${900 + i}/`, user: `px${i}`, tags: word, largeImageURL: `https://cdn.pixabay.com/p${i}.jpg`, webformatURL: `https://cdn.pixabay.com/p${i}-w.jpg`, previewURL: `https://cdn.pixabay.com/p${i}-p.jpg`, imageWidth: 5000, imageHeight: 3000 })) })
      if (u.hostname === 'pixabay.com' && u.pathname === '/api/videos/') return reply({ hits: Array.from({ length: 12 }, (_, i) => ({ id: 700 + i, pageURL: `https://pixabay.com/videos/${700 + i}/`, user: `pv${i}`, tags: word, picture_id: `pic${i}`, duration: 14 + i, videos: { medium: { url: `https://cdn.pixabay.com/v${i}.mp4`, width: 1080, height: 1920 } } })) })
      return new Response('not mocked', { status: 404 })
    }
  }
  await safe('L01', 'AI search when every provider fits the query equally', async () => {
    const log = []; const w = await world({ fetchImpl: mockLibrary(log), keys: { 'oddbrain-pixabay': 'k', 'oddbrain-kdenlive-mcp': 'audit-token' } }); await w.svc.testKdenlive(); const c = await aiClient(w.svc)
    const by = a => a.reduce((m, x) => (m[x.provider] = (m[x.provider] || 0) + 1, m), {})
    const ui = await w.svc.search(1, 'city night', 'image'), ai = await c.call('oddbrain_creative_search', { query: 'city night', kind: 'image', purpose: 'establishing shot' })
    const mix = by(ai.data.assets)
    record('L01', 'AI default top 8 contains more than one provider when all fit equally', Object.keys(mix).length > 1 ? 'PASS' : 'WARN', `owner search (${ui.assets.length} results): ${json(by(ui.assets))}\nAI default (maxResults 8): ${json(mix)}\nranking = title fit + provenance score; ties keep the fixed order Openverse, Wikimedia, Pixabay`)
    await w.fake.stop()
  })
  await safe('L02', 'non-commercial / no-derivatives licences', async () => {
    const log = []; const w = await world({ fetchImpl: mockLibrary(log), keys: { 'oddbrain-kdenlive-mcp': 'audit-token' } }); const found = await w.svc.search(1, 'calm piano', 'audio')
    const nc = found.assets.find(a => /BY-NC/.test(a.licence)), nd = found.assets.find(a => /BY-ND/.test(a.licence))
    const rNc = nc ? await w.svc.prepareAsset(1, nc.token) : { ok: false }, rNd = nd ? await w.svc.prepareAsset(1, nd.token) : { ok: false }
    record('L02', 'CC BY-NC and CC BY-ND results cannot be approved for a video you may publish or sell', rNc.ok || rNd.ok ? 'DEFECT' : 'PASS', `prepareAsset(BY-NC) ok=${rNc.ok}; prepareAsset(BY-ND) ok=${rNd.ok}\nOpenverse request: ${log.find(u => u.includes('/v1/audio/'))}`)
    const a = found.assets.find(x => /Calm piano/.test(x.title))
    record('L03', 'Openverse audio duration is shown in seconds', a?.duration === 180 ? 'PASS' : 'DEFECT', `Openverse sent 180000 (milliseconds); OddBrain shows duration=${a?.duration}`)
    await w.fake.stop()
  })
  await safe('L04', 'Wikimedia video and audio without any key', async () => {
    const log = []; const w = await world({ fetchImpl: mockLibrary(log), keys: { 'oddbrain-kdenlive-mcp': 'audit-token' } })
    const video = await w.svc.search(1, 'city night', 'video'), audio = await w.svc.search(1, 'city night', 'audio')
    const v = video.assets.filter(a => a.provider === 'wikimedia'), au = audio.assets.filter(a => a.provider === 'wikimedia')
    const req = log.find(u => u.includes('commons.wikimedia.org') && /filetype%3Avideo/.test(u))
    record('L04', 'no-key video and audio come from Wikimedia Commons', v.length > 0 && au.length > 0 && v[0].duration === 12.5 ? 'PASS' : 'DEFECT', `video results without a Pixabay key: ${v.length} (first: ${v[0]?.title}, ${v[0]?.duration}s, ${v[0]?.mediaType}); audio from Wikimedia: ${au.length}\nrequest shape: ${req ? decodeURIComponent(req).replace(/&/g, ' & ').slice(0, 230) : '(none)'}`)
    await w.fake.stop()
  })

  fs.writeFileSync(path.join(WORK, 'probe-video-new-results.json'), JSON.stringify(results, null, 2))
  const tally = results.reduce((m, r) => (m[r.verdict] = (m[r.verdict] || 0) + 1, m), {}); console.log('\nTALLY', JSON.stringify(tally))
  process.exit(0)
})()
