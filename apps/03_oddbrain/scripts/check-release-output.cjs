#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const mode = args[0]
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = String(manifest.version || '')
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('package.json must contain a numeric release version')
const installerName = `OddBrain-Setup-${version}.exe`
const failures = []
const fail = message => failures.push(message)
const forbiddenName = /(?:^|\/)(?:\.env(?:\.|$)|id_(?:rsa|ed25519)(?:\.|$)|credentials?(?:\.|$)|secrets?(?:\.|$))|\.(?:map|ts|tsx)$/i
const textLike = /\.(?:js|mjs|cjs|json|html|css|yml|yaml|md|txt|xml)$/i

function inspectBytes(label, bytes) {
  if (bytes.length > 20_000_000 || !textLike.test(label)) return
  const text = bytes.toString('utf8')
  if (/"sourcesContent"\s*:/.test(text)) fail(`${label} embeds sourcesContent`)
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) fail(`${label} contains a private-key block`)
  if (/(?:ANTHROPIC|OPENAI|GOOGLE|GITHUB|AWS)_[A-Z0-9_]*(?:KEY|TOKEN|SECRET)\s*=\s*["']?[A-Za-z0-9_\-]{16,}/.test(text)) fail(`${label} looks like it contains a live credential assignment`)
}
function inspectTree(directory, label = path.basename(directory)) {
  if (!fs.existsSync(directory)) { fail(`${label} is missing`); return }
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name), shown = path.relative(root, full).replaceAll('\\', '/')
      if (entry.isSymbolicLink()) { fail(`${shown} is a linked release output`); continue }
      if (entry.isDirectory()) walk(full)
      else {
        if (forbiddenName.test('/' + shown)) fail(`${shown} is an unapproved source/map/secret-shaped file`)
        inspectBytes(shown, fs.readFileSync(full))
        if (entry.name === 'app.asar') inspectAsar(full, shown)
      }
    }
  }
  walk(directory)
}
function inspectAsar(file, label) {
  let asar
  try { asar = require('@electron/asar') } catch { fail(`${label} could not be inventoried because @electron/asar is unavailable`); return }
  let entries
  try { entries = asar.listPackage(file) } catch { fail(`${label} is not a readable ASAR package`); return }
  for (const raw of entries) {
    const entry = String(raw).replace(/^[/\\]/, '').replaceAll('\\', '/')
    if (forbiddenName.test('/' + entry)) fail(`${label}:${entry} is an unapproved source/map/secret-shaped entry`)
    if (textLike.test(entry)) {
      try { inspectBytes(`${label}:${entry}`, Buffer.from(asar.extractFile(file, entry))) } catch { fail(`${label}:${entry} could not be inspected`) }
    }
  }
}

if (mode === '--build') {
  inspectTree(path.join(root, 'out'), 'out')
  inspectTree(path.join(root, 'dist-web'), 'dist-web')
} else if (mode === '--installer') {
  const dist = path.join(root, 'dist')
  if (!fs.existsSync(dist)) fail('dist is missing')
  else {
    const approved = /^(?:OddBrain-Setup-\d+\.\d+\.\d+\.exe(?:\.blockmap|\.sha256)?|oddbrain-sbom\.cdx\.json|latest\.yml|builder-(?:debug|effective-config)\.ya?ml|win-unpacked)$/
    for (const name of fs.readdirSync(dist)) if (!approved.test(name)) fail(`dist/${name} is not on the release-output allowlist`)
    const installer = path.join(dist, installerName)
    if (!fs.existsSync(installer) || !fs.statSync(installer).isFile()) fail(`the expected installer ${installerName} is missing`)
    inspectTree(dist, 'dist')
  }
} else {
  fail('usage: node scripts/check-release-output.cjs --build|--installer')
}
if (failures.length) { for (const item of failures) console.error(`release output: ${item}`); process.exit(1) }
console.log(`release output: ${mode === '--build' ? 'desktop and browser builds' : 'installer tree'} passed map, embedded-source, secret, source-tree, symlink and allowlist checks`)
