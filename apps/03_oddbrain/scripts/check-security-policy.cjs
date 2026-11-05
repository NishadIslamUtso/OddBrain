#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')
const ast = file => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
const descendants = (node, result = []) => { result.push(node); ts.forEachChild(node, child => { descendants(child, result) }); return result }
const stringValues = file => descendants(ast(file)).filter(ts.isStringLiteralLike).map(node => node.text)
const propertyName = node => node.name && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) ? node.name.text : ''
const propertyValues = file => descendants(ast(file)).filter(ts.isPropertyAssignment).map(node => ({ name: propertyName(node), value: node.initializer.kind === ts.SyntaxKind.FalseKeyword ? false : node.initializer.kind === ts.SyntaxKind.TrueKeyword ? true : ts.isStringLiteralLike(node.initializer) ? node.initializer.text : undefined }))
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
if (!manifest.devDependencies?.['@electron/asar']) fail('@electron/asar must be a pinned direct development dependency because release inspection invokes it directly')
const source = walk(path.join(root, 'src')).filter(file => /\.(?:ts|tsx)$/.test(file))
const dangerous = source.filter(file => stringValues(file).includes('--dangerously-skip-permissions')).map(file => path.relative(root, file).replaceAll('\\', '/'))
if (JSON.stringify(dangerous) !== JSON.stringify(['src/main/engine/agy.ts'])) fail(`agy bypass flag escaped its one approved adapter: ${dangerous.join(', ') || 'missing'}`)
const unsafeSwitch = /^--(?:no-sandbox|disable-web-security|ignore-certificate-errors|remote-debugging-port)(?:=|$)/
const unsafeProperties = new Map([['allowRunningInsecureContent', true], ['webSecurity', false], ['nodeIntegration', true], ['contextIsolation', false]])
for (const file of source) {
  const unsafeLiteral = stringValues(file).some(value => unsafeSwitch.test(value))
  const unsafeProperty = propertyValues(file).some(entry => unsafeProperties.has(entry.name) && unsafeProperties.get(entry.name) === entry.value)
  if (unsafeLiteral || unsafeProperty) fail(`unsafe Electron/browser runtime capability entered production source: ${path.relative(root, file)}`)
}
const bypass = source.filter(file => stringValues(file).includes('bypassPermissions')).map(file => path.relative(root, file).replaceAll('\\', '/'))
if (bypass.some(file => file !== 'src/shared/lib/engine.ts') || !bypass.length) fail(`Claude bypass permission mapping escaped its one approved mapping: ${bypass.join(', ') || 'missing'}`)
const agyFile = path.join(root, 'src/main/engine/agy.ts'), engineFile = path.join(root, 'src/shared/lib/engine.ts')
const fullCaseOwnsBypass = descendants(ast(agyFile)).filter(ts.isCaseClause).some(clause => ts.isStringLiteralLike(clause.expression) && clause.expression.text === 'full' && descendants(clause, []).filter(ts.isStringLiteralLike).some(node => node.text === '--dangerously-skip-permissions'))
if (!fullCaseOwnsBypass) fail('agy bypass flag is not confined to the explicit Full-speed branch')
if (!propertyValues(engineFile).some(entry => entry.name === 'full' && entry.value === 'bypassPermissions')) fail('Claude Full-speed mapping is missing or changed')
for (const area of ['src/main/commands', 'src/main/workflows']) {
  for (const file of walk(path.join(root, area)).filter(value => /\.(?:ts|tsx)$/.test(value))) {
    const tree = ast(file), literals = descendants(tree).filter(ts.isStringLiteralLike).map(node => node.text)
    const importsEngineAuthority = descendants(tree).filter(ts.isImportDeclaration).some(node => /(?:engine\/(?:socket|claudeCode|agy)|shared\/lib\/engine)$/.test(node.moduleSpecifier.text))
    if (literals.some(value => value === '--dangerously-skip-permissions' || value === 'bypassPermissions') || importsEngineAuthority) fail(`native engine or Full-speed authority entered app-owned execution: ${path.relative(root, file)}`)
  }
}
if (!propertyValues(path.join(root, 'vite.web.config.ts')).some(entry => entry.name === 'sourcemap' && entry.value === false)) fail('browser preview source maps must be disabled for release output')
if (propertyValues(path.join(root, 'electron.vite.config.ts')).filter(entry => entry.name === 'sourcemap' && entry.value === false).length !== 3) fail('main, preload and renderer source maps must all be disabled')
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
