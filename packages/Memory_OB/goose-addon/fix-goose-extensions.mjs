#!/usr/bin/env node
/**
 * Restore Goose extensions that vanished from Goose's config.yaml.
 *
 * Goose v1.55 parses every `extensions:` entry into a typed model and simply
 * SKIPS entries that fail ("Skipping malformed extension config entry") —
 * they disappear from the Extensions page. Worse: when Goose itself rewrites
 * config.yaml, those unparseable entries are dropped from the file for good.
 * (Typical shapes that fail: `command: npx foo` instead of `cmd` + `args`,
 * `timeout: "2m"` instead of an integer, quoted booleans.)
 *
 * The pre-Memory_OB backup still holds them. This script rebuilds every
 * extension that exists in the backup but not in the current config into the
 * schema Goose v1.55 accepts, shows the exact change, and writes only after
 * an explicit ALLOW. Nothing is deleted; old backups are never overwritten.
 *
 *   node fix-goose-extensions.mjs --goose-config <config.yaml>          # preview
 *   node fix-goose-extensions.mjs --goose-config <config.yaml> --apply  # type ALLOW
 */

import { existsSync, readFileSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs'

// ---------- options ----------
const argv = process.argv.slice(2)
const option = (name) => {
  const index = argv.indexOf(name)
  if (index < 0 || index + 1 >= argv.length) fail(`Missing ${name}.`)
  return argv[index + 1]
}
const apply = argv.includes('--apply')
const gooseConfig = option('--goose-config')
const from = argv.includes('--from') ? option('--from') : `${gooseConfig}.oddbrain-original`
function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

if (!existsSync(gooseConfig)) fail(`Goose config not found: ${gooseConfig}`)
if (!existsSync(from)) fail(`Backup not found: ${from}\nPoint --from at a config backup that still has your extensions.`)

const before = readFileSync(gooseConfig, 'utf8')
const backup = readFileSync(from, 'utf8')

// ---------- tiny YAML-ish readers (tolerant on purpose) ----------
const unquote = (value) => {
  const text = String(value ?? '').trim()
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text) } catch { return text.slice(1, -1) }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'")
  return text
}

const splitFlowList = (text) => {
  const inner = String(text).trim().replace(/^\[/, '').replace(/\]$/, '')
  if (!inner.trim()) return []
  return inner.split(',').map(part => unquote(part)).filter(part => part !== '')
}

const splitCommand = (text) => {
  const tokens = []
  let current = '', quoted = false
  for (const character of String(text)) {
    if (character === '"') { quoted = !quoted; continue }
    if (character === ' ' && !quoted) { if (current) { tokens.push(current); current = '' } continue }
    current += character
  }
  if (current) tokens.push(current)
  return tokens
}

const parseSeconds = (raw) => {
  const text = unquote(raw).trim().toLowerCase().replace(/\s+/g, '')
  if (/^\d+$/.test(text)) return Number(text)
  const match = /^(\d+)(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/.test(text) && text.match(/^(\d+)(.*)$/)
  if (match) {
    const amount = Number(match[1])
    const unit = match[2]
    if (unit.startsWith('s')) return amount
    if (unit.startsWith('m')) return amount * 60
    if (unit.startsWith('h')) return amount * 3600
  }
  return null
}

const parseBool = (raw) => {
  const text = unquote(raw).trim().toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(text)) return true
  if (['false', 'no', 'off', '0'].includes(text)) return false
  return null
}

/** Split one extension entry's lines into scalar props and block props. */
const readEntry = (lines) => {
  const scalars = {}
  const blocks = {}
  let currentBlock = null
  for (const line of lines) {
    const blockStart = line.match(/^ {4}([A-Za-z0-9_]+):\s*$/)
    const scalar = line.match(/^ {4}([A-Za-z0-9_]+):\s*(\S.*)$/)
    const deeper = line.match(/^ {6,}(-\s*)?.*$/)
    if (blockStart) {
      currentBlock = blockStart[1]
      blocks[currentBlock] = []
    } else if (scalar) {
      currentBlock = null
      scalars[scalar[1]] = scalar[2]
    } else if (currentBlock && deeper && line.trim() !== '') {
      blocks[currentBlock].push(line)
    } else if (line.trim() === '') {
      continue
    } else {
      currentBlock = null
    }
  }
  return { scalars, blocks }
}

