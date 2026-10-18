#!/usr/bin/env node
'use strict';
const { failureAnnotation } = require('./verify-contracts.cjs');
// Real built Electron/IPC/filesystem integration with a deterministic LOCAL
// CLI and HTTP fixture. No authenticated provider, real model or OS microphone.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const APP = path.resolve(__dirname, '../apps/03_oddbrain');
const { _electron } = require(path.join(APP, 'node_modules/playwright-core'));
const evidence = path.resolve(process.env.ODDBRAIN_VERIFY_DIR || path.join(os.tmpdir(), 'oddbrain-verification'));
fs.mkdirSync(evidence, { recursive: true });
const root = fs.mkdtempSync(path.join(evidence, 'native-fixture-'));
const report = { platform: process.platform, status: 'running', fixtureOnly: true, checks: [], errors: [] };
const calls = []; let app;
const server = http.createServer(async (request, response) => {
  let raw = ''; for await (const chunk of request) raw += chunk;
  response.setHeader('content-type', 'application/json');
  if (request.url === '/api/tags') response.end(JSON.stringify({ models: [{ name: 'fixture-reviewer', size: 0 }] }));
  else if (request.url === '/api/show') response.end(JSON.stringify({ capabilities: ['completion'] }));
  else if (request.url === '/api/chat') { calls.push(JSON.parse(raw)); response.end(JSON.stringify({ done: true, message: { content: 'Fixture report only.' } })); }
  else response.end('{}');
});
async function until(page, predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { const value = await page.evaluate(() => window.api.automation.read()); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw Error('The actual automation service did not settle within fifteen seconds');
}
(async () => {
  try {
    assert.equal(process.platform, 'linux', 'This fixture uses a POSIX CLI; Windows is covered by the separate native smoke/package probes.');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const home = path.join(root, 'home'), config = path.join(root, 'config'), workspace = path.join(root, 'work'), bin = path.join(home, '.local/bin');
    for (const folder of [home, config, workspace, bin]) fs.mkdirSync(folder, { recursive: true });
    const target = path.join(workspace, 'target.md'); fs.writeFileSync(target, 'before approval');
    const settings = { vaultPath: workspace, cloud: { baseUrl: '', model: '' }, permissions: { local: true, browserCapture: false, keepConversations: false, cloud: {} }, engine: { id: 'claude-code', model: 'fixture-reviewer', workspace, approval: 'ask', thinking: 'default', baseUrl: `http://127.0.0.1:${server.address().port}`, cloudProvider: '' } };
    for (const name of ['oddbrain', 'OddBrain', 'Electron']) { fs.mkdirSync(path.join(config, name), { recursive: true }); fs.writeFileSync(path.join(config, name, 'settings.json'), JSON.stringify(settings)); }
    const cli = '#!/usr/bin/env node\n' + String.raw`
const fs=require('node:fs'), readline=require('node:readline');
if(process.argv.includes('--version')){console.log('isolated-test-cli');process.exit(0)}
let turn=0;const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 let value;try{value=JSON.parse(line)}catch{return}
 if(value.type==='user'){turn++;send({type:'control_request',request_id:'test-'+turn,request:{subtype:'can_use_tool',tool_name:'Write',input:{file_path:TARGET,content:'after-'+turn}}})}
 if(value.type==='control_response'){
  if(value.response.response.behavior==='allow'){fs.writeFileSync(TARGET,'after-'+turn);send({type:'result',subtype:'success',is_error:false,result:'Fixture write '+turn})}
  else send({type:'result',subtype:'success',is_error:false,result:'Fixture denied'})
 }
});`.replaceAll('TARGET', JSON.stringify(target));
    fs.writeFileSync(path.join(bin, 'claude'), cli, { mode: 0o755 });
    app = await _electron.launch({ executablePath: require(path.join(APP, 'node_modules/electron')), args: ['--no-sandbox', '--disable-gpu', APP], cwd: APP, env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: config, AI_ASSISTANT_VAULT: workspace, AI_ASSISTANT_API_PORT: '0', AI_ASSISTANT_EXTENSION_PORT: '0', PATH: bin + path.delimiter + process.env.PATH } });
    const page = await app.firstWindow(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => { localStorage.setItem('ai-assistant.welcomed', 'true'); localStorage.setItem('ai-assistant.profile', JSON.stringify({ name: 'Verification fixture' })); });
    await page.reload();
    await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
    const native = await app.evaluate(({ app }) => ({ userData: app.getPath('userData'), version: app.getVersion() }));
    assert(native.userData.startsWith(root), 'Do not touch the real user profile');
    report.native = native;
    await page.evaluate(() => window.api.automation.update({ autoKeep: true, autoReview: true, reviewModel: 'fixture-reviewer', allowExternalReview: false }));
    let task=0;
    async function work(allow) {
      task++;
      await page.getByRole('textbox',{name:'Message',exact:true}).fill('Deterministic local verification task '+task);
      await page.getByRole('button',{name:'Send',exact:true}).click();
      await page.getByRole('button', { name: 'Allow', exact: true }).waitFor();
      await page.getByRole('button', { name: allow ? 'Allow' : 'Deny', exact: true }).click();
      await page.getByText(allow?'Fixture write '+task:'Fixture denied',{exact:true}).first().waitFor();
    }
    await work(true);
    await until(page, value => value.reports.some(item => item.state === 'done'));
    const kept = await page.evaluate(() => window.api.engine.checkpoints.list()); assert.equal(kept.checkpoints.length, 1);
    assert.equal(fs.readFileSync(kept.checkpoints[0].copy, 'utf8'), 'before approval');
    assert.equal(fs.readFileSync(target, 'utf8'), 'after-1');
    assert.equal(calls.length, 1); assert.equal(calls[0].tools, undefined); assert.equal(calls[0].messages[0].role, 'system');
    report.checks.push('Real Allow IPC protects original file bytes; automatic review posts to the local fixture without tools');
    await page.evaluate(() => window.api.automation.update({ autoKeep: false, autoReview: false }));
    await work(false);
    assert.equal(fs.readFileSync(target, 'utf8'), 'after-1'); assert.equal(calls.length, 1);
    report.checks.push('Real Deny IPC leaves the target unchanged; disabled automatic review sends no new model request');
    await work(true); await page.waitForFunction(filename => window.api.engine.checkpoints.list().then(value => value.checkpoints.length === 1), target);
    // Wait for the actual CLI completion, not an assumed fixed write delay.
    const deadline = Date.now() + 10000;
    while (fs.readFileSync(target, 'utf8') !== 'after-3' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(fs.readFileSync(target, 'utf8'), 'after-3');
    assert.equal((await page.evaluate(() => window.api.engine.checkpoints.list())).checkpoints.length, 1); assert.equal(calls.length, 1);
    report.checks.push('Independent Off controls take effect inside the same living CLI session');
    const inspected = await page.evaluate(copy => window.api.engine.checkpoints.inspect(copy), kept.checkpoints[0].copy);
    assert(inspected.ok); assert.equal(inspected.content, 'before approval');
    const artifact = await page.evaluate(() => window.api.artifacts.save({ title: 'Verification fixture artifact', type: 'html', content: '<p>test fixture source</p>' })); assert(artifact.ok);
    await page.evaluate(id => window.api.artifacts.remove(id), artifact.item.id);
    const trash = await page.evaluate(() => window.api.artifacts.trashList()); assert(trash.ok && trash.items.length === 1);
    const restored = await page.evaluate(key => window.api.artifacts.trashRestore(key), trash.items[0].key); assert(restored.ok);
    assert.equal((await page.evaluate(id => window.api.artifacts.read(id), restored.item.id)).content, '<p>test fixture source</p>');
    report.checks.push('Real artifact IPC removes to disk Trash and restores original source; checkpoint inspection returns original bytes');
    assert.deepEqual(report.errors, []); report.localModelRequests = calls.length; report.status = 'passed';
    await page.screenshot({ path: path.join(evidence, 'electron.png') });
  } catch (error) { failureAnnotation(error); report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }
  finally { if (app) await app.close().catch(() => {}); await new Promise(resolve => server.close(resolve)); fs.writeFileSync(path.join(evidence, 'electron.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2)); }
})();
