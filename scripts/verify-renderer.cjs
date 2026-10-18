#!/usr/bin/env node
'use strict';
const { failureAnnotation } = require('./verify-contracts.cjs');
const { spawn } = require('node:child_process');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const APP = path.resolve(__dirname, '../apps/03_oddbrain');
const evidence = path.resolve(process.env.ODDBRAIN_VERIFY_DIR || path.join(os.tmpdir(), 'oddbrain-verification'));
fs.mkdirSync(evidence, { recursive: true });
const port = 5174, url = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, [path.join(APP, 'node_modules/vite/bin/vite.js'), '--config', 'vite.web.config.ts', '--host', '0.0.0.0', '--port', String(port), '--strictPort'], { cwd: APP, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk }); server.stderr.on('data', chunk => { serverOutput += chunk });
const checks = ['check-ui.cjs', 'check-ui-turns.cjs', 'check-ui-standalone.cjs', 'check-ui-motion.cjs', 'check-ui-integration.cjs', 'check-ui-media.cjs'];
const report = { platform: process.platform, fixtureLimitation: 'Speech, recorder, engine and provider fixtures do not prove real devices, sign-ins or model quality.', checks: [], status: 'running' };
function ping() { return new Promise(resolve => { const req = http.get(url, res => { res.resume(); resolve(res.statusCode === 200) }); req.on('error', () => resolve(false)); req.setTimeout(1000, () => { req.destroy(); resolve(false) }); }); }
async function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--require', path.join(__dirname, 'verify-browser-setup.cjs'), path.join(APP, 'scripts', file)], { cwd: APP, env: { ...process.env, ODDBRAIN_UI_URL: url, ODDBRAIN_QA_DIR: path.join(evidence, 'renderer') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; const timer = setTimeout(() => child.kill(), 180000);
    child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk) }); child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk) });
    child.once('error', error => { clearTimeout(timer); reject(error) });
    child.once('exit', (code, signal) => { clearTimeout(timer); fs.writeFileSync(path.join(evidence, `${file}.log`), output); report.checks.push({ file: `apps/03_oddbrain/scripts/${file}`, exit: code, signal }); code === 0 ? resolve() : reject(Error(`${file} failed\n${output.slice(-4000)}`)); });
  });
}
(async () => {
  try {
    const deadline = Date.now() + 30000; let ready = false;
    while (Date.now() < deadline && server.exitCode === null) { if (serverOutput.includes(`localhost:${port}`) && await ping()) { ready = true; break } await new Promise(resolve => setTimeout(resolve, 100)); }
    if (!ready) throw Error('Renderer server did not become ready');
    for (const check of checks) await run(check);
    report.status = 'passed';
  } catch (error) { failureAnnotation(error); report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
  finally {
    server.kill(); fs.writeFileSync(path.join(evidence, 'renderer-server.log'), serverOutput);
    fs.writeFileSync(path.join(evidence, 'renderer.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
})();
