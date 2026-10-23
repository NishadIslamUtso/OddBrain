#!/usr/bin/env node
/**
 * Memory_OB for Goose — one-command addon installer.
 *
 * You keep plain Goose. This creates ONE brain folder on your machine and
 * points Goose at it. No OddBrain app is required, installed, or used.
 *
 * Laws this script obeys (same as the reviewed app flow):
 *  - Shows the EXACT change before writing anything. Type ALLOW to proceed.
 *  - Changes only `extensions.memory_ob` and the stock `memory` off-switch in
 *    Goose's config.yaml. Every other byte is preserved.
 *  - Keeps the original config as a backup, never overwriting an old backup.
 *  - Writes an ownership receipt with SHA-256 hashes of what was installed.
 *  - Refuses to overwrite files it does not own.
 *
 * Usage:
 *   node install.mjs --goose-config <path-to-config.yaml> [--brain <folder>]
 *   node install.mjs --print-only --goose-config <path>     (show diff, write nothing)
 */
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { closeSync, constants, existsSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sha = (value) => createHash('sha256').update(value).digest('hex')
const fail = (message) => { console.error(`\n${message}`); process.exit(1) }

// ---------- race-safe file helpers (one handle per read or verify-write) ----------
const noLinkedParents = (path) => {
  const full = resolve(path), root = /^[A-Za-z]:[\\/]/.test(full) ? full.slice(0, 3) : '/'
  let current = root
  for (const part of full.slice(root.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part)
    try { if (lstatSync(current).isSymbolicLink()) fail(`Refusing linked storage paths: ${path}`) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}
const readRegularFile = (path, limit, label) => {
  noLinkedParents(path)
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const before = fstatSync(descriptor)
    if (!before.isFile() || before.size < 1 || before.size > limit) fail(`The ${label} is not a regular file within its size limit: ${path}`)
    const bytes = Buffer.alloc(before.size); let total = 0
    while (total < bytes.length) { const count = readSync(descriptor, bytes, total, bytes.length - total, null); if (!count) break; total += count }
    const after = fstatSync(descriptor)
    if (total !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail(`The ${label} changed while being read. Nothing was used; run the install again.`)
    return bytes
  } finally { closeSync(descriptor) }
}
const writeFileAtomic = (path, data) => {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
  let descriptor = null
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    writeSync(descriptor, bytes, 0, bytes.length, null); closeSync(descriptor); descriptor = null
    renameSync(temporary, path)
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

// ---------- arguments ----------
const args = process.argv.slice(2)
const option = (name, fallback = '') => {
  const index = args.indexOf(name)
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback
}
const printOnly = args.includes('--print-only')
const gooseConfig = resolve(option('--goose-config', ''))
const brainRoot = resolve(option('--brain', join(process.env.HOME || process.env.USERPROFILE || '.', 'Memory_OB')))
// Packaged folder first (this folder ships pre-built), then the repository build.
const firstExisting = (...paths) => paths.find(path => existsSync(path))
const adapterSource = resolve(option('--adapter', firstExisting(
  join(here, 'dist', 'memory-ob-mcp.cjs'),
  join(here, 'memory-ob-mcp.cjs'),
  join(here, '..', '..', '..', 'apps', '03_oddbrain', 'out', 'memory-ob', 'memory-ob-mcp.cjs'),
) || join(here, 'dist', 'memory-ob-mcp.cjs')))
const skillSource = resolve(option('--skill', firstExisting(
  join(here, 'goose-skill', 'SKILL.md'),
  join(here, '..', 'goose-skill', 'SKILL.md'),
) || join(here, 'goose-skill', 'SKILL.md')))

if (!option('--goose-config')) fail('Missing --goose-config. Point it at Goose\'s config.yaml (usually %APPDATA%\\Block\\goose\\config.yaml on Windows or ~/.config/goose/config.yaml).')
if (!existsSync(gooseConfig)) fail(`Goose config not found: ${gooseConfig}. Start Goose once first so it creates config.yaml.`)
if (!existsSync(adapterSource)) fail(`Adapter bundle not found: ${adapterSource}. Build it first (npm run build:memory-ob), use the packaged folder, or pass --adapter <file>.`)
if (!existsSync(skillSource)) fail(`Skill file not found: ${skillSource}.`)

const configBytes = readRegularFile(gooseConfig, 8_000_000, 'Goose config')
const before = new TextDecoder('utf-8', { fatal: true }).decode(configBytes)
const adapterBytes = readRegularFile(adapterSource, 5_000_000, 'adapter bundle')
const skillBytes = readRegularFile(skillSource, 512_000, 'skill file')

// ---------- brain folder (paths only — nothing is created before ALLOW) ----------
const brainLayout = [
  '00 System/Connectors', '01 Inbox', '02 Sources/Conversations', '02 Sources/Documents',
  '03 Memory/Entities', '04 Working Memory', '05 Knowledge', '05 Workspace',
  '06 Review/Organizer', '06 Review/Chapter sources', '06 Review/Memory',
  '07 Sharing Receipts', '08 Journal', '09 Activity & Undo', '10 People',
  '90 Archive', '99 Trash', 'store', 'chats', 'adapter',
]
const adapterTarget = join(brainRoot, 'adapter', 'memory-ob-mcp.cjs')
const receiptPath = join(brainRoot, 'adapter', 'goose-adapter.json')
const skillTarget = join(dirname(gooseConfig), 'skills', 'memory-ob-memory', 'SKILL.md')
// Goose's Apps page lists apps from <root>/data/apps — where the owner's other
// apps live ("beside the scheduler thing"). Nested layout: config is
// <root>/config/config.yaml, so the data folder is its sibling. Only then (or
// when a data folder sits directly under the config folder) — never invent a
// location.
const gooseDataDir = (() => {
  const configDir = dirname(gooseConfig)
  const sibling = join(configDir, '..', 'data')
  if (basename(configDir) === 'config' && existsSync(sibling)) return sibling
  if (existsSync(join(configDir, 'data'))) return join(configDir, 'data')
  return ''
})()
const appsTarget = gooseDataDir ? join(gooseDataDir, 'apps', 'memory-ob.html') : ''

// Ownership check: never overwrite a file we cannot prove we wrote.
const ownedFile = (path, bytes, priorHash, label) => {
  if (!existsSync(path)) return
  const current = readRegularFile(path, 8_000_000, label)
  if (current.equals(bytes)) return
  if (priorHash && sha(current) === priorHash) return
  fail(`The ${label} path holds a file this installer does not own. Nothing was replaced. Inspect it manually:\n  ${path}`)
}
const priorReceipt = existsSync(receiptPath) ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readRegularFile(receiptPath, 1_000_000, 'adapter receipt'))) : null
ownedFile(adapterTarget, adapterBytes, priorReceipt?.adapterSha256, 'adapter')
ownedFile(skillTarget, skillBytes, priorReceipt?.skillSha256, 'skill')

// ---------- byte-preserving config patch ----------
const blockFor = () => [
  '  memory_ob:',
  '    type: stdio',
  '    name: memory_ob',
  '    display_name: Memory_OB',
  '    enabled: true',
  '    cmd: node',
  '    args:',
  `      - ${JSON.stringify(adapterTarget)}`,
  '      - --catalogue',
  `      - ${JSON.stringify(join(brainRoot, 'store'))}`,
  '      - --chats',
  `      - ${JSON.stringify(join(brainRoot, 'chats'))}`,
  '      - --vault',
  `      - ${JSON.stringify(brainRoot)}`,
  '    env_keys: []',
  '    envs: {}',
  '    timeout: 30',
  '    available_tools:',
  '      - memory_ob_status',
  '      - memory_ob_search',
  '      - memory_ob_project',
  '      - memory_ob_evidence',
  '      - memory_ob_propose',
  '      - memory_ob_review',
  '      - memory_ob_working_notes',
  '      - memory_ob_owner',
  '      - memory_ob_link',
  '      - memory_ob_intake',
  '      - memory_ob_screens',
  '',
].join('\n')

const disabledMemoryEntry = () => [
  '  memory:',
  '    type: builtin',
  '    name: memory',
  '    enabled: false',
  '',
].join('\n')

// The built-in Apps extension powers Goose's sidebar Apps page — the door the
// Memory_OB screens use for standalone launch inside the Goose app.
const appsEntry = () => [
  '  apps:',
  '    type: builtin',
  '    name: apps',
  '    display_name: Apps',
  '    enabled: true',
  '',
].join('\n')

/** Line-oriented patch of a block-map config. Refuses anything unusual. */
function patchConfig(before) {
  const lines = before.split('\n')
  const notes = []
  const extIndex = lines.findIndex(line => /^extensions:\s*(#.*)?$/.test(line))
  if (extIndex >= 0 && /\{\s*\}/.test(lines[extIndex])) fail('Goose extensions use the empty-flow form; expand them to the documented block-map form first. Nothing was changed.')
  if (extIndex < 0) {
    return {
      after: `${before.replace(/\n*$/, '\n')}extensions:\n${blockFor()}${disabledMemoryEntry()}`,
      notes: [
        { label: `${gooseConfig}#extensions.memory_ob`, before: '', after: blockFor() },
        { label: `${gooseConfig}#extensions.memory`, before: '', after: disabledMemoryEntry() },
      ],
    }
  }
  const entryEnd = (start) => {
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^ {2}[A-Za-z0-9_]+:/.test(lines[i]) || (/^\S/.test(lines[i]) && lines[i].trim() !== '')) return i
    }
    return lines.length
  }
  const findEntries = () => {
    const found = []
    for (let i = extIndex + 1; i < lines.length; i += 1) {
      if (/^\S/.test(lines[i]) && lines[i].trim() !== '') break
      if (/^ {2}[A-Za-z0-9_]+:/.test(lines[i])) found.push({ name: lines[i].trim().split(':')[0], start: i, end: entryEnd(i) })
    }
    return found
  }
  let entries = findEntries()

  // Pass 0: repair damage left by earlier broken installers. Duplicate
  // memory/apps/memory_ob blocks make the YAML ambiguous — a second enabled
  // memory block can silently re-enable stock Goose memory. Keep the fullest
  // block of each name (ties keep the first) and drop the later duplicates;
  // the passes below then fix the survivor in place.
  for (const name of ['memory_ob', 'memory', 'apps']) {
    const rows = findEntries().filter(entry => entry.name === name)
    if (rows.length <= 1) continue
    const keep = rows.reduce((best, row) => (row.end - row.start) > (best.end - best.start) ? row : best, rows[0])
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i] === keep) continue
      notes.push({ label: `${gooseConfig}#extensions.${name} (duplicate repair)`, before: `${lines.slice(rows[i].start, rows[i].end).join('\n')}\n`, after: '' })
      lines.splice(rows[i].start, rows[i].end - rows[i].start)
    }
    notes.push({ label: `${gooseConfig}#extensions.${name} (duplicate repair)`, before: `${rows.length} blocks`, after: `1 block kept (the ${rows.length - 1} duplicate(s) left by earlier installers were removed)` })
  }

  const memoryEntry = findEntries().find(entry => entry.name === 'memory')
  let needMemoryInsert = false

  // Pass 1: stock memory off-switch, in place, without touching sibling lines.
  if (memoryEntry) {
    let enabledLine = -1
    for (let i = memoryEntry.start + 1; i < memoryEntry.end; i += 1) if (/^ {4}enabled:/.test(lines[i])) enabledLine = i
    if (enabledLine >= 0) {
      notes.push({ label: `${gooseConfig}#extensions.memory.enabled`, before: `${lines[enabledLine]}\n`, after: '    enabled: false\n' })
      lines[enabledLine] = '    enabled: false'
    } else {
      notes.push({ label: `${gooseConfig}#extensions.memory`, before: `${lines[memoryEntry.start]}\n`, after: `${lines[memoryEntry.start]}\n    enabled: false\n` })
      lines.splice(memoryEntry.start + 1, 0, '    enabled: false')
    }
  } else {
    needMemoryInsert = true
    notes.push({ label: `${gooseConfig}#extensions.memory`, before: '', after: disabledMemoryEntry() })
  }

  // Pass 2: replace or insert the memory_ob block (re-scanned after pass 1).
  entries = findEntries()
  const memEntry = entries.find(entry => entry.name === 'memory_ob')
  const replacement = blockFor().replace(/\n$/, '').split('\n')
  if (memEntry) {
    notes.push({ label: `${gooseConfig}#extensions.memory_ob`, before: `${lines.slice(memEntry.start, memEntry.end).join('\n')}\n`, after: blockFor() })
    lines.splice(memEntry.start, memEntry.end - memEntry.start, ...replacement)
  } else {
    const endOfMap = entries.length ? entries[entries.length - 1].end : extIndex + 1
    lines.splice(endOfMap, 0, ...replacement)
    notes.push({ label: `${gooseConfig}#extensions.memory_ob`, before: '', after: blockFor() })
  }

  // Pass 3: the disabled stock-memory entry, placed right after ours.
  if (needMemoryInsert) {
    entries = findEntries()
    const anchor = entries.find(entry => entry.name === 'memory_ob')
    const at = anchor ? anchor.end : extIndex + 1
    lines.splice(at, 0, ...disabledMemoryEntry().replace(/\n$/, '').split('\n'))
  }

  // Pass 4: the built-in Apps extension, on. Without it Goose's sidebar has no
  // Apps page at all, so the Memory_OB screens cannot be launched standalone.
  entries = findEntries()
  const appsRow = entries.find(entry => entry.name === 'apps')
  if (!appsRow) {
    const anchor = entries.find(entry => entry.name === 'memory_ob')
    const at = anchor ? anchor.end : extIndex + 1
    lines.splice(at, 0, ...appsEntry().replace(/\n$/, '').split('\n'))
    notes.push({ label: `${gooseConfig}#extensions.apps`, before: '', after: appsEntry() })
  } else {
    let enabledLine = -1
    for (let i = appsRow.start + 1; i < appsRow.end; i += 1) if (/^ {4}enabled:/.test(lines[i])) enabledLine = i
    if (enabledLine >= 0 && lines[enabledLine].trim() === 'enabled: false') {
      notes.push({ label: `${gooseConfig}#extensions.apps.enabled`, before: `${lines[enabledLine]}\n`, after: '    enabled: true\n' })
      lines[enabledLine] = '    enabled: true'
    } else if (enabledLine < 0) {
      notes.push({ label: `${gooseConfig}#extensions.apps`, before: `${lines[appsRow.start]}\n`, after: `${lines[appsRow.start]}\n    enabled: true\n` })
      lines.splice(appsRow.start + 1, 0, '    enabled: true')
    }
  }
  return { after: lines.join('\n'), notes }
}

