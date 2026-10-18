#!/usr/bin/env node
'use strict';
const { failureAnnotation } = require('./verify-contracts.cjs');
// Verification only. No app source changes, downloads of models, sign-ins or
// microphone access. Linux: run this under xvfb-run for the real Electron smoke.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { smokeResult, unitResult } = require('./verify-contracts.cjs');
const ROOT = path.resolve(__dirname, '..'), APP = path.join(ROOT, 'apps/03_oddbrain');
const evidence = path.resolve(process.env.ODDBRAIN_VERIFY_DIR || path.join(os.tmpdir(), 'oddbrain-verification'));
fs.mkdirSync(evidence, { recursive: true });
const report = { schema: 1, platform: process.platform, node: process.version, commit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(), commands: [], status: 'running' };
function save() { fs.writeFileSync(path.join(evidence, 'gate.json'), JSON.stringify(report, null, 2) + '\n'); }
function run(name, command, args, extra = {}) {
  const started = Date.now();
  console.log(`\nVERIFY ${name}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: APP, encoding: 'utf8', shell: process.platform === 'win32' && ['npm', 'npx'].includes(command), timeout: 600000, maxBuffer: 32 * 1024 ** 2, env: { ...process.env, ...extra } });
  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output);
  fs.writeFileSync(path.join(evidence, `${name}.log`), output);
  report.commands.push({ name, command, args, exit: result.status, signal: result.signal, durationMs: Date.now() - started, error: result.error?.message });
  save();
  if (result.error || result.status !== 0) throw Error(`${name} failed; see ${name}.log\n${output.slice(-4000)}`);
  return output;
}
try {
  // These are intentionally the brief's exact gate, in this order.
  run('install', 'npm', ['ci', '--ignore-scripts']);
  run('electron-install', process.execPath, ['node_modules/electron/install.js']);
  run('types', 'npx', ['tsc', '--noEmit']);
  report.typecheckErrors = 0;
  report.unit = unitResult(run('unit', 'npx', ['vitest', 'run']));
  run('build', 'npm', ['run', 'build']);
  // Isolate smoke files and ports from normal user configuration. Do not bypass
  // the app's existing console/scroll checks or retry a failing smoke.
  const home = path.join(evidence, 'smoke-home'); fs.mkdirSync(home, { recursive: true });
  report.smoke = smokeResult(run('smoke', 'npm', ['run', 'smoke'], {
    HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, 'config'),
    APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    AI_ASSISTANT_VAULT: path.join(home, 'vault'), AI_ASSISTANT_API_PORT: '0', AI_ASSISTANT_EXTENSION_PORT: '0',
  }));
  report.status = 'passed';
} catch (error) { failureAnnotation(error); report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
finally { save(); console.log(JSON.stringify(report, null, 2)); }
