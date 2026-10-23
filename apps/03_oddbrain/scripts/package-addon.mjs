// Package the Goose addon as ONE ready-to-download folder: the pre-built
// adapter (four-tool MCP core), the Brain Window server + interface, the import
// core, the installer, and the skill. Generated output only — never committed
// (see .gitignore: packages/Memmory_OB/dist-addon/).
//
//   npm run package:addon
//
// Output:
//   packages/Memmory_OB/dist-addon/Memmory_OB-addon/        the folder
//   packages/Memmory_OB/dist-addon/Memmory_OB-addon-<v>.zip  the download
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync, openSync, readSync, closeSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const repoRoot = resolve(appRoot, '..', '..')
const addonSrc = join(repoRoot, 'packages', 'Memmory_OB', 'goose-addon')
const outRoot = join(repoRoot, 'packages', 'Memmory_OB', 'dist-addon')
const folderName = 'Memmory_OB-addon'
const stage = join(outRoot, folderName)

const fail = (message) => { console.error(`\n${message}`); process.exit(1) }

const appVersion = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')).version
let commit = 'unknown'
let dirty = false
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim().length > 0
} catch { /* packaging still works outside git */ }

// Every input the package is built from. Missing inputs fail loudly — the
// package is never assembled from stale or partial builds.
const inputs = [
  ['dist/memmory-ob-mcp.cjs', join(appRoot, 'out', 'memmory-ob', 'memmory-ob-mcp.cjs'), 'adapter: the four Memmory_OB tools for Goose'],
  ['dist/goose-import-core.cjs', join(appRoot, 'out', 'memmory-ob', 'goose-import', 'goose-import-core.cjs'), 'one-time Goose-history import engine'],
  ['dist/brain-window-server.cjs', join(appRoot, 'out', 'memmory-ob', 'brain-window', 'brain-window-server.cjs'), 'Brain Window host (Projects, Vault, Review)'],
  ['ui/', join(appRoot, 'dist-web'), 'the built Brain Window interface'],
  ['install.mjs', join(addonSrc, 'install.mjs'), 'installer (type ALLOW to write)'],
  ['import-goose-history.mjs', join(addonSrc, 'import-goose-history.mjs'), 'import CLI'],
  ['brain-window.mjs', join(addonSrc, 'brain-window.mjs'), 'Brain Window launcher'],
  ['README.md', join(addonSrc, 'README.md'), 'owner guide'],
  ['goose-skill/SKILL.md', join(repoRoot, 'packages', 'Memmory_OB', 'goose-skill', 'SKILL.md'), 'the Memmory_OB skill Goose reads'],
  ['LICENSE', join(repoRoot, 'packages', 'Memmory_OB', 'LICENSE'), 'license'],
]
for (const [target, source] of inputs) {
  if (!existsSync(source)) fail(`Missing build input for ${target}:\n  ${source}\nBuild it first: cd apps/03_oddbrain && npm run build:memmory-ob && npm run build:brain-window && npm run build:web`)
}

// ---------- assemble ----------
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
for (const [target, source] of inputs) {
  const destination = join(stage, target)
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true })
}

// ---------- MANIFEST (sources, versions, commands, states, decisions) ----------
const shaFile = (path) => {
  const hash = createHash('sha256')
  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(1 << 20)
    for (;;) {
      const bytes = readSync(fd, buffer, 0, buffer.length, null)
      if (!bytes) break
      hash.update(buffer.subarray(0, bytes))
    }
  } finally { closeSync(fd) }
  return hash.digest('hex')
}
const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.isFile()) files.push({ path, name: relative(stage, path).replaceAll('\\', '/'), bytes: statSync(path).size, sha: shaFile(path) })
  }
}
walk(stage)
files.sort((a, b) => a.name.localeCompare(b.name))