const readList = (blockLines) => (blockLines ?? [])
  .map(line => line.replace(/^ {6,}-\s*/, ''))
  .map(unquote)
  .filter(part => part !== '')

const readFlowOrBlockList = (scalars, blocks, key) => {
  if (scalars[key]) return splitFlowList(scalars[key])
  return readList(blocks[key])
}

const readMap = (blockLines) => {
  const map = {}
  for (const line of blockLines ?? []) {
    const match = line.match(/^ {6,}([A-Za-z0-9_\-]+):\s*(.*)$/)
    if (match) map[match[1]] = unquote(match[2])
  }
  return map
}

// ---------- extension blocks in one config ----------
const extensionBlocks = (text) => {
  const lines = text.split('\n')
  const found = new Map()
  const extIndex = lines.findIndex(line => /^extensions:\s*(#.*)?$/.test(line))
  if (extIndex < 0) return { lines, found, start: -1, end: -1 }
  let start = extIndex + 1
  let end = lines.length
  for (let i = extIndex + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i]) && lines[i].trim() !== '') { end = i; break }
    const entry = lines[i].match(/^ {2}([A-Za-z0-9_]+):\s*$/)
    if (entry) found.set(entry[1], [])
  }
  const names = [...found.keys()]
  for (let n = 0; n < names.length; n += 1) {
    const name = names[n]
    const entryStart = lines.findIndex((line, i) => i >= start && i < end && line === `  ${name}:`)
    let entryEnd = end
    for (let i = entryStart + 1; i < end; i += 1) {
      if (/^ {2}[A-Za-z0-9_]+:/.test(lines[i]) || (/^\S/.test(lines[i]) && lines[i].trim() !== '')) { entryEnd = i; break }
    }
    found.set(name, lines.slice(entryStart + 1, entryEnd))
  }
  return { lines, found, start, end }
}

const current = extensionBlocks(before)
const original = extensionBlocks(backup)
if (original.found.size === 0) fail('No extensions were found in the backup file.')

// ---------- normalize one entry into Goose v1.55's schema ----------
const normalize = (name, entryLines) => {
  const { scalars, blocks } = readEntry(entryLines)
  const notes = []
  const type = unquote(scalars.type || '').toLowerCase() || (scalars.cmd || scalars.command || blocks.command ? 'stdio' : (scalars.uri || scalars.url ? 'streamable_http' : ''))
  const displayName = unquote(scalars.display_name || name)
  const entryName = unquote(scalars.name || name)
  const enabled = parseBool(scalars.enabled ?? 'true')
  if (enabled === null) notes.push(`enabled value ignored (was ${scalars.enabled}); kept enabled`)

  const quote = (value) => JSON.stringify(String(value))
  const out = []
  const pushList = (key, values) => {
    if (!values.length) { out.push(`    ${key}: []`); return }
    out.push(`    ${key}:`)
    for (const value of values) out.push(`      - ${quote(value)}`)
  }
  const pushMap = (key, map) => {
    const entries = Object.entries(map)
    if (!entries.length) { out.push(`    ${key}: {}`); return }
    out.push(`    ${key}:`)
    for (const [mapKey, mapValue] of entries) out.push(`      ${mapKey}: ${quote(mapValue)}`)
  }

  if (type === 'builtin' || type === 'platform') return { skip: `${name}: Goose manages built-in '${type}' entries itself` }
  if (type === 'streamable_http' || type === 'streamable-http') {
    const uri = unquote(scalars.uri || scalars.url || '')
    if (!uri) return { skip: `${name}: no uri/url found; not restorable automatically` }
    out.push(`  ${name}:`, '    type: streamable_http', `    name: ${quote(entryName)}`, `    display_name: ${quote(displayName)}`, `    enabled: ${enabled === false ? 'false' : 'true'}`)
    out.push(`    uri: ${quote(uri)}`)
    pushMap('headers', readMap(blocks.headers))
    pushMap('envs', readMap(blocks.envs ?? blocks.env))
    pushList('env_keys', readFlowOrBlockList(scalars, blocks, 'env_keys'))
    const timeout = parseSeconds(scalars.timeout ?? '30') ?? 30
    if (scalars.timeout && parseSeconds(scalars.timeout) === null) notes.push(`timeout '${scalars.timeout}' read as ${timeout}s`)
    out.push(`    timeout: ${timeout}`)
    return { lines: out, notes }
  }

  // stdio (the common case)
  if (type && type !== 'stdio') return { skip: `${name}: unknown extension type '${type}'; not restorable automatically` }
  let cmd = unquote(scalars.cmd || '')
  let args = readFlowOrBlockList(scalars, blocks, 'args')
  if (!cmd && (scalars.command || blocks.command)) {
    const commandList = blocks.command ? readList(blocks.command) : scalars.command && String(scalars.command).trim().startsWith('[') ? splitFlowList(scalars.command) : splitCommand(unquote(scalars.command))
    cmd = commandList[0] || ''
    args = commandList.slice(1)
  }
  if (!cmd) return { skip: `${name}: no cmd/command found; not restorable automatically` }
  out.push(`  ${name}:`, '    type: stdio', `    name: ${quote(entryName)}`, `    display_name: ${quote(displayName)}`, `    enabled: ${enabled === false ? 'false' : 'true'}`, `    cmd: ${quote(cmd)}`)
  pushList('args', args)
  pushMap('envs', readMap(blocks.envs ?? blocks.env))
  pushList('env_keys', readFlowOrBlockList(scalars, blocks, 'env_keys'))
  const timeout = parseSeconds(scalars.timeout ?? '30') ?? 30
  if (scalars.timeout && parseSeconds(scalars.timeout) === null) notes.push(`timeout '${scalars.timeout}' read as ${timeout}s`)
  out.push(`    timeout: ${timeout}`)
  return { lines: out, notes }
}

