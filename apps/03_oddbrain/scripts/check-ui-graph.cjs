const { openSettingsSection, ALL_SETTINGS } = require('./settings-navigation.cjs');
// Isolated graph fixture, never shipped or inserted into the normal app.
const { chromium } = require('playwright-core')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const base = process.env.ODDBRAIN_UI_URL || 'http://127.0.0.1:5174/'
const output = path.resolve(process.env.ODDBRAIN_QA_DIR || 'qa-ui')
const options = process.env.ODDBRAIN_BROWSER_OPTIONS ? JSON.parse(fs.readFileSync(process.env.ODDBRAIN_BROWSER_OPTIONS, 'utf8')) : {}
;(async () => {
  const browser = await chromium.launch(options), report = { checks: [], errors: [] }
  fs.mkdirSync(output, { recursive: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, reducedMotion: 'reduce' })
    page.on('pageerror', error => report.errors.push(error.message))
    await page.addInitScript(() => { localStorage.setItem('oddbrain.sample.mode', 'off'); localStorage.setItem('ai-assistant.welcomed', 'true') })
    await page.goto(base); await page.locator('.ob-launch').waitFor({ state: 'hidden' })
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Draft kept through navigation')
    await page.keyboard.press('Control+,')
    await openSettingsSection(page, 'Appearance')
    await openSettingsSection(page, 'Connectors')
    await page.getByRole('button', { name: 'Back', exact: true }).first().click()
    assert.equal(await page.locator('.ob-settings-content>header h1').textContent(), 'Appearance')
    const search = page.getByRole('textbox', { name: /Search settings/ })
    if (await search.count()) {
      await search.fill('Voice'); await openSettingsSection(page, 'Voice & attachments')
      await page.getByRole('button', { name: 'Back', exact: true }).first().click()
      assert.equal(await page.locator('.ob-settings-content>header h1').textContent(), 'Appearance'); assert.equal(await search.inputValue(), '')
    }
    await page.getByRole('button', { name: 'OddBrain, new chat', exact: true }).first().click()
    assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), 'Draft kept through navigation')
    await page.getByRole('button', { name: 'Back', exact: true }).first().click()
    assert.equal(await page.locator('.ob-settings-content>header h1').textContent(), 'Appearance')
    report.checks.push('Settings section Back, search restoration, brand New chat and draft preservation')
    assert.equal(await page.locator('.ob-settings-navigation .ob-settings-area').count(), 8)
    const sections = ALL_SETTINGS
    for (const title of sections) {
      await openSettingsSection(page, title.trim())
      assert.equal(await page.locator('.ob-settings-content>header h1').textContent(), title.trim())
      assert.equal(await page.locator('button button').count(), 0)
    }
    await page.getByRole('button', { name: 'OddBrain, new chat', exact: true }).first().click()
    for (const view of ['Artifacts', 'Projects', 'Vault', 'Brain', 'Today', 'Code']) {
      await page.keyboard.press('Control+k'); await page.getByRole('combobox', { name: 'Search everything' }).fill(view)
      await page.locator('.ob-command-results>button').filter({ hasText: new RegExp('^' + view) }).first().click()
      assert.equal(await page.locator('[aria-label="' + view + '"] .ob-screen-header .ob-mascot svg').count(), 1)
      await page.getByRole('button', { name: 'OddBrain, new chat', exact: true }).first().click()
      assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), 'Draft kept through navigation')
      await page.getByRole('button', { name: 'Back', exact: true }).first().click()
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ai-assistant.view'))), view.toLowerCase())
      await page.screenshot({ path: path.join(output, `screen-${view.toLowerCase()}.png`), animations: 'disabled' })
    }
    report.checks.push('All 8 Settings groups render; working screens use original SVGs; brand and Back preserve the draft from every screen')
    // Test the actual canvas component against an explicitly labelled fixture.
    // No global preload replacement and no fabricated data in the app preview.
    const files = Array.from({ length: 90 }, (_, i) => `${['Ideas', 'Reading', 'Work'][i % 3]}/Note ${i + 1}.md`)
    const edges = files.slice(1, 80).map((to, i) => ({ from: files[Math.floor(i / 4)], to }))
    await page.route('**/api/vault/files', route => route.fulfill({ json: { ok: true, files } }))
    await page.route('**/api/vault/file?**', route => route.fulfill({ json: { ok: true, content: '# Explicit test fixture\nA note preview, not user data.' } }))
    await page.evaluate(async ({ files, edges }) => {
      const entry = await (await fetch('/src/main.tsx')).text()
      const React = (await import(entry.match(/from "([^"]*\/react\.js[^"]*)"/)[1])).default
      const { createRoot } = (await import(entry.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)[1])).default
      const graphSource = await (await fetch('/src/components/ConnectionGraph.tsx')).text()
      const { bridge } = await import(graphSource.match(/from "([^"]*\/platform\/bridge\.ts[^"]*)"/)[1]), { default: BrainView } = await import('/src/components/BrainView.tsx')
      bridge.structure.linkCheck = async () => ({ files: files.length, checked: edges.length + 2, edges, dead: [{ from: files[0], target: 'missing' }], ambiguous: [{ from: files[1], target: 'ambiguous', matches: ['x', 'y'] }] })
      document.querySelector('#root').style.display = 'none'
      const host = document.createElement('div'); host.id = 'isolated-graph-fixture'; host.style.cssText = 'display:flex;height:100vh;background:var(--color-bg)'; document.body.append(host)
      window.fixture = { files, edges }
      createRoot(host).render(React.createElement(BrainView, { vault: { state: 'ready', path: 'TEST FIXTURE — not a real vault', error: '' }, isDemo: false, onOpenVault: () => {} }))
    }, { files, edges })
    const graph = page.locator('#isolated-graph-fixture'), canvas = graph.locator('canvas')
    await graph.getByRole('tab', { name: 'Map', exact: true }).click()
    await canvas.waitFor(); await page.waitForTimeout(150)
    assert((await graph.innerText()).includes('90 of 90 notes'))
    const original = await canvas.evaluate(c => c.toDataURL())
    await canvas.focus(); await canvas.press('ArrowRight'); await page.waitForTimeout(80)
    assert.notEqual(await canvas.evaluate(c => c.toDataURL()), original)
    await graph.getByRole('button', { name: 'Fit view', exact: true }).click(); await page.waitForTimeout(80)
    assert.equal(await canvas.evaluate(c => c.toDataURL()), original)
    const point = await canvas.evaluate(async c => {
      const { buildGraph, newCamera, projectPoint } = await import('/src/lib/graphScene.ts')
      const { DEFAULT_GRAPH } = await import('/src/state/graph.ts')
      const scene = buildGraph(window.fixture.edges, window.fixture.files, DEFAULT_GRAPH)
      const projected = scene.names.map((name, i) => ({ name, ...projectPoint(...scene.positions.slice(i * 3, i * 3 + 3), newCamera(), '3d', c.clientWidth, c.clientHeight) })).sort((a, b) => b.depth - a.depth)
      return projected[0]
    })
    await canvas.click({ position: { x: point.x, y: point.y } })
    assert.equal(await graph.getByRole('combobox', { name: 'Select graph note' }).inputValue(), point.name)
    await graph.getByRole('button', { name: 'Read note', exact: true }).click()
    await graph.locator('.ob-graph-note').getByText('A note preview, not user data.', { exact: false }).waitFor()
    report.checks.push('Actual canvas pixels change with orbit; Fit restores; pointer selection and guarded file preview work')
    await graph.getByRole('button', { name: 'Appearance', exact: true }).click()
    await graph.getByLabel('Use app colours', { exact: true }).uncheck()
    await graph.getByLabel('Background', { exact: true }).fill('#132019')
    await graph.getByLabel('Colour nodes by folder', { exact: true }).check()
    await graph.getByRole('button', { name: '2D', exact: true }).click()
    await page.waitForTimeout(100)
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('oddbrain.graph.v1')))).background, '#132019')
    assert.equal(await canvas.getAttribute('aria-label'), '2D graph of vault connections')
    await graph.getByLabel('Rotate 3D view automatically').check(); await graph.getByRole('button', { name: '3D', exact: true }).click(); await page.waitForTimeout(100)
    const still = await canvas.evaluate(c => c.toDataURL()); await page.waitForTimeout(150); assert.equal(await canvas.evaluate(c => c.toDataURL()), still)
    await graph.getByRole('button', { name: 'Clear', exact: true }).click()
    await graph.getByRole('button', { name: 'Reset', exact: true }).click(); await page.waitForTimeout(80)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async theme => { const { applyLook, DEFAULT_LOOK } = await import('/src/state/look.ts'); const { DEFAULT_APPEARANCE } = await import('/src/state/appearance.ts'); applyLook({ ...DEFAULT_APPEARANCE, theme }, DEFAULT_LOOK) }, theme)
      await page.waitForTimeout(100); await page.screenshot({ path: path.join(output, `graph-fixture-${theme}.png`) })
    }
    report.checks.push('Saved colours, folder groups, 2D/3D, appearance reset, reduced-motion rotation suppression, light/dark rendering')
    for (const size of [{ width: 940, height: 620 }, { width: 1280, height: 820 }, { width: 1536, height: 864 }]) {
      await page.setViewportSize(size)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      const box = await canvas.boundingBox(); assert(box && box.width > 300 && box.height >= 240)
    }
    assert.deepEqual(report.errors, []); report.checks.push('Graph remains usable at 940×620, 1280×820 and 1536×864')
  } catch (error) { report.failure = error.stack; process.exitCode = 1 }
  finally { fs.writeFileSync(path.join(output, 'graph-acceptance.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await browser.close() }
})()
