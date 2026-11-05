#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses')

const executable = path.resolve(__dirname, '..', 'dist', 'win-unpacked', 'OddBrain.exe')
const disabled = '0'.charCodeAt(0), enabled = '1'.charCodeAt(0)

async function main() {
  if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) throw Error('Packaged OddBrain.exe is missing; fuse state cannot be verified.')
  const wire = await getCurrentFuseWire(executable)
  const expected = new Map([
    [FuseV1Options.RunAsNode, disabled],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, disabled],
    [FuseV1Options.EnableNodeCliInspectArguments, disabled],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, disabled], // Electron currently supports this validation on macOS, not this Windows artifact.
    [FuseV1Options.OnlyLoadAppFromAsar, enabled],
  ])
  const wrong = [...expected].filter(([option, state]) => wire[option] !== state)
  if (wrong.length) throw Error(`Packaged fuse verification failed: ${wrong.map(([option]) => FuseV1Options[option]).join(', ')}`)
  console.log('packaged fuses: run-as-node, NODE_OPTIONS and inspector disabled; only app.asar may load')
}

main().catch(error => { console.error(`packaged fuses: ${error.message}`); process.exit(1) })
