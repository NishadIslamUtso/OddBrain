#!/usr/bin/env node
/**
 * The Brain Window — your screens, on your brain, in your browser.
 *
 * This opens the SAME OddBrain interface (Projects, Vault with the memory
 * graph and link check, the Review screen, Brain, and the first-run
 * choose-a-folder flow) against ONE brain folder. It is local-only: it binds
 * 127.0.0.1 and never opens a network port. No desktop app is installed.
 *
 *   node brain-window.mjs [--brain <folder>] [--ui <folder>] [--port <n>] [--no-open]
 *
 * Defaults: brain = ~/Memmory_OB, port = 8767. The interface and the server
 * bundle are found beside this script (packaged addon) or in the repository
 * build (development).
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
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

const brainRoot = resolve(option('--brain', join(process.env.HOME || process.env.USERPROFILE || homedir(), 'Memmory_OB')))
const port = Number.parseInt(option('--port', '8767'), 10)
if (!Number.isInteger(port) || port < 1024 || port > 65000) fail('Choose a port between 1024 and 65000.')
// Default loopback only. --bind 0.0.0.0 exists for preview hosts and is
// never the default: the Brain Window is local-only by design.
const host = option('--bind', '127.0.0.1')
const firstExisting = (...paths) => paths.find(path => existsSync(path))
const uiDir = resolve(option('--ui', firstExisting(
  join(here, 'ui'),
  join(here, '..', '..', '..', 'apps', '03_oddbrain', 'dist-web'),
) || join(here, 'ui')))
const serverPath = resolve(option('--server', firstExisting(
  join(here, 'brain-window-server.cjs'),
  join(here, '..', '..', '..', 'apps', '03_oddbrain', 'out', 'memmory-ob', 'brain-window', 'brain-window-server.cjs'),
) || join(here, 'brain-window-server.cjs')))

if (!existsSync(serverPath)) fail(`Brain Window server not found: ${serverPath}. Build it with: npm run build:brain-window`)
if (!existsSync(join(uiDir, 'index.html'))) fail(`The interface build was not found at ${uiDir}. Build it with: npm run build:web`)

const { startBrainWindow } = createRequire(import.meta.url)(serverPath)
const brain = await startBrainWindow({ brainRoot, uiDir, port, apiPort: port + 1, host, version: '1.0.0' })

console.log('\nBrain Window is open — your screens, on your brain.')
console.log(`  ${brain.url}`)
console.log(`  brain folder: ${brainRoot}`)
console.log('  local-only: this address works only on this computer.')
console.log('\nScreens: Projects · Vault (graph, link check, memory checking) · Review · Brain')
console.log('Press Ctrl+C when you are done.\n')

if (!args.includes('--no-open')) {
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', brain.url]]
    : process.platform === 'darwin' ? ['open', [brain.url]]
    : ['xdg-open', [brain.url]]
  try { spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref() } catch { /* the URL is printed above */ }
}

const stop = async () => { await brain.close(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
