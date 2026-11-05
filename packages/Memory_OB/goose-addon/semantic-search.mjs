#!/usr/bin/env node
/**
 * Memory_OB semantic search — the optional meaning-search module. It sits
 * BESIDE the exact word-match search: it helps find candidates by meaning and
 * never verifies anything. Every quote still passes memory_ob_evidence.
 *
 *   node semantic-search.mjs [--brain <folder>] status
 *   node semantic-search.mjs [--brain <folder>] enable     (or disable)
 *   node semantic-search.mjs [--brain <folder>] rebuild
 *   node semantic-search.mjs [--brain <folder>] search "words"
 *
 * It needs a connected embeddings endpoint (any OpenAI-compatible
 * /embeddings service — for example the owner's free Ollama Cloud allowance
 * if it offers embeddings). No local model is downloaded.
 *
 *   ODDBRAIN_MODEL_BASE_URL  e.g. https://your-free-endpoint.example/v1
 *   ODDBRAIN_MODEL_API_KEY   if the endpoint needs one
 *   ODDBRAIN_EMBED_MODEL     the embeddings model name
 *
 * The vector index lives inside the memory store as a rebuildable derivative;
 * deleting it loses nothing.
 */
import { createRequire } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback = '') => {
  const index = args.indexOf(name)
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback
}
const fail = (message) => { console.error(`\n${message}`); process.exit(1) }

const brainRoot = resolve(option('--brain', join(process.env.HOME || process.env.USERPROFILE || homedir(), 'Memory_OB')))
const firstExisting = (...paths) => paths.find(path => existsSync(path) && statSync(path).isFile())
const corePath = resolve(option('--core', firstExisting(
  join(here, 'dist', 'memory-ob-semantic.cjs'),
  join(here, 'memory-ob-semantic.cjs'),
  join(here, '..', '..', '..', 'apps', '03_oddbrain', 'out', 'memory-ob', 'semantic', 'memory-ob-semantic.cjs'),
) || join(here, 'dist', 'memory-ob-semantic.cjs')))
if (!existsSync(corePath)) fail(`Semantic engine not found: ${corePath}. Build it with: npm run build:semantic`)

const { createSemantic } = createRequire(import.meta.url)(corePath)
const storeRoot = join(brainRoot, 'store')
const semantic = createSemantic(storeRoot, { chatsRoot: join(brainRoot, 'chats') })

const command = args.find(arg => !arg.startsWith('--') && arg !== option('--brain') && arg !== option('--core')) || 'status'
const printStatus = () => {
  const status = semantic.status()
  console.log('\nMemory_OB meaning search')
  console.log(`  brain:     ${brainRoot}`)
  console.log(`  enabled:   ${status.enabled ? 'yes' : 'no'}`)
  console.log(`  endpoint:  ${status.connected ? `connected (model: ${status.model})` : 'not connected'}`)
  console.log(`  indexed:   ${status.indexed} items${status.updatedAt ? ` (rebuilt ${status.updatedAt})` : ''}`)
  console.log(`  ${status.notice}`)
}

try {
  if (command === 'status') { printStatus(); process.exit(0) }
  if (command === 'enable' || command === 'disable') {
    semantic.setEnabled(command === 'enable')
    printStatus()
    if (command === 'enable') console.log('\nNext: set ODDBRAIN_MODEL_BASE_URL + ODDBRAIN_EMBED_MODEL (a free embeddings endpoint), then run: node semantic-search.mjs rebuild')
    process.exit(0)
  }
  if (command === 'rebuild') {
    const result = await semantic.rebuild()
    console.log(`\nIndexed ${result.indexed} items with model "${result.model}".`)
    console.log('Meaning candidates are unverified — confirm exact wording with memory_ob_evidence.')
    process.exit(0)
  }
  if (command === 'search') {
    const query = args.filter(arg => !arg.startsWith('--') && arg !== 'search' && arg !== option('--brain') && arg !== option('--core')).join(' ')
    if (!query.trim()) fail('Give some words to search for: node semantic-search.mjs search "words"')
    const candidates = await semantic.search(query, 5)
    if (!candidates.length) {
      printStatus()
      process.exit(0)
    }
    console.log(`\nMeaning candidates for: ${query}`)
    for (const candidate of candidates) {
      const preview = candidate.text.replace(/\s+/g, ' ').slice(0, 160)
      console.log(`\n- (${Math.round(candidate.score * 100) / 100}) ${candidate.title}`)
      console.log(`  ${preview}${candidate.text.length > 160 ? '…' : ''}`)
      console.log(`  id: ${candidate.id}`)
    }
    console.log('\nUNVERIFIED candidates. Confirm exact wording with memory_ob_evidence before quoting.')
    process.exit(0)
  }
  fail(`Unknown command "${command}". Use: status | enable | disable | rebuild | search "words"`)
} catch (error) {
  fail(error.message)
}
