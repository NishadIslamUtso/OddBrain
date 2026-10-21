const path_ = require('node:path'); const { APP_ROOT, WORK } = require('./paths.cjs'); const REPO_ROOT = path_.resolve(APP_ROOT, '../..')
const fs = require('fs'), path = require('path'), cp = require('child_process')
process.chdir(APP_ROOT)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const files = cp.execSync(`git ls-files . ../../.github ../../scripts ../../extension | grep -v package-lock.json`, { cwd: process.cwd() }).toString().trim().split('\n')
  .filter(f => /\.(ts|tsx|js|cjs|mjs|json|yml|yaml|html|css|md)$/.test(f) && !/\.(png|svg)$/.test(f))
const text = files.map(f => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }).join('\n')
const scripts = JSON.stringify(pkg.scripts)
const rows = []
for (const kind of ['dependencies', 'devDependencies']) for (const name of Object.keys(pkg[kind] || {})) {
  const esc = name.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')
  const imported = new RegExp(`(from|require\\(|import\\()\\s*['"]${esc}(/[^'"]*)?['"]`).test(text) || new RegExp(`['"]${esc}['"]`).test(text.replace(/"(dependencies|devDependencies)"[\s\S]*?\}/g, ''))
  const bins = (() => { try { const p = JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, 'utf8')); return typeof p.bin === 'string' ? [p.name.split('/').pop()] : Object.keys(p.bin || {}) } catch { return [] } })()
  const viaScript = bins.some(b => new RegExp(`(^|[\\s"&|;])${b}(\\s|"|$)`).test(scripts + '\n' + text))
  const size = (() => { try { return Number(cp.execSync(`du -sk node_modules/${name} | cut -f1`).toString().trim()) } catch { return 0 } })()
  rows.push({ kind, name, version: pkg[kind][name], imported, viaScript, kb: size })
}
const unused = rows.filter(r => !r.imported && !r.viaScript)
console.log(`runtime deps: ${rows.filter(r => r.kind === 'dependencies').length}, dev deps: ${rows.filter(r => r.kind === 'devDependencies').length}`)
console.log('\nNo reference found in src, scripts, config or CI (candidates to remove):')
for (const r of unused) console.log(`  ${r.kind === 'devDependencies' ? 'dev' : 'run'}  ${r.name}@${r.version}  ${(r.kb / 1024).toFixed(1)} MB on disk`)
console.log(`\ntotal candidate size: ${(unused.reduce((n, r) => n + r.kb, 0) / 1024).toFixed(1)} MB (top-level only; their own sub-packages add more)`)
const pk = Object.keys(lock.packages).length - 1
console.log(`packages in lockfile today: ${pk}`)
fs.writeFileSync(path_.join(WORK, 'unused-deps.json'), JSON.stringify(unused.map(r => r.name)))

// The test tools: any real reference left outside package.json, the lockfile, docs and comments?
console.log('\nTest-only tools (vitest, jsdom, fake-indexeddb, playwright-core):')
for (const name of ['vitest', 'jsdom', 'fake-indexeddb', 'playwright-core']) {
  let hits = ''
  try { hits = cp.execSync(`git grep -n -I -w -F "${name}" -- . ../../.github ../../scripts ../../extension ':!package.json' ':!package-lock.json' ':!*.md' | grep -v -E ":[0-9]+:\\s*(#|//|\\*)" || true`, { shell: '/bin/bash' }).toString().trim() } catch {}
  console.log(`  ${name.padEnd(16)} ${pkg.devDependencies[name] ? 'installed ' + pkg.devDependencies[name] : 'not installed'}; real references left: ${hits ? hits.split('\n').length : 0}${hits ? '  e.g. ' + hits.split('\n')[0].slice(0, 90) : ''}`)
}
