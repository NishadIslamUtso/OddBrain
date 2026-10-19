// Real renderer interactions with explicitly mocked command IPC. Actual OS
// execution/storage are tested separately in command-runner.test.ts.
const { chromium } = require('playwright-core'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const BASE = process.env.ODDBRAIN_UI_URL || 'http://127.0.0.1:5174/', QA = process.env.ODDBRAIN_QA_DIR || 'qa-ui'
;(async () => {
 const browser = await chromium.launch(process.env.ODDBRAIN_BROWSER_OPTIONS ? JSON.parse(fs.readFileSync(process.env.ODDBRAIN_BROWSER_OPTIONS, 'utf8')) : {})
 const page = await browser.newPage({ viewport: { width: 940, height: 620 }, reducedMotion: 'reduce', acceptDownloads: true }), report = { checks: [], errors: [] }
 page.on('pageerror', error => report.errors.push(error.stack)); fs.mkdirSync(QA, { recursive: true })
 try {
  await page.addInitScript(() => { localStorage.setItem('oddbrain.sample.mode', 'off'); localStorage.setItem('ai-assistant.welcomed', 'true') })
  await page.goto(BASE); await page.locator('.ob-launch').waitFor({ state: 'hidden', timeout: 15000 })
  const draft = page.getByRole('textbox', { name: 'Message', exact: true })
  await draft.fill('Preserve this chat draft')
  const open = async () => { await page.getByRole('button', { name: 'More chat tools', exact: true }).click(); await page.getByRole('button', { name: 'Review an OS command', exact: true }).click() }
  await open(); let panel = page.getByRole('dialog', { name: 'Command runner', exact: true })
  await panel.getByRole('textbox', { name: 'Exact command', exact: true }).fill('not executed')
  assert(await panel.getByRole('button', { name: 'Prepare command review', exact: true }).isDisabled())
  assert((await panel.innerText()).includes('browser preview cannot run commands'))
  await panel.getByRole('button', { name: 'Close command runner', exact: true }).click()
  assert.equal(await draft.inputValue(), 'Preserve this chat draft')
  report.checks.push('Browser preview refuses OS execution; opening/closing the runner never replaces or sends the chat draft')
  await page.evaluate(async () => {
   const url = performance.getEntriesByType('resource').map(e => e.name).find(url => url.includes('/src/platform/bridge.ts'))
   const { bridge } = await import(url); window.commandFixture = { previews: [], decisions: [], stops: 0, savedPreviews: 0 }; const saved = []
   bridge.commands.saved = async () => ({ items: structuredClone(saved), next: '', notice: '' })
   bridge.commands.save = async value => { const item = { ...value, id: 'saved-fixture', platform: 'linux', at: new Date().toISOString(), archived: false, digest: 'a'.repeat(64) }; saved.push(item); return item }
   bridge.commands.archiveSaved = async (id, archived) => { saved.find(item => item.id === id).archived = archived }
   bridge.commands.previewSaved = async id => { commandFixture.savedPreviews++; const item = saved.find(item => item.id === id); return { command: item.command, cwd: item.cwd, source: { id, name: item.name, digest: item.digest }, token: 'fixture-saved-ticket', expiresAt: Date.now() + 120000, explanation: 'Saved command fixture; no native execution' } }
   bridge.commands.context = async () => ({ cwd: '/fixture/selected folder', allowed: true, explanation: 'Fixture authorization; no real command transport', activeId: null })
   bridge.commands.preview = async request => { commandFixture.previews.push(request); return { ...request, token: 'fixture-ticket', expiresAt: Date.now() + 120000, explanation: 'Fixture review; OS execution is not being tested here', execution: { program: '/fixture/sh', arguments: ['-c', request.command], script: request.command, environmentKeys: ['PATH'] } } }
   bridge.commands.decide = async (token, decision) => { commandFixture.decisions.push({ token, decision }); if (decision === 'deny') return { denied: true }; return new Promise(resolve => { window.finishCommandFixture = resolve }) }
   bridge.commands.cancel = async () => { commandFixture.stops++; return { requested: true, answer: 'Fixture stop requested, not confirmed termination' } }
   bridge.commands.output = async () => ({ base64: btoa(String.fromCharCode(0,255,1,10)), name: 'fixture-stdout-partial.bin' })
  })
  await open(); panel = page.getByRole('dialog', { name: 'Command runner', exact: true })
  const command = "echo '<img src=x onerror=alert(1)>'"
  await panel.getByRole('textbox', { name: 'Exact command', exact: true }).fill(command)
  await panel.getByRole('button', { name: 'Prepare command review', exact: true }).click()
  assert.equal(await page.evaluate(() => commandFixture.decisions.length), 0)
  assert.equal(await panel.locator('img').count(), 0)
  assert((await panel.locator('pre').first().innerText()).includes(command))
  await panel.getByRole('button', { name: 'Deny execution', exact: true }).click()
  assert.deepEqual(await page.evaluate(() => commandFixture.decisions), [{ token: 'fixture-ticket', decision: 'deny' }])
  await panel.getByRole('button', { name: 'Prepare command review', exact: true }).click()
  await panel.getByRole('button', { name: 'Allow this command once', exact: true }).click()
  assert(await panel.getByRole('button', { name: 'Allow this command once', exact: true }).isDisabled())
  await panel.getByRole('button', { name: 'Stop app command', exact: true }).click()
  assert.equal(await page.evaluate(() => commandFixture.stops), 1)
  await page.evaluate(() => finishCommandFixture({ exitCode: null, stdout: 'Recorded prefix from fixture', stderr: 'Fixture stderr', interrupted: true, outputComplete: false, runId: 'fixture', note: 'Interrupted fixture; no automatic retry' }))
  await panel.getByText('Recorded prefix from fixture', { exact: true }).waitFor()
  assert((await panel.innerText()).includes('incomplete'))
  const downloading = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Download raw stdout', exact: true }).click()
  const file = await downloading; assert.deepEqual(fs.readFileSync(await file.path()), Buffer.from([0,255,1,10]))
  assert.equal(await page.evaluate(() => commandFixture.decisions.filter(d => d.decision === 'allow').length), 1)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
  await page.screenshot({ path: path.join(QA, 'command-review-fixture.png'), animations: 'disabled' })
  await panel.getByText('Save this command for later', { exact: true }).click()
  await panel.getByRole('textbox', { name: 'Saved command name', exact: true }).fill('Reusable fixture')
  await panel.getByRole('button', { name: 'Save new command', exact: true }).click()
  await panel.getByText('Saved commands', { exact: true }).click()
  await panel.getByText('Reusable fixture', { exact: true }).click()
  await panel.getByRole('button', { name: 'Review this saved command', exact: true }).click()
  assert.equal(await page.evaluate(() => commandFixture.savedPreviews), 0)
  await panel.getByRole('button', { name: 'Prepare command review', exact: true }).last().click()
  assert.equal(await page.evaluate(() => commandFixture.savedPreviews), 1)
  assert.equal(await page.evaluate(() => commandFixture.decisions.length), 2)
  await panel.getByRole('button', { name: 'Deny execution', exact: true }).click()
  await panel.getByRole('button', { name: 'Archive saved command', exact: true }).click()
  await panel.getByText('Reusable fixture · archived', { exact: true }).waitFor()
  await panel.getByRole('button', { name: 'Restore saved command', exact: true }).click()
  await panel.getByText('Reusable fixture', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => commandFixture.decisions.filter(d => d.decision === 'allow').length), 1)
  report.checks.push('Saving, selecting, archiving and restoring a reusable command never execute it; each use still requires a fresh explicit review')
  await panel.getByRole('button', { name: 'Close command runner', exact: true }).click()
  assert.equal(await draft.inputValue(), 'Preserve this chat draft')
  report.checks.push('Exact script renders as text; no dispatch before Allow; deny, busy protection, stop request and incomplete outcome work through the UI')
  report.checks.push('Raw binary output download retains its bytes; the runner fits 940×620 and preserves the separate chat draft')
  assert.deepEqual(report.errors, [])
 } catch (error) { report.failure = error.stack; process.exitCode = 1 }
 finally { fs.writeFileSync(path.join(QA, 'command-review-results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
