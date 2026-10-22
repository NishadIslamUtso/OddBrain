'use strict'
// Real adaptiveFramePoints(): when the scene detector finds few or no cuts (lecture, interview, talking head),
// are the retained "overview" frames spread over the whole video?
const path = require('node:path')
const { OUT } = require('./paths.cjs')
const { adaptiveFramePoints } = require(path.join(OUT, 'video-shared.cjs'))
const row = (label, d, scenes, n) => {
  const p = adaptiveFramePoints(d, scenes, n), last = p.at(-1).at, pct = Math.round(100 * last / d)
  console.log(`[${pct < 75 ? 'DEFECT' : 'PASS'}] F01 ${label.padEnd(50)} ${String(p.length).padStart(2)} frames, from ${p[0].at.toFixed(0)}s to ${last.toFixed(0)}s: last frame at ${pct}% of the video`)
}
row('75 s video, no scene cuts, budget 3', 75, [], 3)
row('10 min talk, no scene cuts, budget 12', 600, [], 12)
row('60 min lecture, no scene cuts, budget 12', 3600, [], 12)
row('60 min lecture, 2 cuts found, budget 12', 3600, [{ at: 900, score: 0.4 }, { at: 1800, score: 0.5 }], 12)
