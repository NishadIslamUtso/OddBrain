// Browser bridge/recorder fixtures test UI and lifecycle only, not OS microphone
// capture, native playback, authenticated providers or actual plugin installs.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const QA = path.resolve(process.env.ODDBRAIN_QA_DIR || 'qa-ui'); fs.mkdirSync(QA, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1536, height: 816 } });
  const errors = [], checks = []; page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.addInitScript(() => localStorage.setItem('ai-assistant.welcomed', 'true'));
    await page.goto(process.env.ODDBRAIN_UI_URL || 'http://127.0.0.1:5174/');
    await page.locator('.ob-launch').waitFor({ state: 'detached' });
    await page.evaluate(async () => {
      const { bridge } = await import('/src/platform/bridge.ts'); window.__bridge = bridge;
      window.__mediaCalls = []; window.__mediaCancelled = []; window.__pending = {};
      window.__mode = 'record'; window.__tracksStopped = 0; window.__micPending = false;
      window.__mediaPrefs = { model: 'custom/selected-transcription', allowNetwork: false, ocr: true, revision: 'fixture-revision' };
      bridge.media.read = async () => ({ ...window.__mediaPrefs });
      bridge.media.update = async value => ({ ok: true, preferences: window.__mediaPrefs = { ...value, revision: 'fixture-revision' } });
      bridge.media.models = async () => ({ models: [], problems: [] });
      bridge.media.cancel = async id => { window.__mediaCancelled.push(id) };
      bridge.media.process = async input => {
        window.__mediaCalls.push(input);
        if (window.__mode === 'long') return { ok: true, source: 'UI test decoder fixture', notes: ['Fixture, not real OCR'], text: 'Long extraction. '.repeat(2000) };
        if (window.__mode === 'fallback') return { ok: true, source: 'UI provider fixture', notes: [], text: 'Explicit provider result' };
        return new Promise(resolve => { window.__pending[input.id] = resolve });
      };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
        const stream = { getTracks: () => [{ stop: () => { window.__tracksStopped++ } }] };
        if (window.__micPending) return new Promise(resolve => { window.__grantMic = () => resolve(stream) });
        return stream;
      } } });
      window.MediaRecorder = class {
        static isTypeSupported() { return true }
        state = 'inactive'; mimeType = 'audio/webm';
        start() { this.state = 'recording' }
        stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['fixture audio'], { type: this.mimeType }) }); queueMicrotask(() => this.onstop?.()) }
      };
      window.__storeCalls = [];
      bridge.marketplace.browse = async () => {
        window.__storeCalls.push('browse');
        return { ok: true, catalog: { version: 'CLI fixture', sources: [{ name: 'fixture-source' }], items: [{ id: 'fixture@fixture-source', name: 'Fixture plugin', description: 'Test publisher text', author: 'Fixture', marketplace: 'fixture-source', installed: false, source: 'fixture source' }] } };
      };
      bridge.marketplace.plan = async () => ({ ok: true, plan: { token: 'first', command: 'claude plugin install fixture@fixture-source --scope user --json', warning: 'Fixture command' } });
      bridge.marketplace.approve = async token => { window.__storeCalls.push(token); return token === 'first' ? { ok: false, output: 'requires confirmation', followup: { token: 'second', command: 'claude plugin install fixture@fixture-source --accept-command exact-hash-fixture', warning: 'Publisher command declaration: fixture executable' } } : { ok: true, output: 'Fixture command accepted' } };
      bridge.marketplace.deny = async token => { window.__storeCalls.push('deny:' + token) };
    });
    const draft = page.getByRole('textbox', { name: 'Message', exact: true });
    await draft.fill('Keep my draft');
    await page.evaluate(() => { window.__micPending = true });
    await page.getByRole('button', { name: 'Dictate', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel microphone request', exact: true }).click();
    await page.evaluate(() => window.__grantMic());
    await page.waitForFunction(() => window.__tracksStopped > 0);
    assert.equal(await draft.inputValue(), 'Keep my draft');
    assert.equal(await page.evaluate(() => window.__mediaCalls.length), 0);
    checks.push('Cancelling pending microphone permission releases eventual tracks without recording/uploading');
    await page.evaluate(() => { window.__micPending = false });
    await page.getByRole('button', { name: 'Dictate', exact: true }).click();
    await page.getByRole('button', { name: 'Stop dictation', exact: true }).click();
    await page.waitForFunction(() => window.__mediaCalls.length === 1);
    await page.getByRole('button', { name: 'Cancel transcription', exact: true }).click();
    await page.getByRole('button', { name: 'Dictate', exact: true }).click();
    await page.getByRole('button', { name: 'Stop dictation', exact: true }).waitFor();
    await page.evaluate(() => { const first = window.__mediaCalls[0]; window.__pending[first.id]({ ok: true, text: 'STALE TRANSCRIPT', source: 'fixture', notes: [] }) });
    assert.equal(await draft.inputValue(), 'Keep my draft');
    assert(await page.getByRole('button', { name: 'Stop dictation', exact: true }).isVisible());
    await draft.fill('Edited during recording');
    await page.getByRole('button', { name: 'Stop dictation', exact: true }).click();
    await page.waitForFunction(() => window.__mediaCalls.length === 2);
    await page.evaluate(() => { const second = window.__mediaCalls[1]; window.__pending[second.id]({ ok: true, text: 'current transcript', source: 'fixture', notes: [] }) });
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="Message"]').value === 'Edited during recording current transcript');
    assert.equal(await page.evaluate(() => window.__mediaCalls[1].model), 'custom/selected-transcription');
    checks.push('Recorded-dictation fixtures: exact model, draft edits retained, cancelled late results ignored, new recording not stopped by old completion');
    await page.evaluate(() => { window.__mode = 'long' });
    await page.locator('input[type=file]').setInputFiles({ name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.from('UI fixture, not native PDF') });
    const excerpt = page.getByRole('dialog', { name: 'Choose attachment excerpt', exact: true }); await excerpt.waitFor();
    const full = await excerpt.getByRole('textbox', { name: 'Full extracted text' }).inputValue(); assert(full.length > 30000);
    const downloadEvent = page.waitForEvent('download'); await excerpt.getByRole('button', { name: 'Save full extracted text', exact: true }).click();
    const download = await downloadEvent; const downloaded = fs.readFileSync(await download.path(), 'utf8'); assert.equal(downloaded, full);
    await excerpt.getByRole('spinbutton', { name: 'Excerpt last character' }).fill('400');
    await excerpt.getByRole('button', { name: 'Attach selected excerpt only', exact: true }).click();
    await excerpt.waitFor({ state: 'detached' });
    assert.equal(await draft.inputValue(), 'Edited during recording current transcript');
    checks.push('Long extraction is fully inspectable/downloadable; excerpt selection requires approval and leaves draft unsent');
    await page.evaluate(() => { window.__mode = 'fallback' });
    await page.locator('input[type=file]').setInputFiles({ name: 'bad.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('invalid archive fixture') });
    await page.waitForFunction(() => window.__mediaCalls.some(input => input.name === 'bad.docx' && input.remote && input.model === 'custom/selected-transcription'));
    checks.push('Office XML decoder failure reaches separately confirmed exact-model processing, not a silent fallback');
    await page.evaluate(async()=>{
      window.api={};window.engineApi={pick:async()=>({ok:true})};
      const {engineStore}=await import('/src/state/engine.ts');await engineStore().pick('agy');
      window.__mediaPrefs.model='gemini/chosen-native-media';
    });
    await page.locator('input[type=file]').setInputFiles({name:'agy-image.png',mimeType:'image/png',buffer:Buffer.from('renderer-route fixture, not a real image')});
    await page.waitForFunction(()=>window.__mediaCalls.some(input=>input.name==='agy-image.png'&&input.remote&&input.model==='gemini/chosen-native-media'));
    checks.push('agy picture attachments use only the separately confirmed media model and attach text instead of queuing an unsupported native image');
    await page.keyboard.press('Control+,');
    await page.getByRole('button', { name: 'Section: Models', exact: true }).click();
    await page.getByLabel('Media model', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(QA, 'media-settings.png') });
    await page.getByRole('button', { name: 'Section: Plugins', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__storeCalls.length), 0);
    await page.getByRole('button', { name: 'Claude Code marketplaces', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__storeCalls.length), 0);
    await page.getByRole('button', { name: 'Read Claude Code catalogs', exact: true }).click();
    await page.getByRole('button', { name: 'Review install', exact: true }).click();
    await page.getByRole('button', { name: 'Allow marketplace command', exact: true }).click();
    await page.getByText(/Publisher command declaration: fixture executable/).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__storeCalls), ['browse', 'first']);
    await page.screenshot({ path: path.join(QA, 'marketplace-approval.png') });
    await page.getByRole('button', { name: 'Deny marketplace command', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__storeCalls), ['browse', 'first', 'deny:second']);
    checks.push('Store source selection does not browse automatically; publisher command requires a second card and Deny runs nothing');
    assert.deepEqual(errors, []);
    const report = { checks, errors, limitation: 'Bridge/recorder fixtures only. Real decoder/OCR checks are a separate native-worker script.' };
    fs.writeFileSync(path.join(QA, 'media-ui-checks.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 });
