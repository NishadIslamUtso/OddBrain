// Actual renderer flow with explicitly mocked native IPC. No engine/auth/network
// acceptance is inferred; backend session/file enforcement has separate tests.
const { chromium } = require('playwright-core')
const { openSettingsSection } = require('./settings-navigation.cjs')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const BASE = process.env.ODDBRAIN_UI_URL || 'http://127.0.0.1:5174/', QA = process.env.ODDBRAIN_QA_DIR || 'qa-ui'
;(async () => {
 const browser = await chromium.launch(process.env.ODDBRAIN_BROWSER_OPTIONS ? JSON.parse(fs.readFileSync(process.env.ODDBRAIN_BROWSER_OPTIONS, 'utf8')) : {})
 const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, reducedMotion: 'reduce' }), report = { checks: [], errors: [] }
 page.setDefaultTimeout(12000); page.on('pageerror', error => report.errors.push(error.stack)); fs.mkdirSync(QA, { recursive: true })
 try {
  await page.addInitScript(() => { localStorage.setItem('oddbrain.sample.mode', 'off'); localStorage.setItem('ai-assistant.welcomed', 'true') })
  await page.goto(BASE); await page.locator('.ob-launch').waitFor({ state: 'hidden', timeout: 15000 })
  await page.evaluate(async () => {
   const resources = performance.getEntriesByType('resource').map(r => r.name)
   const { bridge, getEngineApi } = await import(resources.find(url => url.includes('/src/platform/bridge.ts')))
   const { engineStore } = await import(resources.find(url => url.includes('/src/state/engine.ts')))
   const records = new Map(), seen = new Set(); window.fixtureNativeRequests = []
   const project = { id: 'project-fixture', name: 'Research fixture', instruction: 'Keep source evidence separate.', goals: ['Understand sources'], references: [], folder: '', createdAt: new Date().toISOString() }
   bridge.projects.read = async () => [project]; window.dispatchEvent(new Event('app:projects-changed'))
   bridge.workingNotes.read = async () => ({ ok: true, current: null, revisions: [], answer: '' })
   bridge.workingNotes.migrate = async () => ({ ok: true, current: null, revisions: [], answer: '' })
   bridge.workingNotes.fork = async () => ({ ok: true, current: null, revisions: [], answer: '' })
   bridge.engine.contextTarget = async context => ({ workspace: '/fixture/research', route: '', resume: seen.has(context.chatId) })
   bridge.engine.chatSessions = async chatId => seen.has(chatId) ? [{ engine: 'claude-code', chatId, workspace: '/fixture/research', sessionId: 'fixture-native-' + chatId }] : []
   bridge.transcripts.read = async id => records.has(id) ? { ok: true, value: records.get(id) } : { ok: false, error: 'Fixture record missing' }
   getEngineApi().send = async (prompt, _cwd, _images, context) => {
    window.fixtureNativeRequests.push({ prompt, context: structuredClone(context) }); seen.add(context.chatId)
    const number = window.fixtureNativeRequests.length, id = `${Date.now()}-${crypto.randomUUID()}`, text = `FIXTURE ANSWER ${number}\n` + 'x'.repeat(3100) + `\nEND ANSWER ${number}`
    const receipt = { projectId: context.projectId || null, revision: 'a'.repeat(64), workspace: '/fixture/research', sources: [], historyMessages: context.history?.length || 0, characters: prompt.length }
    const events = [{ kind: 'session', id: 'fixture-native-' + context.chatId }, { kind: 'delta', text }, { kind: 'done', text, alreadyDisplayed: true }]
    records.set(id, { header: { id, chatId: context.chatId, context: receipt, title: prompt, at: new Date().toISOString(), engine: 'claude-code', model: 'fixture-model', workspace: '/fixture/research', pictures: 0 }, prompt, userPrompt: prompt, events, state: 'done', incomplete: false })
    setTimeout(() => events.forEach(event => engineStore().ingest({ ...event, transcriptId: id, chatId: context.chatId, context: receipt })), 80)
    return { ok: true, answer: 'Fixture dispatch', transcriptId: id }
   }
  })
  await page.keyboard.press('Control+k'); await page.getByRole('combobox', { name: 'Search everything', exact: true }).fill('Projects'); await page.locator('.ob-command-results>button').filter({ hasText: /^Projects/ }).first().click()
  await page.getByRole('heading', { name: 'Research fixture', exact: true }).waitFor()
  await page.locator('.ob-projects-view').getByRole('button', { name: 'New chat', exact: true }).click()
  const send = async (text, number) => {
   await page.getByRole('textbox', { name: 'Message', exact: true }).fill(text); await page.getByRole('button', { name: 'Send', exact: true }).click()
   await page.waitForFunction(n => JSON.parse(localStorage.getItem('ai-assistant.chats') || '[]').some(chat => chat.messages.some(m => m.content.includes(`END ANSWER ${n}`))), number)
  }
  await send('First scoped task', 1); await send('Follow-up in this chat', 2)
  let requests = await page.evaluate(() => window.fixtureNativeRequests)
  assert.equal(requests[0].context.projectId, 'project-fixture'); assert.equal(requests[0].context.history.length, 0)
  assert.equal(requests[1].context.chatId, requests[0].context.chatId); assert.equal(requests[1].context.continuationExpected, true); assert.equal(requests[1].context.history, undefined)
  report.checks.push('Project selection reaches dispatch; follow-ups keep the same app identity and request native continuation without resending stored history')
  await page.getByText('Conversation notes and context', { exact: true }).click()
  await page.getByRole('button', { name: 'Ask a side question from here', exact: true }).click()
  await send('Side question only', 3)
  requests = await page.evaluate(() => window.fixtureNativeRequests)
  assert.notEqual(requests[2].context.chatId, requests[0].context.chatId); assert.equal(requests[2].context.continuationExpected, false); assert.equal(requests[2].context.history.length, 4)
  let chats = await page.evaluate(() => JSON.parse(localStorage.getItem('ai-assistant.chats')))
  assert.equal(chats.find(chat => chat.id === requests[0].context.chatId).messages.length, 4)
  assert.equal(chats.find(chat => chat.id === requests[2].context.chatId).branchOf, requests[0].context.chatId)
  report.checks.push('Side question forks saved text through the selected message, leaves the parent intact and requests a distinct native session')
  await page.getByRole('button', { name: 'OddBrain, new chat', exact: true }).first().click()
  assert.equal(await page.locator('.ob-chat-view [data-message-id]').filter({ hasText: 'First scoped task' }).count(), 0)
  await send('Unrelated private conversation', 4)
  requests = await page.evaluate(() => window.fixtureNativeRequests)
  assert.equal(requests[3].context.projectId, null); assert.equal(requests[3].context.history.length, 0); assert.notEqual(requests[3].context.chatId, requests[2].context.chatId)
  await page.reload(); await page.locator('.ob-launch').waitFor({ state: 'hidden', timeout: 15000 })
  chats = await page.evaluate(() => JSON.parse(localStorage.getItem('ai-assistant.chats')))
  assert(chats.every(chat => chat.messages.filter(m => m.role === 'assistant').every(m => m.content.includes('x'.repeat(3100)))))
  assert.equal(chats.length, 3); await page.locator('.ob-chat-view [data-message-id]').filter({ hasText: 'Unrelated private conversation' }).waitFor()
  await page.screenshot({ path: path.join(QA, 'native-chat-history-fixture.png'), animations: 'disabled' })
  report.checks.push('New chat carries no sibling history or project; complete recorded answers beyond old clipping limits remain visible after reload')
  await page.setViewportSize({ width: 940, height: 620 }); await page.keyboard.press('Control+,'); await openSettingsSection(page, 'Skills')
  await page.getByText('Installed skill files and skill authoring', { exact: true }).click(); await page.getByText('Create or revise a skill', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Skill name', exact: true }).fill('plain-notes')
  await page.getByRole('textbox', { name: 'Instructions', exact: true }).fill('Keep complete quotations. Never invent a source.')
  assert.equal(await page.getByRole('button', { name: 'Review skill file', exact: true }).isDisabled(), true)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
  await page.screenshot({ path: path.join(QA, 'native-skill-authoring-preview.png'), animations: 'disabled' })
  await openSettingsSection(page, 'House rules'); await page.getByText('Review native global rules', { exact: true }).click()
  await page.getByRole('button', { name: 'Preview exact change', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Native rule files require the desktop app' }).waitFor()
  report.checks.push('Native authoring and rule-review controls fit 940×620, inherit the app look and refuse real file mutations in a browser preview')
  assert.deepEqual(report.errors, [])
 } catch (error) { report.failure = error.stack; report.debug = await page.evaluate(() => ({ current: localStorage.getItem('ai-assistant.current-chat'), view: localStorage.getItem('ai-assistant.view'), text: document.body.innerText.slice(0, 2500) })); await page.screenshot({ path: path.join(QA, 'conversation-failure.png') }); process.exitCode = 1 }
 finally { fs.writeFileSync(path.join(QA, 'conversation-integration-results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
