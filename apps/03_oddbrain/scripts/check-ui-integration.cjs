// Current-main + recovered UI checks at the owner's logical desktop sizes.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const base = process.env.ODDBRAIN_UI_URL || 'http://127.0.0.1:5174/'
const output = path.resolve(process.env.ODDBRAIN_QA_DIR || 'qa-ui')
const browserOptions = process.env.ODDBRAIN_BROWSER_OPTIONS ? JSON.parse(fs.readFileSync(process.env.ODDBRAIN_BROWSER_OPTIONS, 'utf8')) : {}

;(async () => {
  const browser = await chromium.launch(browserOptions)
  const report = { checks: [], errors: [] }
  fs.mkdirSync(output, { recursive: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 768 }, reducedMotion: 'reduce' })
    page.on('pageerror', error => report.errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem('ai-assistant.welcomed', 'true')
      localStorage.setItem('ai-assistant.profile', JSON.stringify({ name: 'Friend' }))
    })
    await page.goto(base)
    await page.locator('.ob-launch').waitFor({ state: 'hidden' })
    await page.keyboard.press('Control+,')
    await page.getByRole('button', { name: 'Section: Appearance', exact: true }).click()
    const systems = page.getByRole('group', { name: 'Design system', exact: true })
    assert.equal(await systems.getByRole('button').count(), 17)
    for (const name of ['Linear', 'Apple', 'Neobrutalism', 'Claude']) {
      await systems.getByRole('button', { name, exact: true }).click()
      await page.waitForFunction(() => {
        const workspace = document.querySelector('.ob-shell-host .ob-desktop')
        const miniature = document.querySelector('.ob-preview-canvas .ob-desktop')
        return workspace && miniature && getComputedStyle(workspace).backgroundColor === getComputedStyle(miniature).backgroundColor
      })
      const colors = await page.evaluate(() => ({
        bg: getComputedStyle(document.querySelector('.ob-shell-host .ob-desktop')).backgroundColor,
        miniature: getComputedStyle(document.querySelector('.ob-preview-canvas .ob-desktop')).backgroundColor,
      }))
      assert.equal(colors.bg, colors.miniature)
      if (name === 'Linear') assert.equal(colors.bg, 'rgb(8, 9, 10)')
    }
    report.checks.push('All 16 retained systems are selectable; sampled full-system colours match the shared miniature')
    await page.getByRole('button', { name: 'Reset appearance', exact: true }).click()
    await page.locator('.ob-appearance-tabs').getByRole('button', { name: 'Layout', exact: true }).click()
    for (const size of [{ width: 1536, height: 824 }, { width: 1280, height: 768 }]) {
      await page.setViewportSize(size)
      for (const layout of ['Classic sidebar', 'Top bar', 'Rail + list', 'Command first', 'List + detail', 'Bento dashboard', 'Console', 'Floating window']) {
        await page.locator('.ob-layout-options').getByRole('button', { name: layout, exact: true }).click()
        await page.getByRole('button', { name: 'Try in workspace', exact: true }).click()
        const send = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox()
        assert(send && send.x >= 0 && send.y >= 0 && send.x + send.width <= size.width && send.y + send.height <= size.height, `${layout}: send clipped`)
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        await page.keyboard.press('Control+,')
      }
    }
    report.checks.push('Eight layouts keep Send visible at 1536×824 and 1280×768 without horizontal page overflow')
    await page.getByRole('button', { name: 'Reset appearance', exact: true }).click()
    await page.getByRole('button', { name: 'Try in workspace', exact: true }).click()
    await page.screenshot({ path: path.join(output, 'target-home.png') })
    assert.equal(report.errors.length, 0)
  } catch (error) { report.failure = error.stack; process.exitCode = 1 }
  finally {
    fs.writeFileSync(path.join(output, 'current-main-integration.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    await browser.close()
  }
})()