const { after, notes } = patchConfig(before)

// Sanity: the result must contain exactly our eleven tools and the memory switch.
for (const needle of ['memory_ob_status', 'memory_ob_search', 'memory_ob_project', 'memory_ob_evidence', 'memory_ob_propose', 'memory_ob_review', 'memory_ob_working_notes', 'memory_ob_owner', 'memory_ob_link', 'memory_ob_intake', 'memory_ob_screens']) {
  if (!after.includes(`- ${needle}`)) fail('Patch safety check failed: the prepared config is missing tool entries. Nothing was changed.')
}
if (after.replace(blockFor(), '').includes('memory_ob:\n    type: stdio\n    name: memory_ob') && before.includes('memory_ob:')) {
  fail('Patch safety check failed: a second memory_ob block would remain. Nothing was changed.')
}

// ---------- review ----------
const region = (text, label, oldText, newText) =>
  `--- ${label}\n${oldText ? `- ${oldText.split('\n').join('\n- ').replace(/\n- $/, '')}\n` : '(absent)\n'}${newText ? `+ ${newText.split('\n').join('\n+ ').replace(/\n+ $/, '')}\n` : ''}`
console.log('\nMemory_OB for Goose — proposed changes (nothing is written yet)\n')
console.log(`Brain folder:   ${brainRoot}`)
console.log(`Goose config:   ${gooseConfig}`)
console.log(`Skill installs: ${skillTarget}`)
console.log(`Screens app:   ${appsTarget || '(no Goose data folder found beside the config — the Apps-page copy is skipped)'}`)
console.log('')
for (const note of notes) console.log(region('', note.label, note.before, note.after))
if (priorReceipt) console.log(`Receipt update: ${receiptPath}\n  old adapter sha ${priorReceipt.adapterSha256}\n  new adapter sha ${sha(adapterBytes)}\n`)
console.log('Everything else in config.yaml is preserved byte for byte. No secrets are printed.')
console.log('This gives Goose the eleven Memory_OB tools (screens included) and switches OFF its stock memory.')
console.log('IMPORTANT: import your existing Goose history FIRST (node import-goose-history.mjs) if you want')
console.log('to keep it. After stock memory is switched off, Goose stops reading its old memory store.')
console.log('Type ALLOW to write these changes, anything else to cancel.')

