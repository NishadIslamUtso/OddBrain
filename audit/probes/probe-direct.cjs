'use strict'
const { world, record, results, aiClient, fs, path } = require('./harness.cjs')
const { WORK, OUT, MEDIA_WORK } = require('./paths.cjs')
const { createMediaService } = require(path.join(OUT, 'media-service.cjs'))
const { createVideoStudioService } = require(path.join(OUT, 'video-service.cjs'))
const { Readable } = require('node:stream')
const json = v => JSON.stringify(v)
const MEDIA = path.join(MEDIA_WORK, 'test75.mp4')

;(async () => {
  // ---- SSRF / private-address handling with the service's REAL default checker (no assertRemote override) ----
  {
    const root = fs.mkdtempSync(path.join(WORK, 's-')); fs.mkdirSync(path.join(root, 'p'))
    const keyStore = { encryption: 'os', has: () => false, persisted: () => false, get: () => '', set() {}, clear() {}, ids: () => [] }
    const attempts = []
    const svc = createVideoStudioService({ file: path.join(root, 'v.json'), keys: () => keyStore, fetchImpl: async (u) => { attempts.push(String(u)); return new Response('', { status: 200, headers: { 'content-type': 'video/mp4' } }) }, launch: () => {} })
    await svc.update({ projectFolder: path.join(root, 'p') })
    const targets = ['https://127.0.0.1/a.mp4', 'https://localhost/a.mp4', 'https://[::1]/a.mp4', 'https://192.168.1.5/a.mp4', 'https://10.0.0.8/a.mp4', 'https://169.254.169.254/latest/a.mp4', 'https://0.0.0.0/a.mp4', 'https://2130706433/a.mp4', 'https://[::ffff:127.0.0.1]/a.mp4', 'https://example.com@127.0.0.1/a.mp4']
    const rows = []
    for (const t of targets) { const r = await svc.preflightUrl(1, t); rows.push(`${r.ok ? 'ACCEPTED' : 'refused '} ${t}${r.error ? '  <- ' + r.error.slice(0, 90) : ''}`) }
    const reached = attempts.length
    record('S01', 'private / loopback / link-local direct links are refused before any request is made', reached === 0 && rows.every(r => r.startsWith('refused')) ? 'PASS' : 'DEFECT', `${rows.join('\n')}\nnetwork requests actually attempted: ${reached}`)
  }

  // ---- direct-media link end to end (mock CDN; real file bytes; real analysis) ----
  {
    const size = fs.statSync(MEDIA).size
    const cdn = async (input, init) => {
      const url = new URL(String(input)); if (url.hostname !== 'cdn.example.com') return new Response('no', { status: 404 })
      const headers = { 'content-type': 'video/mp4', 'content-length': String(size) }
      if ((init && init.method) === 'HEAD') return new Response(null, { status: 200, headers })
      return new Response(Readable.toWeb(fs.createReadStream(MEDIA)), { status: 200, headers })
    }
    const mroot = fs.mkdtempSync(path.join(WORK, 'm-direct-'))
    const media = createMediaService({ file: path.join(mroot, 'media.json'), sourceRoot: path.join(mroot, 'o'), access: () => ({ permissions: { local: true }, external: false, key: () => '', customBaseUrl: '' }), recognize: async () => 'stub' })
    const w = await world({ noFake: true, fetchImpl: cdn, analyzeVideo: async (o, p) => media.decodeFile(o, p, { name: path.basename(p), mime: 'video/mp4', size: fs.statSync(p).size, route: 'local', storage: 'in-place' }) })
    const pre = await w.svc.preflightUrl(1, 'https://cdn.example.com/media/clip.mp4?sig=abc')
    const t0 = Date.now(); const got = pre.ok ? await w.svc.acquireUrl(1, pre.token, 'allow', false) : { ok: false, answer: pre.error }
    const receipts = fs.existsSync(path.join(w.projectFolder, 'OddBrain Sources', 'source-receipts')) ? fs.readdirSync(path.join(w.projectFolder, 'OddBrain Sources', 'source-receipts')) : []
    record('D01', 'direct-media link: preflight -> approval -> streamed download -> hash receipt -> automatic reader', got.ok && got.evidence && receipts.length === 1 ? 'PASS' : 'DEFECT',
      `preflight: ok=${pre.ok} method=${pre.method} bytes=${pre.estimatedBytes}\nacquire: ok=${got.ok} (${((Date.now() - t0) / 1000).toFixed(1)}s)\nanswer: ${got.answer}\nfile: ${got.path ? path.relative(w.projectFolder, got.path) : '(none)'}\nreceipt files: ${receipts.length}; evidence: ${got.evidence ? json({ duration: got.evidence.duration, status: got.evidence.status }) : '(none)'}`)
    if (got.receipt) { const r = JSON.parse(fs.readFileSync(got.receipt, 'utf8')); record('D02', 'what the source receipt records', 'INFO', json({ keys: Object.keys(r), sourceUrl: r.sourceUrl, provider: r.provider, bytes: r.bytes, sha256: String(r.sha256).slice(0, 16) + '…' })) }
  }
  fs.writeFileSync(path.join(WORK, 'probe-direct-results.json'), JSON.stringify(results, null, 2)); process.exit(0)
})()
