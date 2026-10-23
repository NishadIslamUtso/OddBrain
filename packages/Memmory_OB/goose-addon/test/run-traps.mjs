#!/usr/bin/env node
// Bundle the trap suite (it imports the app's chat-store writer) and run it
// against the built adapter. Working directory: the repository root.
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// esbuild lives in the app's node_modules; resolve it from there.
const require = createRequire(new URL('../../../../apps/03_oddbrain/package.json', import.meta.url))
const { build } = require('esbuild')

const here = fileURLToPath(new URL('.', import.meta.url))
const out = join(mkdtempSync(join(tmpdir(), 'memmory-traps-')), 'traps.cjs')
await build({
  entryPoints: [join(here, 'traps.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'warning',
})
const result = spawnSync('node', [out], { stdio: 'inherit', cwd: resolve(here, '..', '..', '..', '..') })
process.exit(result.status ?? 1)
