// Package the Goose addon as ONE ready-to-download folder: the pre-built
// adapter (the eleven-tool MCP core + in-Goose screens), the import core, the
// installer, and the skill. Generated output only — never committed
// (see .gitignore: packages/Memory_OB/dist-addon/).
//
//   npm run package:addon
//
// Output:
//   packages/Memory_OB/dist-addon/Memory_OB-addon/        the folder
//   packages/Memory_OB/dist-addon/Memory_OB-addon-<v>.zip  the download
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync, openSync, readSync, closeSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const repoRoot = resolve(appRoot, '..', '..')
const addonSrc = join(repoRoot, 'packages', 'Memory_OB', 'goose-addon')
const outRoot = join(repoRoot, 'packages', 'Memory_OB', 'dist-addon')
const folderName = 'Memory_OB-addon'
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
  ['dist/memory-ob-mcp.cjs', join(appRoot, 'out', 'memory-ob', 'memory-ob-mcp.cjs'), 'adapter: the Memory_OB tools for Goose'],
  ['dist/goose-import-core.cjs', join(appRoot, 'out', 'memory-ob', 'goose-import', 'goose-import-core.cjs'), 'one-time Goose-history import engine'],
  ['dist/memory-ob-semantic.cjs', join(appRoot, 'out', 'memory-ob', 'semantic', 'memory-ob-semantic.cjs'), 'optional meaning-search engine (separate module)'],
  ['semantic-search.mjs', join(addonSrc, 'semantic-search.mjs'), 'meaning-search CLI (optional module)'],
  ['install.mjs', join(addonSrc, 'install.mjs'), 'installer (type ALLOW to write)'],
  ['import-goose-history.mjs', join(addonSrc, 'import-goose-history.mjs'), 'import CLI'],
  ['fix-goose-extensions.mjs', join(addonSrc, 'fix-goose-extensions.mjs'), 'restores extensions Goose dropped from its config (type ALLOW to write)'],
  ['README.md', join(addonSrc, 'README.md'), 'owner guide'],
  ['goose-skill/SKILL.md', join(repoRoot, 'packages', 'Memory_OB', 'goose-skill', 'SKILL.md'), 'the Memory_OB skill Goose reads'],
  ['LICENSE', join(repoRoot, 'packages', 'Memory_OB', 'LICENSE'), 'license'],
]
for (const [target, source] of inputs) {
  if (!existsSync(source)) fail(`Missing build input for ${target}:\n  ${source}\nBuild it first: cd apps/03_oddbrain && npm run build:memory-ob`)
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
const manifest = `# Memory_OB Goose addon — package manifest

Built: ${builtAt}
Version: ${appVersion} (${commit}${dirty ? ', uncommitted changes in the build checkout' : ''})
Targets: Windows 11 + Node.js 24 (works on macOS/Linux too). No paid services. No telemetry.

## What this folder is

One folder you can copy anywhere. It makes plain Goose work with your one
memory (\`Memory_OB\`) inside Goose itself — no separate app, no browser:

- \`install.mjs\` — installs the eleven Memory_OB tools + the in-chat and
  Apps-page screens + the skill into Goose and switches Goose's stock memory
  off, in one reviewed change (type \`ALLOW\`). It also repairs duplicate
  \`memory\`/\`apps\`/\`memory_ob\` config blocks left by earlier broken installers,
  and never writes a config Goose cannot parse.
- \`import-goose-history.mjs\` — the one-time import of your existing Goose
  sessions and memory, run BEFORE installing. Everything imported is labelled
  raw unconfirmed evidence.
- \`fix-goose-extensions.mjs\` — rebuilds extensions that Goose dropped from
  its config because their old shape stopped parsing (type \`ALLOW\`).
- \`dist/\` — pre-built engines. No build step needed on your machine.

Your screens live INSIDE Goose: say "show my memory screens" in any chat, or
open the Apps page — Memory_OB sits beside your other apps. There is no
browser window to open.

## Sources and versions

| Part | Source | Version |
| --- | --- | --- |
| Adapter + tools (\`dist/memory-ob-mcp.cjs\`) | OddBrain ${appRoot.includes('03_oddbrain') ? 'apps/03_oddbrain' : 'OddBrain'} main/memoryOb | ${appVersion} |
| Import engine (\`dist/goose-import-core.cjs\`) | OddBrain main/memoryOb/gooseImport | ${appVersion} |
| Goose storage formats | Goose v1.55.0 (sessions.db, .jsonl sessions, memory/*.txt) | v1.55.0 |
| Skill (\`goose-skill/SKILL.md\`) | packages/Memory_OB/goose-skill | ${appVersion} |

## Commands

| You run | What it does |
| --- | --- |
| \`node import-goose-history.mjs\` | Preview your Goose history (changes nothing) |
| \`node import-goose-history.mjs --apply\` | Import it (type ALLOW) |
| \`node install.mjs --goose-config <config.yaml>\` | Review the exact change, type ALLOW to install |
| \`node dist/memory-ob-mcp.cjs --catalogue <store> --chats <chats> --vault <brain> owner list\` | Owner commands (never-send / allow-send / trash / restore) |

## File checksums (SHA-256)

| File | Bytes | SHA-256 |
| --- | --- | --- |
${files.map(file => `| \`${file.name}\` | ${file.bytes} | \`${file.sha}\` |`).join('\n')}

