// Browser interaction check for the actual Store component. The renderer's
// bridge is mocked; the CLI service is separately exercised against a real
// Claude Code binary with an isolated local marketplace fixture.
const { chromium } = require('playwright-core')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const BASE = process.env.ODDBRAIN_UI_URL || 'http://127.0.0.1:5174/'
const QA = path.resolve(process.env.ODDBRAIN_QA_DIR || 'qa-ui')
fs.mkdirSync(QA, { recursive: true })
;(async () => {
  const browser = await chromium.launch(process.env.ODDBRAIN_CHROMIUM_PATH
    ? { executablePath: process.env.ODDBRAIN_CHROMIUM_PATH, args: ['--no-sandbox', '--no-zygote'] }
    : undefined)
  const page = await browser.newPage({ viewport: { width: 1536, height: 824 } })
  const report = { errors: [], checks: [] }
  page.on('pageerror', error => report.errors.push(error.message))
  try {
    await page.goto(BASE)
    await page.evaluate(async () => {
      // Import the SAME React instance and bridge used by App; Vite's URL may
      // carry an HMR timestamp, and a fresh import of the unstamped URL can
      // create a separate singleton.
      const urls = performance.getEntriesByType('resource').map(entry => entry.name)
      const react = (await import(urls.find(url => url.includes('/deps/react.js?')))).default
      const dom = (await import(urls.find(url => url.includes('/deps/react-dom_client.js?')))).default
      const source = await (await fetch('/src/components/ClaudeMarketplacesSection.tsx')).text()
      const bridgeUrl = source.match(/from "(\/src\/platform\/bridge\.ts(?:\?t=\d+)?)"/)?.[1]
      if (!bridgeUrl) throw new Error('Store component does not import its real bridge')
      const { bridge } = await import(bridgeUrl)
      const { default: Store } = await import('/src/components/ClaudeMarketplacesSection.tsx')
      window.__marketCalls = []
      let installed = false
      bridge.mods.claudeList = async () => ({ ok: true, reason: '', command: 'C:\\Program Files\\Claude\\claude.exe', version: '2.1.302',
        marketplaces: [{ name: 'test-market', source: 'directory', location: 'owner/repo' }],
        plugins: [{ id: 'plain@test-market', name: 'plain', marketplace: 'test-market', description: 'A user-chosen plugin',
          author: 'Source author', version: '1.0.0', installed, enabled: installed, scope: installed ? 'user' : '' }],
      })
      bridge.mods.claudePreview = async (action, value) => ({ ok: true, action, value, source: action === 'add' ? value : 'test-market',
        command: `"C:\\Program Files\\Claude\\claude.exe" plugin ${action === 'add' ? 'marketplace add' : action} ${value} --scope user --json`,
        warning: 'Plugins can run code. Review the source before approving.' })
      bridge.mods.claudeExecute = async (action, value, command, sha256) => {
        window.__marketCalls.push({ action, value, command, sha256 })
        if (action === 'install' && !sha256) return { ok: false, answer: 'Needs command approval', needsCommand: {
          command: 'printf safe-fixture', sha256: 'a'.repeat(64),
          confirmationLine: `${command} --accept-command ${'a'.repeat(64)}`, } }
        if (action === 'install') installed = true
        return { ok: true, answer: 'Claude Code completed the request.' }
      }
      document.getElementById('root').style.display = 'none'
      const mount = document.createElement('div')
      mount.id = 'store-interaction-check'
      mount.style.cssText = 'max-width:650px;margin:60px auto;padding:20px;'
      document.body.append(mount)
      dom.createRoot(mount).render(react.createElement(Store))
    })
    await page.getByRole('button', { name: 'Browse Claude Code marketplaces' }).click()
    await page.getByRole('region', { name: 'Claude Code marketplace: test-market' }).getByText('Source author').waitFor()
    assert.equal(await page.evaluate(() => window.__marketCalls.length), 0)
    report.checks.push('Catalogue appears under its Claude Code source only after explicit Browse; no install command ran')
    await page.getByRole('textbox', { name: 'Claude Code marketplace repository' }).fill('owner/repo')
    await page.getByRole('button', { name: 'Review source…' }).click()
    const card = page.getByRole('dialog', { name: 'Review Claude Code marketplace command' })
    await card.waitFor()
    assert.match(await card.innerText(), /marketplace add owner\/repo --scope user --json/)
    assert.equal(await page.evaluate(() => window.__marketCalls.length), 0)
    await card.getByRole('button', { name: 'Cancel' }).click()
    assert.equal(await page.evaluate(() => window.__marketCalls.length), 0)
    report.checks.push('Cancelling the exact-command permission card adds no marketplace')
    await page.getByRole('button', { name: 'Review source…' }).click()
    await card.getByRole('button', { name: 'Run this CLI command' }).click()
    await page.getByRole('status').getByText('Claude Code completed the request.').waitFor()
    assert.equal(await page.evaluate(() => window.__marketCalls.length), 1)
    await page.getByRole('button', { name: 'Review install of plain@test-market' }).click()
    await card.waitFor()
    assert.match(await card.innerText(), /plugin install plain@test-market/)
    assert.equal(await page.evaluate(() => window.__marketCalls.length), 1)
    await card.getByRole('button', { name: 'Run this CLI command' }).click()
    await card.getByRole('button', { name: 'Approve this command' }).waitFor()
    assert.match(await card.innerText(), /printf safe-fixture/)
    assert.match(await card.innerText(), /sha256 a{64}/)
    await page.screenshot({ path: path.join(QA, 'marketplace-second-consent-1536x824.png') })
    assert.equal(await page.evaluate(() => window.__marketCalls.length), 2)
    await card.getByRole('button', { name: 'Approve this command' }).click()
    await page.getByRole('button', { name: 'Review update for plain@test-market' }).waitFor()
    assert.deepEqual(await page.evaluate(() => window.__marketCalls.map(call => [call.action, !!call.sha256])),
      [['add', false], ['install', false], ['install', true]])
    report.checks.push('Each source/install request needs a card; marketplace-declared shell command needs a second pinned approval')
    assert.deepEqual(report.errors, [])
  } catch (error) { report.failure = error.stack; process.exitCode = 1 }
  finally { fs.writeFileSync(path.join(QA, 'marketplace-ui-results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await browser.close() }
})()
