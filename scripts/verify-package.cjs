#!/usr/bin/env node
'use strict';
const { failureAnnotation, receiptNotice } = require('./verify-contracts.cjs');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { smokeResult, unsignedNotice } = require('./verify-contracts.cjs');
const APP = path.resolve(__dirname, '../apps/03_oddbrain');
const evidence = path.resolve(process.env.ODDBRAIN_VERIFY_DIR || path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'oddbrain-verification'));
fs.mkdirSync(evidence, { recursive: true });
const report = { platform: process.platform, status: 'running', notice: unsignedNotice(), checks: [] };
function execute(name, command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: APP, encoding: 'utf8', timeout: 1200000, maxBuffer: 16 * 1024 ** 2, env: { ...process.env, ...env } });
  const output = (result.stdout || '') + (result.stderr || ''); process.stdout.write(output);
  fs.writeFileSync(path.join(evidence, `${name}.log`), output);
  report.checks.push({ name, exit: result.status, signal: result.signal });
  if (result.error || result.status !== 0) throw Error(`${name} failed: ${result.error?.message || result.status}\n${output.slice(-4000)}`);
  return output;
}
try {
  if (process.platform !== 'win32') throw Error('The Windows artifact gate must run on Windows');
  console.log(report.notice);
  execute('installer-build', process.execPath, [path.join(APP, 'node_modules/electron-builder/cli.js'), '--win', '--publish', 'never'], { CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
  const version = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'))).version;
  const installer = path.join(APP, 'dist', `OddBrain-Setup-${version}.exe`);
  const bytes = fs.readFileSync(installer), sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(`${installer}.sha256`, `${sha256}  ${path.basename(installer)}\n`);
  const signature = execute('installer-signature', 'powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-AuthenticodeSignature -LiteralPath $env:ODDBRAIN_VERIFY_INSTALLER).Status.ToString()'], { ODDBRAIN_VERIFY_INSTALLER: installer }).trim();
  if (signature !== 'NotSigned') throw Error(`Expected the explicitly UNSIGNED installer, got ${signature}`);
  report.installer = { name: path.basename(installer), bytes: bytes.length, sha256, signature };
  const home = path.join(evidence, 'packaged-smoke-home'); fs.mkdirSync(path.join(home, 'vault'), { recursive: true });
  report.smoke = smokeResult(execute('packaged-smoke', path.join(APP, 'dist/win-unpacked/OddBrain.exe'), ['--smoke', '--disable-gpu'], {
    AI_ASSISTANT_VAULT: path.join(home, 'vault'), AI_ASSISTANT_API_PORT: '0', AI_ASSISTANT_EXTENSION_PORT: '0',
  }));
  execute('packaged-media', process.execPath, [path.join(APP, 'node_modules/electron/cli.js'), path.join(APP, 'scripts/check-electron-media.cjs'), path.join(APP, 'dist/win-unpacked/resources/app.asar.unpacked/out/main/mediaWorker.js')]);
  report.status = 'passed';
} catch (error) { failureAnnotation(error); report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }
finally {
  fs.writeFileSync(path.join(evidence, 'package.json'), JSON.stringify(report, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n## Windows artifact verification\n${report.notice}\n\nStatus: ${report.status}\n`);
  receiptNotice(report); console.log(JSON.stringify(report, null, 2));
}