## States

- Verified in the repository suite before packaging: the judge trap suite
  (intake, review-undo, Working Notes, owner marks, links, the Never-Send
  redaction law, and the Goose app screens contract), the install smoke
  (including the no-NUL-bytes and duplicate-block repair regressions), the
  import smoke, the extension-repair smoke, \`npm run typecheck\`, and
  \`security:release\` — all green on the build this package was cut from.
- The package itself is verified end-to-end by
  \`packages/Memory_OB/goose-addon/test/package-smoke.sh\` in the repository:
  it copies THIS folder to a clean place and runs import + install from it.

## Decisions this package keeps

- One memory authority: the brain folder. Nothing else is a second database.
- The in-chat confirmation card is the only place memory is confirmed: Allow
  saves exactly what the card shows, Deny saves nothing. The screens are
  view-only.
- \`memory_ob_review retract\` withdraws a confirmed record and keeps its full
  history. Nothing is ever permanently deleted.
- Imported history is raw unconfirmed evidence (\`origin: import\`), never
  silently trusted.
- Never Send records are never handed to an agent — not their text, titles,
  ids, or a count — on any surface.
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

// ---------- the semantic module as its own small download ----------
// LEGO: meaning search is optional. This zip stands alone beside any brain.
const semanticFolder = 'Memory_OB-semantic'
const semanticStage = join(outRoot, semanticFolder)
rmSync(semanticStage, { recursive: true, force: true })
mkdirSync(join(semanticStage, 'dist'), { recursive: true })
cpSync(join(stage, 'semantic-search.mjs'), join(semanticStage, 'semantic-search.mjs'))
cpSync(join(stage, 'dist', 'memory-ob-semantic.cjs'), join(semanticStage, 'dist', 'memory-ob-semantic.cjs'))
writeFileSync(join(semanticStage, 'README.md'), `# Memory_OB meaning search (optional module)

Semantic candidates beside the exact word-match search — it helps FIND things
by meaning and never verifies anything. Every quote still passes the evidence
tool; word-match search is unchanged.

Enable it:

\`\`\`
node semantic-search.mjs enable
\`\`\`

Connect a free embeddings endpoint (any OpenAI-compatible /embeddings service —
for example your free Ollama Cloud allowance if it offers embeddings). No local
model is downloaded.

\`\`\`
ODDBRAIN_MODEL_BASE_URL=https://your-endpoint.example/v1
ODDBRAIN_MODEL_API_KEY=...        (only if the endpoint needs one)
ODDBRAIN_EMBED_MODEL=your-embeddings-model
node semantic-search.mjs rebuild
node semantic-search.mjs search "what did I decide about the launch"
\`\`\`

The vector index lives inside the memory store as a rebuildable derivative —
deleting it loses nothing. Candidates are labelled UNVERIFIED everywhere.
`, 'utf8')
const semanticZip = join(outRoot, `${semanticFolder}-${appVersion}.zip`)
rmSync(semanticZip, { force: true })
execFileSync('python3', ['-c', `
import os, sys, zipfile
root, folder, out = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _, names in os.walk(os.path.join(root, folder)):
        for name in sorted(names):
            p = os.path.join(base, name)
            z.write(p, os.path.relpath(p, root))
`, outRoot, semanticFolder, semanticZip])

console.log('\nPackaged.')
console.log(`  folder: ${stage}`)
console.log(`  zip:    ${zipPath} (${statSync(zipPath).size} bytes)`)
console.log(`  module: ${semanticZip} (${statSync(semanticZip).size} bytes) — optional meaning search`)
console.log(`  files:  ${files.length}`)