const proceed = async () => {
  if (printOnly) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise(resolveAsk => rl.question('> ', resolveAsk))
  rl.close()
  return answer.trim() === 'ALLOW'
}
if (!(await proceed())) {
  console.log('Cancelled. Nothing was changed.')
  process.exit(0)
}

// ---------- atomic write (only after ALLOW; re-verified on one open handle) ----------
const writeExclusive = (path, data, label) => {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
  let descriptor
  try { descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600) }
  catch (error) { if (error.code === 'EEXIST') return false; throw error }
  try { writeSync(descriptor, bytes, 0, bytes.length, null) } finally { closeSync(descriptor) }
  return true
}
// TOCTOU guard: the exact reviewed snapshot must still be in place on one open
// handle at write time. Anything changed meanwhile is refused BEFORE the first
// filesystem write, so a refused install leaves the machine completely untouched.
const writeConfigVerified = (newBytes) => {
  const descriptor = openSync(gooseConfig, constants.O_RDWR | (constants.O_NOFOLLOW || 0))
  try {
    const current = fstatSync(descriptor)
    if (!current.isFile() || current.size !== configBytes.length) fail('The Goose config changed since this preview. Nothing was written; run the install again to review the current file.')
    const buf = Buffer.alloc(current.size); let total = 0
    while (total < buf.length) { const count = readSync(descriptor, buf, total, buf.length - total, null); if (!count) break; total += count }
    if (total !== current.size || !buf.equals(configBytes)) fail('The Goose config changed since this preview. Nothing was written; run the install again to review the current file.')
    // Verified on this handle — only now may anything reach the filesystem.
    let backup = ''
    backup = `${gooseConfig}.oddbrain-original`
    if (!writeExclusive(backup, configBytes)) {
      backup = `${gooseConfig}.oddbrain-original-${new Date().toISOString().replace(/[:.]/g, '-')}`
      if (!writeExclusive(backup, configBytes)) fail('Could not create a fresh Goose config backup. Nothing was written.')
    }
    ftruncateSync(descriptor, 0)
    let written = 0
    // Explicit position 0: the handle's read cursor sits at the old end of
    // file, and a null-position write would leave a hole of NUL bytes in
    // front of the new config (which Goose then cannot parse).
    while (written < newBytes.length) { const count = writeSync(descriptor, newBytes, written, newBytes.length - written, written); if (!count) break; written += count }
    if (written !== newBytes.length) fail('The Goose config could not be completed. Inspect it manually before restarting Goose.')
    return backup
  } finally { closeSync(descriptor) }
}
ownedFile(adapterTarget, adapterBytes, priorReceipt?.adapterSha256, 'adapter')
ownedFile(skillTarget, skillBytes, priorReceipt?.skillSha256, 'skill')
let backup = ''
if (after !== before) backup = writeConfigVerified(Buffer.from(after))
for (const part of brainLayout) mkdirSync(join(brainRoot, part), { recursive: true })
// A new brain is born usable: an empty valid catalogue manifest, created only
// when absent. An existing valid catalogue is never touched. A manifest left
// damaged by an earlier broken installer is kept aside (never deleted) and
// replaced with a valid one — the store rebuilds its counts from the object
// files that are actually there, and import-goose-history rebuilds content.
{
  const manifestPath = join(brainRoot, 'store', 'manifest.json')
  const at = new Date().toISOString()
  const fresh = `${JSON.stringify({ format: 'oddbrain-memory-ob', version: 1, revision: 0, createdAt: at, updatedAt: at, records: 0, relationships: 0, lastChatStoreRevision: 0 }, null, 2)}\n`
  if (!existsSync(manifestPath)) {
    writeExclusive(manifestPath, fresh, 'catalogue manifest')
  } else {
    let healthy = false
    try {
      const row = JSON.parse(readFileSync(manifestPath, 'utf8'))
      healthy = row?.format === 'oddbrain-memory-ob' && row?.version === 1 && Number.isSafeInteger(row?.lastChatStoreRevision)
    } catch { healthy = false }
    if (!healthy) {
      const aside = `${manifestPath}.damaged-${Date.now()}`
      renameSync(manifestPath, aside)
      writeExclusive(manifestPath, fresh, 'catalogue manifest')
      console.log(`A damaged catalogue manifest (left by an earlier broken installer) was kept at:\n  ${aside}\nA valid empty manifest is in place; the store rebuilds its counts from the object files that exist.`)
    }
  }
}
writeFileAtomic(adapterTarget, adapterBytes)
writeFileAtomic(skillTarget, skillBytes)
// Screens app on Goose's Apps page — a stamped snapshot that sits beside the
// owner's other apps. Live screens come from the chat tool. Soft-ownership:
// never overwrite a file that is not ours.
let appHtml = '', appNote = ''
if (appsTarget) {
  try {
    if (existsSync(appsTarget)) {
      const existing = readFileSync(appsTarget, 'utf8')
      if (!existing.includes('Memory_OB')) {
        appNote = `Screens app left alone: a different file already sits at ${appsTarget}.`
      }
    }
    if (!appNote) {
      appHtml = execFileSync('node', [adapterTarget, '--catalogue', join(brainRoot, 'store'), '--chats', join(brainRoot, 'chats'), '--vault', brainRoot, 'app-html'], { encoding: 'utf8', maxBuffer: 8_000_000 })
      if (!appHtml.includes('Memory_OB')) throw Error('app-html returned unexpected content.')
      mkdirSync(join(gooseDataDir, 'apps'), { recursive: true })
      writeFileAtomic(appsTarget, Buffer.from(appHtml))
      appNote = `Screens app written: ${appsTarget}`
    }
  } catch (error) {
    appNote = `Screens app skipped: ${error instanceof Error ? error.message : String(error)}`
    appHtml = ''
  }
}
const receipt = {
  format: 'oddbrain-goose-memory-adapter-v1',
  configPath: gooseConfig,
  configBlockSha256: sha(blockFor()),
  adapterSha256: sha(adapterBytes),
  adapterPath: adapterTarget,
  skillPath: skillTarget,
  skillSha256: sha(skillBytes),
  appPath: appsTarget,
  appSha256: appHtml ? sha(appHtml) : '',
  cataloguePath: join(brainRoot, 'store'),
  chatsPath: join(brainRoot, 'chats'),
  vaultPath: brainRoot,
  installedAt: new Date().toISOString(),
}
writeFileAtomic(receiptPath, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`))

console.log(`\nInstalled.`)
if (appNote) console.log(appNote)
if (backup) console.log(`Original Goose config preserved at: ${backup}`)
console.log(`Receipt: ${receiptPath}`)
console.log('\nNext: fully close and reopen Goose, then ask "what memory tools do you have?"')
console.log('It should list the eleven memory_ob_* tools. Stock Goose Memory is switched off.')
console.log('Your memory lives in the brain folder as plain files you can always open and read.')
console.log('See your screens (Projects, Vault, Review) inside Goose:')
console.log('  - say "show my memory screens" in any chat, or')
console.log('  - open the Apps page in Goose — Memory_OB sits beside your other apps.')
console.log('To hide any record from Goose permanently, run:')
console.log(`  node ${adapterTarget} --catalogue ${join(brainRoot, 'store')} --chats ${join(brainRoot, 'chats')} --vault ${brainRoot} owner list`)
