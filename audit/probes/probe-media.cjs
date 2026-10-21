'use strict'
const { world, record, results, aiClient, fs, path } = require('./harness.cjs')
const { WORK, OUT, MEDIA_BIN, MEDIA_WORK, YTDLP, DASH_PORT } = require('./paths.cjs')
const { createMediaService } = require(path.join(OUT, 'media-service.cjs'))
const { runMediaCommand } = require(path.join(OUT, 'process.cjs'))
const { execFileSync } = require('node:child_process')

const MEDIA = path.join(MEDIA_WORK, 'test75.mp4')
const DASH_URL = `http://127.0.0.1:${DASH_PORT}/manifest.mpd`
const YT = YTDLP
if (!YT) { console.error('Set AUDIT_YTDLP to an absolute yt-dlp path (see audit/README.md).'); process.exit(2) }
const fakeYouTube = 'https://www.youtube.com/watch?v=PROBE1234567'
const json = v => JSON.stringify(v)
const FFPROBE = path.join(MEDIA_BIN, 'ffprobe')

const SHIM = process.env.SHIM_FIXED_PIPE === '1'
const shimRun = (cmd, args, signal, timeout, limit) => runMediaCommand(cmd, SHIM ? args.map(a => typeof a === 'string' ? a.replace('file=pipe\\:1', 'file=-') : a) : args, signal, timeout, limit)
function mediaStack(tag) {
  const root = fs.mkdtempSync(path.join(WORK, `m-${tag}-`))
  const recog = []
  const media = createMediaService({
    runCommand: shimRun,
    file: path.join(root, 'media.json'), sourceRoot: path.join(root, 'originals'),
    access: () => ({ permissions: { local: true }, external: false, key: () => '', customBaseUrl: '' }),
    // Windows System.Speech cannot run on Linux; the stub records WHAT the pipeline asks the recognizer to do.
    recognize: async (language, signal, wav) => { const seconds = wav ? (fs.statSync(wav).size - 44) / 32000 : 0; recog.push({ language, seconds: Math.round(seconds * 10) / 10 }); return 'placeholder transcript text for the audit' },
  })
  return { media, recog, root }
}
const analyze = (media) => async (owner, p) => media.decodeFile(owner, p, { name: path.basename(p), mime: 'video/mp4', size: fs.statSync(p).size, route: 'local', storage: 'in-place' })

