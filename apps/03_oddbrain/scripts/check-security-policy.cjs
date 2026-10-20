#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')
const fail = message => { console.error(`security policy: ${message}`); process.exitCode = 1 }
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (['node_modules', 'out', 'dist', 'dist-web', 'coverage'].includes(entry.name)) return []
  const full = path.join(directory, entry.name)
  return entry.isDirectory() ? walk(full) : [full]
})

const manifest = JSON.parse(read('package.json'))
for (const group of ['dependencies', 'devDependencies', 'overrides']) for (const [name, version] of Object.entries(manifest[group] || {})) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(version))) fail(`${group} entry ${name} is not pinned to one exact version: ${version}`)
}
const source = walk(path.join(root, 'src')).filter(file => /\.(?:ts|tsx)$/.test(file))
const dangerous = source.filter(file => fs.readFileSync(file, 'utf8').includes('--dangerously-skip-permissions')).map(file => path.relative(root, file).replaceAll('\\', '/'))
if (JSON.stringify(dangerous) !== JSON.stringify(['src/main/engine/agy.ts'])) fail(`agy bypass flag escaped its one approved adapter: ${dangerous.join(', ') || 'missing'}`)
const unsafeRuntime = /--(?:no-sandbox|disable-web-security|ignore-certificate-errors|remote-debugging-port)|allowRunningInsecureContent\s*:\s*true|webSecurity\s*:\s*false|nodeIntegration\s*:\s*true|contextIsolation\s*:\s*false/
for (const file of source) if (unsafeRuntime.test(fs.readFileSync(file, 'utf8'))) fail(`unsafe Electron/browser runtime switch entered production source: ${path.relative(root, file)}`)
const bypass = source.filter(file => fs.readFileSync(file, 'utf8').includes('bypassPermissions')).map(file => path.relative(root, file).replaceAll('\\', '/'))
if (bypass.some(file => file !== 'src/shared/lib/engine.ts') || !bypass.length) fail(`Claude bypass permission mapping escaped its one approved mapping: ${bypass.join(', ') || 'missing'}`)
const agy = read('src/main/engine/agy.ts'), engine = read('src/shared/lib/engine.ts')
if (!/case 'full':[\s\S]{0,100}--dangerously-skip-permissions/.test(agy)) fail('agy bypass flag is not confined to the explicit Full-speed branch')
if (!/full:\s*'bypassPermissions'/.test(engine)) fail('Claude Full-speed mapping is missing or changed')
for (const area of ['src/main/commands', 'src/main/workflows']) {
  for (const file of walk(path.join(root, area))) {
    const text = fs.readFileSync(file, 'utf8')
    if (/dangerously-skip-permissions|bypassPermissions|from ['"][^'"]*(?:engine\/(?:socket|claudeCode|agy)|shared\/lib\/engine)['"]/.test(text)) fail(`native engine or Full-speed authority entered app-owned execution: ${path.relative(root, file)}`)
  }
}
if (!/sourcemap:\s*false/.test(read('vite.web.config.ts'))) fail('browser preview source maps must be disabled for release output')
if ((read('electron.vite.config.ts').match(/sourcemap:\s*false/g) || []).length !== 3) fail('main, preload and renderer source maps must all be disabled')
if (!/CREDENTIAL_ENV_KEY/.test(read('src/main/engine/claudeCode.ts'))) fail('native engine credential-environment filter is missing')
const main = read('src/main/index.ts')
if (!/nativeLaunchTrust = new Map/.test(main) || !/Trust folder & start Full speed/.test(main) || !/finalLaunchInventory\.digest !== launchInventory\.digest/.test(main) || !/nativeLaunchTrust\.set\(trustKey, \{ digest: launchInventory\.digest, fullSpeed: full \}\)/.test(main)) fail('per-app, per-folder native activation trust, digest-scoped Full-speed trust or its final configuration recheck is missing')
const fuses = read('scripts/apply-fuses.cjs')
if (!/OnlyLoadAppFromAsar\]: true/.test(fuses) || !/EnableEmbeddedAsarIntegrityValidation\]: context\.electronPlatformName === 'darwin'/.test(fuses)) fail('packaged apps must load only from ASAR and enable embedded ASAR integrity where Electron supports it')
if (!/npm run security:fuses/.test(fs.readFileSync(path.resolve(root, '..', '..', '.github', 'workflows', 'installer.yml'), 'utf8'))) fail('installer workflow does not verify the fuse state of the packaged executable')

for (const workflow of walk(path.resolve(root, '..', '..', '.github', 'workflows')).filter(file => /\.ya?ml$/.test(file))) {
  const text = fs.readFileSync(workflow, 'utf8')
  if (/npm ci(?![^\n]*--ignore-scripts)/.test(text)) fail(`npm ci permits implicit lifecycle scripts in ${path.basename(workflow)}`)
  for (const match of text.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
    const value = match[1]
    if (!/@[0-9a-f]{40}$/.test(value)) fail(`GitHub Action is not pinned to a full commit SHA: ${value} in ${path.basename(workflow)}`)
  }
}
if (!process.exitCode) console.log('security policy: exact dependencies, dangerous flags, app-owned execution separation, environment filtering, source maps, and immutable Actions passed')
