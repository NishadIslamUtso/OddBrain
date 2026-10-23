#!/usr/bin/env node
/**
 * Memmory_OB for Goose — one-command addon installer.
 *
 * You keep plain Goose. This creates ONE brain folder on your machine and
 * points Goose at it. No OddBrain app is required, installed, or used.
 *
 * Laws this script obeys (same as the reviewed app flow):
 *  - Shows the EXACT change before writing anything. Type ALLOW to proceed.
 *  - Changes only `extensions.memmory_ob` and the stock `memory` off-switch in
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
import { closeSync, constants, existsSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
const brainRoot = resolve(option('--brain', join(process.env.HOME || process.env.USERPROFILE || '.', 'Memmory_OB')))
// Packaged folder first (this folder ships pre-built), then the repository build.
const firstExisting = (...paths) => paths.find(path => existsSync(path))
const adapterSource = resolve(option('--adapter', firstExisting(
  join(here, 'dist', 'memmory-ob-mcp.cjs'),
  join(here, 'memmory-ob-mcp.cjs'),
  join(here, '..', '..', '..', 'apps', '03_oddbrain', 'out', 'memmory-ob', 'memmory-ob-mcp.cjs'),
) || join(here, 'dist', 'memmory-ob-mcp.cjs')))
const skillSource = resolve(option('--skill', firstExisting(
  join(here, 'goose-skill', 'SKILL.md'),
  join(here, '..', 'goose-skill', 'SKILL.md'),
) || join(here, 'goose-skill', 'SKILL.md')))

if (!option('--goose-config')) fail('Missing --goose-config. Point it at Goose\'s config.yaml (usually %APPDATA%\\Block\\goose\\config.yaml on Windows or ~/.config/goose/config.yaml).')
if (!existsSync(gooseConfig)) fail(`Goose config not found: ${gooseConfig}. Start Goose once first so it creates config.yaml.`)
if (!existsSync(adapterSource)) fail(`Adapter bundle not found: ${adapterSource}. Build it first (npm run build:memmory-ob), use the packaged folder, or pass --adapter <file>.`)
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
const adapterTarget = join(brainRoot, 'adapter', 'memmory-ob-mcp.cjs')
const receiptPath = join(brainRoot, 'adapter', 'goose-adapter.json')
const skillTarget = join(dirname(gooseConfig), 'skills', 'memmory-ob-memory', 'SKILL.md')

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
  '  memmory_ob:',
  '    type: stdio',
  '    name: memmory_ob',
  '    display_name: Memmory_OB',
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
  '      - memmory_ob_status',
  '      - memmory_ob_search',
  '      - memmory_ob_project',
  '      - memmory_ob_evidence',
  '',
].join('\n')

const disabledMemoryEntry = () => [
  '  memory:',
  '    type: builtin',
  '    name: memory',
  '    enabled: false',
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
        { label: `${gooseConfig}#extensions.memmory_ob`, before: '', after: blockFor() },
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
  const memoryEntry = entries.find(entry => entry.name === 'memory')
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

  // Pass 2: replace or insert the memmory_ob block (re-scanned after pass 1).
  entries = findEntries()
  const memEntry = entries.find(entry => entry.name === 'memmory_ob')
  const replacement = blockFor().replace(/\n$/, '').split('\n')
  if (memEntry) {
    notes.push({ label: `${gooseConfig}#extensions.memmory_ob`, before: `${lines.slice(memEntry.start, memEntry.end).join('\n')}\n`, after: blockFor() })
    lines.splice(memEntry.start, memEntry.end - memEntry.start, ...replacement)
  } else {
    const endOfMap = entries.length ? entries[entries.length - 1].end : extIndex + 1
    lines.splice(endOfMap, 0, ...replacement)
    notes.push({ label: `${gooseConfig}#extensions.memmory_ob`, before: '', after: blockFor() })
  }

  // Pass 3: the disabled stock-memory entry, placed right after ours.
  if (needMemoryInsert) {
    entries = findEntries()
    const anchor = entries.find(entry => entry.name === 'memmory_ob')
    const at = anchor ? anchor.end : extIndex + 1
    lines.splice(at, 0, ...disabledMemoryEntry().replace(/\n$/, '').split('\n'))
  }
  return { after: lines.join('\n'), notes }
}

const { after, notes } = patchConfig(before)

// Sanity: the result must contain exactly our four tools and the memory switch.
for (const needle of ['memmory_ob_status', 'memmory_ob_search', 'memmory_ob_project', 'memmory_ob_evidence']) {
  if (!after.includes(`- ${needle}`)) fail('Patch safety check failed: the prepared config is missing tool entries. Nothing was changed.')
}
if (after.replace(blockFor(), '').includes('memmory_ob:\n    type: stdio\n    name: memmory_ob') && before.includes('memmory_ob:')) {
  fail('Patch safety check failed: a second memmory_ob block would remain. Nothing was changed.')
}

// ---------- review ----------
const region = (text, label, oldText, newText) =>
  `--- ${label}\n${oldText ? `- ${oldText.split('\n').join('\n- ').replace(/\n- $/, '')}\n` : '(absent)\n'}${newText ? `+ ${newText.split('\n').join('\n+ ').replace(/\n+ $/, '')}\n` : ''}`
console.log('\nMemmory_OB for Goose — proposed changes (nothing is written yet)\n')
console.log(`Brain folder:   ${brainRoot}`)
console.log(`Goose config:   ${gooseConfig}`)
console.log(`Skill installs: ${skillTarget}`)
console.log('')
for (const note of notes) console.log(region('', note.label, note.before, note.after))
if (priorReceipt) console.log(`Receipt update: ${receiptPath}\n  old adapter sha ${priorReceipt.adapterSha256}\n  new adapter sha ${sha(adapterBytes)}\n`)
console.log('Everything else in config.yaml is preserved byte for byte. No secrets are printed.')
console.log('This gives Goose four READ-ONLY memory tools and switches OFF its stock memory.')
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
    while (written < newBytes.length) { const count = writeSync(descriptor, newBytes, written, newBytes.length - written, null); if (!count) break; written += count }
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
// when absent. An existing catalogue is never touched.
{
  const manifestPath = join(brainRoot, 'store', 'manifest.json')
  if (!existsSync(manifestPath)) {
    const at = new Date().toISOString()
    writeExclusive(manifestPath, `${JSON.stringify({ format: 'oddbrain-memmory-ob', version: 1, revision: 0, createdAt: at, updatedAt: at, records: 0, relationships: 0, lastChatStoreRevision: 0 }, null, 2)}\n`, 'catalogue manifest')
  }
}
writeFileAtomic(adapterTarget, adapterBytes)
writeFileAtomic(skillTarget, skillBytes)
const receipt = {
  format: 'oddbrain-goose-memmory-adapter-v1',
  configPath: gooseConfig,
  configBlockSha256: sha(blockFor()),
  adapterSha256: sha(adapterBytes),
  adapterPath: adapterTarget,
  skillPath: skillTarget,
  skillSha256: sha(skillBytes),
  cataloguePath: join(brainRoot, 'store'),
  chatsPath: join(brainRoot, 'chats'),
  vaultPath: brainRoot,
  installedAt: new Date().toISOString(),
}
writeFileAtomic(receiptPath, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`))

console.log(`\nInstalled.`)
if (backup) console.log(`Original Goose config preserved at: ${backup}`)
console.log(`Receipt: ${receiptPath}`)
console.log('\nNext: fully close and reopen Goose, then ask "what memory tools do you have?"')
console.log('It should list the four memmory_ob_* tools. Stock Goose Memory is switched off.')
console.log('Your memory lives in the brain folder as plain files you can always open and read.')
console.log('Open your screens (Projects, Vault, Review) on this brain with:')
console.log(`  node ${join(here, 'brain-window.mjs')} --brain ${brainRoot}`)
console.log('To hide any record from Goose permanently, run:')
console.log(`  node ${adapterTarget} --catalogue ${join(brainRoot, 'store')} --chats ${join(brainRoot, 'chats')} --vault ${brainRoot} owner list`)