const builtAt = new Date().toISOString()
const manifest = `# Memmory_OB Goose addon — package manifest

Built: ${builtAt}
Version: ${appVersion} (${commit}${dirty ? ', uncommitted changes in the build checkout' : ''})
Targets: Windows 11 + Node.js 24 (works on macOS/Linux too). No paid services. No telemetry.

## What this folder is

One folder you can copy anywhere. It makes plain Goose work with your one
memory (\`Memmory_OB\`) without installing or maintaining any app:

- \`install.mjs\` — installs the four read-only tools + the skill into Goose and
  switches Goose's stock memory off, in one reviewed change (type \`ALLOW\`).
- \`import-goose-history.mjs\` — the one-time import of your existing Goose
  sessions and memory, run BEFORE installing. Everything imported is labelled
  raw unconfirmed evidence.
- \`brain-window.mjs\` — the local Brain Window: Projects, Vault (files, search,
  graph, link check, folder choose-and-decide) and Review (the only place
  memory is confirmed).
- \`dist/\` — pre-built engines. No build step needed on your machine.

## Sources and versions

| Part | Source | Version |
| --- | --- | --- |
| Adapter + tools (dist/memmory-ob-mcp.cjs) | OddBrain ${appRoot.includes('03_oddbrain') ? 'apps/03_oddbrain' : 'OddBrain'} main/memmoryOb | ${appVersion} |
| Import engine (dist/goose-import-core.cjs) | OddBrain main/memmoryOb/gooseImport | ${appVersion} |
| Brain Window host (dist/brain-window-server.cjs) | OddBrain main/brainWindow | ${appVersion} |
| Interface (ui/) | OddBrain renderer (dist-web build) | ${appVersion} |
| Goose storage formats | Goose v1.55.0 (sessions.db, .jsonl sessions, memory/*.txt) | v1.55.0 |
| Skill (goose-skill/SKILL.md) | packages/Memmory_OB/goose-skill | ${appVersion} |

## Commands

| You run | What it does |
| --- | --- |
| \`node import-goose-history.mjs\` | Preview your Goose history (changes nothing) |
| \`node import-goose-history.mjs --apply\` | Import it (type ALLOW) |
| \`node install.mjs --goose-config <config.yaml>\` | Review the exact change, type ALLOW to install |
| \`node brain-window.mjs\` | Open Projects · Vault · Review in your browser |
| \`node dist/memmory-ob-mcp.cjs --catalogue <store> --chats <chats> owner list\` | Owner commands (never-send / allow-send) |

## File checksums (SHA-256)

| File | Bytes | SHA-256 |
| --- | --- | --- |
${files.map(file => `| \`${file.name}\` | ${file.bytes} | \`${file.sha}\` |`).join('\n')}

## States

- Verified in the repository suite before packaging: install smoke 34/34,
  import smoke 20/20, judge traps 33/33 (Never-Send, project scope, hazard
  excerpts, restart identity, trashed chats, empty catalogue), Brain Window
  smoke 10/10, \`security:release\` and \`security:policy\` passed on the build
  this package was cut from.
- The package itself is verified end-to-end by
  \`packages/Memmory_OB/goose-addon/test/package-smoke.sh\` in the repository:
  it copies THIS folder to a clean place and runs import + install + Brain
  Window from it.

## Decisions this package keeps

- One memory authority: the brain folder. Nothing else is a second database.
- Goose never confirms its own memory; the Review screen is the only place
  confirmations happen.
- Imported history is raw unconfirmed evidence (\`origin: import\`), never
  silently trusted.
- Goose's own folders are read-only sources; the AI may move things to
  recoverable Trash but never permanently deletes.
- No telemetry, no credentials, no external services, no phone-home.
`
writeFileSync(join(stage, 'MANIFEST.md'), manifest, 'utf8')
files.push({ path: join(stage, 'MANIFEST.md'), name: 'MANIFEST.md', bytes: statSync(join(stage, 'MANIFEST.md')).size, sha: shaFile(join(stage, 'MANIFEST.md')) })

// ---------- zip ----------
const zipName = `${folderName}-${appVersion}.zip`
const zipPath = join(outRoot, zipName)
rmSync(zipPath, { force: true })
execFileSync('python3', ['-c', `
import os, sys, zipfile
root, folder, out = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _, names in os.walk(os.path.join(root, folder)):
        for name in sorted(names):
            p = os.path.join(base, name)
            z.write(p, os.path.relpath(p, root))
`, outRoot, folderName, zipPath])

console.log('\nPackaged.')
console.log(`  folder: ${stage}`)
console.log(`  zip:    ${zipPath} (${statSync(zipPath).size} bytes)`)
console.log(`  files:  ${files.length}`)
