const fs = require('fs'), path = require('path'), cp = require('child_process')
const { APP_ROOT, WORK } = require('./paths.cjs')
const root = APP_ROOT
const esbuild = require(path.join(root, 'node_modules/esbuild'))
const entries = [root + '/src/main/index.ts', root + '/src/main/media/worker.ts', root + '/src/preload/index.ts', root + '/src/renderer/src/main.tsx']
;(async () => {
  const used = new Set()
  for (const e of entries) {
    const r = await esbuild.build({ entryPoints: [e], bundle: true, write: false, metafile: true, platform: 'node', packages: 'external', logLevel: 'silent', loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.jpg': 'empty', '.mp3': 'empty', '.json': 'json' }, jsx: 'automatic', outdir: path.join(WORK, 'reach-out') }).catch(err => { console.log('ENTRY FAILED', path.basename(e), String(err.message).slice(0, 200)); return null })
    if (r) Object.keys(r.metafile.inputs).forEach(k => used.add(path.resolve(root, k)))
  }
  const all = cp.execSync(`git ls-files 'src/**/*.ts' 'src/**/*.tsx'`, { cwd: root }).toString().trim().split('\n').map(f => path.resolve(root, f)).filter(f => !f.endsWith('.d.ts'))
  const dead = all.filter(f => !used.has(f))
  const lines = f => fs.readFileSync(f, 'utf8').split('\n').length
  console.log(`source files tracked: ${all.length}; reachable from the 4 real entry points: ${all.length - dead.length}; NOT reachable: ${dead.length} (${dead.reduce((n, f) => n + lines(f), 0)} lines)`)
  for (const f of dead.sort()) console.log('  dead?', path.relative(root, f), lines(f))
})()