;(async () => {
  // ---- M01: the reader on a real 75 s, 5-scene video ------------------------------------------------
  {
    const { media, recog } = mediaStack('m01'); const t0 = Date.now()
    let r, err
    try { r = await analyze(media)(1, MEDIA) } catch (e) { err = e }
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    if (err) record('M01', 'media reader on a real synthetic video', 'DEFECT', `threw: ${err.message}`)
    else {
      const frames = (r.images || []).map(i => i.name)
      const scene = r.sceneMap
      // Healthy = the three measurement passes actually returned data for a video with 4 hard cuts, 5 silences, steady tones.
      const healthy = (r.sceneMap || []).length >= 3 && /Measured RMS level/.test(r.text) && /Pause evidence below/.test(r.text)
      record(SHIM ? 'M01-fixed' : 'M01', `media reader on a real 75 s video, 5 scenes (real ffmpeg/ffprobe, stubbed speech)${SHIM ? '  [WITH file=- shim, i.e. what the 3-line fix would give]' : '  [code exactly as shipped]'}`, healthy ? 'PASS' : 'DEFECT',
        `wall time ${secs}s; result keys: ${Object.keys(r).join(', ')}\nframes returned: ${frames.length} -> ${frames.join(', ')}\nvisualEvidence: ${json((r.visualEvidence || []).map(v => ({ at: v.at, reason: v.reason, score: +Number(v.score).toFixed(2) })))}\nsceneMap(${(scene||[]).length} cuts): ${String(json(scene)).slice(0, 500)}\nrecognizer calls (what speech-to-text was asked to do): ${json(recog)}\ntext (first 900 chars):\n${String(r.text).slice(0, 900)}`)
      globalThis.M01 = r
    }
  }

  // ---- M02: full journey: preflight -> approve -> yt-dlp acquire -> read -> AI tools ----------------------
  for (const scenario of ['ffmpeg-on-PATH', 'NO-ffmpeg-on-PATH']) {
    const http = require('node:child_process').spawn('python3', ['-m', 'http.server', String(DASH_PORT), '--bind', '127.0.0.1', '--directory', path.join(MEDIA_WORK, 'dash')], { stdio: 'ignore' })
    await new Promise(r => setTimeout(r, 1200))
    const savedPath = process.env.PATH
    process.env.PATH = scenario === 'ffmpeg-on-PATH' ? `${MEDIA_BIN}${path.delimiter}${savedPath}` : '/usr/bin:/bin'
    try {
      const { media, recog } = mediaStack('m02')
      const runCommand = (cmd, args, signal, timeout, limit) => runMediaCommand(cmd, args.map(a => a === fakeYouTube ? DASH_URL : a), signal, timeout, limit)
      const w = await world({ noFake: false, ytDlp: YT, runCommand, analyzeVideo: analyze(media), expandVideoEvidence: (p, m, ocr, s) => media.extractEvidence(p, m, ocr, s), keys: {} })
      const pre = await w.svc.preflightUrl(1, fakeYouTube)
      const t0 = Date.now()
      const got = pre.ok ? await w.svc.acquireUrl(1, pre.token, 'allow', false) : { ok: false, answer: pre.error }
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      record(`M02-${scenario}`, `link -> approve -> yt-dlp -> automatic reader  [${scenario}]`, got.ok && got.evidence ? 'PASS' : 'DEFECT',
        `preflight ok=${pre.ok} title="${pre.title}" method=${pre.method}\nacquire ok=${got.ok} in ${secs}s\nanswer: ${got.answer}\nfile: ${got.path || '(none)'}\nreceipt: ${got.receipt ? path.basename(got.receipt) : '(none)'}\nevidence: ${got.evidence ? json({ id: got.evidence.id, duration: got.evidence.duration, status: got.evidence.status || got.evidence.state }) : '(none)'}`)
      if (got.ok && got.evidence) {
        const c = await aiClient(w.svc)
        const sources = await c.call('oddbrain_video_sources')
        const id = sources.data.sources[0].id
        const listing = await c.call('oddbrain_video_evidence', { sourceId: id })
        record('M03', 'what the AI sees for a freshly read video (list view)', 'INFO', `source summary keys: ${Object.keys(sources.data.sources[0]).join(', ')}\nlisting keys: ${Object.keys(listing.data).join(', ')}\nsections: ${json(listing.data.sections)}\nscenes (${listing.data.scenes?.length}): ${json(listing.data.scenes?.slice(0, 6))}\nmoments (${listing.data.moments?.length}): ${json(listing.data.moments?.map(m => ({ at: m.at, reason: m.reason, description: m.description || null })))}\nany per-scene visual description anywhere in the evidence: ${/"description"\s*:\s*"[^"]+"/.test(json(listing.data.scenes)) ? 'yes' : 'NO'}`)
        const full = await c.call('oddbrain_video_evidence', { sourceId: id, sectionIds: listing.data.sections.map(s => s.id) })
        record('M04', 'transcript section text the AI would read', 'INFO', `${json(full.data.sections).slice(0, 700)}`)
        // AI asks for extra frames+audio at 3 timestamps
        const exp = await c.call('oddbrain_video_evidence_expand', { sourceId: id, moments: [5, 20, 33.3], question: 'What is on screen when the tone changes?' })
        const types = exp.content?.map(x => x.type) || []
        let audioInfo = ''
        const audio = exp.content?.find(x => x.type === 'audio')
        if (audio) { const tmp = path.join(WORK, 'exp.wav'); fs.writeFileSync(tmp, Buffer.from(audio.data, 'base64')); audioInfo = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]).toString().trim() + 's' }
        record('M05', 'AI-requested extra frames/audio at chosen timestamps', exp.data && types.filter(t => t === 'image').length === 3 ? 'PASS' : 'DEFECT', `${exp.error ? 'ERROR ' + exp.error : ''}\ncontent blocks returned: ${types.join(',')}; first audio window length: ${audioInfo || 'n/a'}\nanswer: ${exp.data?.answer}`)
        const note = await c.call('oddbrain_video_evidence_note', { sourceId: id, question: 'q', observations: [{ at: 5, description: 'A colour test pattern with a clock.' }] })
        record('M06', 'AI stores a visual description note (unconfirmed)', note.data?.saved === 1 ? 'PASS' : 'DEFECT', json(note.data || note.error))
        const stored = JSON.parse(fs.readFileSync(path.join(w.userData, 'video-evidence-v1.json'), 'utf8'))
        record('M07', 'durable evidence file on disk', 'INFO', `${path.join(w.userData, 'video-evidence-v1.json')} -> ${fs.statSync(path.join(w.userData, 'video-evidence-v1.json')).size} bytes; entries=${(stored.items || stored.sources || Object.values(stored)[0] || []).length}`)
      }
      await w.fake.stop()
    } catch (e) { record(`M02-${scenario}`, 'journey threw', 'DEFECT', e.stack.split('\n').slice(0, 4).join(' | ')) }
    finally { process.env.PATH = savedPath; http.kill() ; await new Promise(r => setTimeout(r, 300)) }
  }

  fs.writeFileSync(path.join(WORK, SHIM ? 'probe-media-results-fixed.json' : 'probe-media-results.json'), JSON.stringify(results, null, 2))
  process.exit(0)
})()