// ---------- build the restoration ----------
const missing = [...original.found.keys()].filter(name => !current.found.has(name))
const restored = []
const reports = []
for (const name of missing) {
  const result = normalize(name, original.found.get(name))
  if (result.skip) reports.push(`  - ${result.skip}`)
  else {
    restored.push({ name, lines: result.lines })
    for (const note of result.notes ?? []) reports.push(`  - ${name}: ${note}`)
  }
}

process.stdout.write('\nGoose extensions — proposed restorations (nothing is written yet)\n\n')
process.stdout.write(`Goose config: ${gooseConfig}\nRead from:    ${from}\n\n`)
if (missing.length === 0) {
  process.stdout.write('Nothing to restore: every extension in the backup is already in the config.\n')
  process.exit(0)
}
process.stdout.write(`Missing since Goose dropped them: ${missing.join(', ')}\n`)
if (reports.length) process.stdout.write(`Notes:\n${reports.join('\n')}\n`)
if (restored.length === 0) {
  process.stdout.write('\nNone of the missing entries could be rebuilt automatically. Nothing was changed.\n')
  process.exit(0)
}

for (const entry of restored) {
  process.stdout.write(`\n--- ${gooseConfig}#extensions.${entry.name}\n(absent)\n${entry.lines.map(line => `+ ${line}`).join('\n')}\n+\n`)
}

if (!apply) {
  process.stdout.write('\nPreview only. Re-run with --apply and type ALLOW to write.\n')
  process.exit(0)
}

// ---------- write (backup first; never overwrite an old backup) ----------
let backupPath = `${gooseConfig}.oddbrain-original`
const writeExclusive = (path, text) => {
  try {
    const handle = openSync(path, 'wx')
    try { writeSync(handle, text) } finally { closeSync(handle) }
    return true
  } catch { return false }
}
if (!writeExclusive(backupPath, before)) {
  backupPath = `${gooseConfig}.oddbrain-original-${new Date().toISOString().replace(/[:.]/g, '-')}`
  if (!writeExclusive(backupPath, before)) fail('Could not create a config backup. Nothing was written.')
}

process.stdout.write('\nType ALLOW to write these restorations, anything else to cancel.\n> ')
process.stdin.setEncoding('utf8')
process.stdin.once('data', (answer) => {
  if (String(answer).trim() !== 'ALLOW') {
    process.stdout.write('Cancelled. Nothing was written.\n')
    process.exit(1)
  }
  const assembled = [...current.lines.slice(0, current.end)]
  for (const entry of restored) {
    if (assembled.length && assembled[assembled.length - 1].trim() !== '') assembled.push('')
    assembled.push(...entry.lines, '')
  }
  assembled.push(...current.lines.slice(current.end))
  writeFileSync(gooseConfig, assembled.join('\n'))
  process.stdout.write(`\nRestored: ${restored.map(entry => entry.name).join(', ')}\nBackup:   ${backupPath}\n`)
  process.stdout.write('Restart Goose fully, then check its Extensions page.\n')
  process.exit(0)
})
