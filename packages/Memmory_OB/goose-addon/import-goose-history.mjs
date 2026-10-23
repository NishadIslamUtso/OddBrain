#!/usr/bin/env node
/**
 * Import your existing Goose history into your brain — BEFORE you install the
 * addon (the install switches Goose's stock memory off).
 *
 * One-time migration. Goose folders are read-only sources; everything is
 * written into your brain folder as LABELLED RAW UNCONFIRMED EVIDENCE
 * (origin: import) — never confirmed memory. Re-running is safe: identical
 * sessions are skipped.
 *
 *   node import-goose-history.mjs [--brain <folder>] [--goose-data <dir>]
 *                                 [--goose-config <dir>] [--apply] [--yes]
 *
 * Default: show what would be imported and change nothing. With --apply you
 * see the same preview and type ALLOW to write.
 */
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback = '') => {
  const index = args.indexOf(name)
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback
}
const fail = (message) => { console.error(`\n${message}`); process.exit(1) }

const brainRoot = resolve(option('--brain', join(process.env.HOME || process.env.USERPROFILE || homedir(), 'Memmory_OB')))
const firstExisting = (...paths) => paths.find(path => existsSync(path))
const corePath = resolve(option('--core', firstExisting(
  join(here, 'goose-import-core.cjs'),
  join(here, 'goose-import-core.cjs'),
  join(here, '..', '..', '..', 'apps', '03_oddbrain', 'out', 'memmory-ob', 'goose-import', 'goose-import-core.cjs'),
) || join(here, 'goose-import-core.cjs')))
if (!existsSync(corePath)) fail(`Import core not found: ${corePath}. Build it with: npm run build:goose-import`)

// Where Goose keeps its files (verified against Goose v1.55 source).
const gooseCandidates = () => {
  const root = process.env.GOOSE_PATH_ROOT
  const home = process.env.HOME || process.env.USERPROFILE || homedir()
  const list = []
  if (root && root.startsWith('/')) list.push(root)
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming')
    list.push(join(appData, 'Block', 'goose'), join(appData, 'goose'))
    list.push(join(home, 'AppData', 'Roaming', 'Block', 'goose'))
  } else if (process.platform === 'darwin') {
    list.push(join(home, 'Library', 'Application Support', 'Block', 'goose'))
    list.push(join(home, '.config', 'goose'))
  } else {
    list.push(join(home, '.local', 'share', 'goose'), join(home, '.config', 'goose'))
  }
  return [...new Set(list.map(path => resolve(path)))]
}
const looksLikeGoose = (dir) => {
  if (!existsSync(dir)) return false
  return existsSync(join(dir, 'sessions')) || existsSync(join(dir, 'memory')) || existsSync(join(dir, 'config.yaml'))
}
const explicitData = option('--goose-data')
const explicitConfig = option('--goose-config')
let gooseData = explicitData ? resolve(explicitData) : ''
let gooseConfig = explicitConfig ? resolve(explicitConfig) : ''
if (!gooseData || !gooseConfig) {
  const found = gooseCandidates().filter(looksLikeGoose)
  const primary = found[0] || ''
  if (!gooseData) gooseData = primary
  if (!gooseConfig) gooseConfig = primary
  if (!primary && (!explicitData || !explicitConfig)) {
    fail(`Could not find Goose's folder. Looked in:\n  ${gooseCandidates().join('\n  ')}\nPass it explicitly: node import-goose-history.mjs --goose-data <folder> --goose-config <folder>`)
  }
}

const { importGooseHistory } = createRequire(import.meta.url)(corePath)
const run = (apply) => importGooseHistory({ brainRoot, gooseData, gooseConfig, apply })

let report
try { report = run(false) } catch (error) { fail(error.message) }

console.log('\nGoose history import — one-time migration into your brain')
console.log(`  brain:       ${brainRoot}`)
console.log(`  Goose data:  ${report.goose.data}`)
console.log(`  Goose config:${report.goose.config}`)
console.log('\nFound in Goose (read-only):')
console.log(`  sessions.db sessions:   ${report.found.sessions} (${report.found.messages} text messages, ${report.found.toolTraffic} tool-only messages skipped)`)
console.log(`  legacy .jsonl sessions: ${report.found.legacySessions}`)
console.log(`  stock memory files:     ${report.found.memoryFiles} (${report.found.memoryLines} lines)${report.found.memoryCategories.length ? ' — ' + report.found.memoryCategories.join(', ') : ''}`)
for (const warning of report.warnings) console.log(`  note: ${warning}`)
console.log('\nEverything imported is labelled raw unconfirmed evidence (origin: import).')
console.log('Goose folders are never changed. Re-running skips what is already imported.')

if (!args.includes('--apply')) {
  console.log('\nPreview only — nothing was written. Run again with --apply to import.')
  process.exit(0)
}

if (args.includes('--yes')) {
  // Non-interactive runs (our own smoke tests) pass --yes explicitly.
} else {
  console.log('\nType ALLOW to write this into your brain, anything else to cancel.')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise(resolveAsk => rl.question('> ', resolveAsk))
  rl.close()
  if (answer.trim() !== 'ALLOW') { console.log('Cancelled. Nothing was written.'); process.exit(0) }
}

try { report = run(true) } catch (error) { fail(error.message) }
console.log('\nImported.')
console.log(`  chats written or updated: ${report.written.chats} (${report.written.messages} messages)`)
console.log(`  memory copies in the brain: ${report.written.memoryCopies.length}`)
console.log(`  skipped (already imported): ${report.written.skipped.length}`)
console.log('\nNext: node install.mjs --goose-config <your config.yaml> — stock Goose memory goes off then,')
console.log('with your history already safe inside the brain.')
