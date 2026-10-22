const path_ = require('node:path'); const { APP_ROOT, WORK } = require('./paths.cjs'); const REPO_ROOT = path_.resolve(APP_ROOT, '../..')
const path = require('path'), fs = require('fs')
const { world } = require('./harness.cjs')
;(async () => {
  const w = await world({ noFake: true })
  const words = ['the','video','shows','a','speaker','explaining','how','this','works','and','why','it','matters','for','everyone','in','the','room']
  const mk = (n, wordCount, scenes) => { let t = ''; for (let i = 0; i < wordCount; i++) t += words[(i * 7 + n) % words.length] + (i % 14 === 13 ? '.\n' : ' '); return t }
  const file = path.join(w.userData, 'video-evidence-v1.json')
  for (const [label, wordCount, sceneCount] of [['1 h talk, System.Speech-style text (about 9,000 words), 400 scene cuts', 9000, 400]]) {
    let n = 0, firstFailure = ''
    for (; n < 300; n++) {
      // Reader output as of 2026-10-22: one transcript section per minute, textComplete true. The 2026-10-21 reader gave one block.
      const clock = sec => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
      const sections = Math.ceil(3600 / 60), per = Math.round(wordCount / sections)
      const segments = Array.from({ length: sections }, (_, i) => ({ id: `transcript-${String(i + 1).padStart(4, '0')}`, label: `${clock(i * 60)}–${clock((i + 1) * 60)} · speaker unassigned`, text: mk(n + i, per) }))
      const text = `Video coverage: the complete 01:00:00 duration.\n\n` + segments.map(x => `[${x.label}]\n${x.text}`).join('\n\n')
      const result = { ok: true, name: `talk-${n}.mp4`, text, segments: process.env.AUDIT_OLD_READER ? undefined : segments, textComplete: true, source: { sha256: String(n).padStart(64, 'a') }, time: { read: 3600, total: 3600, unit: 'seconds' }, sceneMap: Array.from({ length: sceneCount }, (_, i) => ({ at: i * 9, score: 0.31234567 })), visualEvidence: [], images: [], disclosure: 'x' }
      try { await w.svc.recordLocalEvidence(1, `/tmp/talk-${n}.mp4`, result) } catch (e) { firstFailure = e.message; break }
    }
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0
    const textBytes = Buffer.byteLength(mk(0, wordCount))
    console.log(`${label}\n  one transcript is ${(textBytes / 1024).toFixed(0)} KB; the saved file holds ${n} videos at ${(size / 1024 / 1024).toFixed(2)} MB (about ${(size / Math.max(1, n) / 1024).toFixed(0)} KB per video, ${(size / Math.max(1, n) / textBytes).toFixed(1)}x the transcript itself)\n  save refused at video #${n + 1}: ${firstFailure || '(not reached within 300)'}`)
  }
  process.exit(0)
})()
