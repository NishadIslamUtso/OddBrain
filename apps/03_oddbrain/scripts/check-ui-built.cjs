// Built-app QA — the QA lane's driver. Runs the REAL build (electron-vite
// output) under xvfb, not the dev server:
//   A. every main screen (7 views) renders, no render-error, no overflow
//   B. all 18 settings sections open with real content
//   C. SPEC rev2 §2 size-table measurements (recorded as evidence — a
//      mismatch is a FIXLIST finding for the visual lane, not a taste call
//      and not a silent fix)
//   D. owner's bug #1 through the actual IPC layer: engine:pick-binary with
//      a fixture binary in a temp dir persists and beats every probe
//   E. owner's bug #2 through the actual IPC layer: serve-start writes the
//      pid of what the app spawned; serve-stop kills exactly that and never
//      an unrelated process
// Hard assertions: render/reachability/inventory/IPC laws. §2 numbers are
// measured and printed; deviations become FIXLIST rows, never local edits.
const { _electron } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')

const APP = path.resolve(__dirname, '..')
const QA = path.resolve(process.env.ODDBRAIN_QA_DIR || 'qa-ui')
fs.mkdirSync(QA, { recursive: true })
const ROOT = fs.mkdtempSync(path.join(QA + path.sep, 'built-qa-'))

const VIEWS = ['Chat', 'Artifacts', 'Today', 'Projects', 'Vault', 'Brain', 'Code']

;(async () => {
  let app
  const report = { phase: 'setup', errors: [], consoleErrors: [], views: [], sections: [], spec2: {}, ipc: {}, checks: [] }
  const note = (msg) => { report.checks.push(msg) }

  // Fixtures: a claude stand-in that answers --version, and an ollama
  // stand-in that answers the local door. Both live on PATH for the app.
  const bin = path.join(ROOT, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  const claudeFixture = path.join(bin, 'claude-code-pointed-fixture')
  fs.writeFileSync(claudeFixture, `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('2.1.300-pointed-fixture'); process.exit(0) }
process.exit(0)
`, { mode: 0o755 })
  const ollamaFixture = path.join(bin, 'ollama')
  fs.writeFileSync(ollamaFixture, `#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        b = b'{"models":[]}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def log_message(self, *args):
        pass
HTTPServer(('127.0.0.1', 11434), H).serve_forever()
`, { mode: 0o755 })

  const home = path.join(ROOT, 'home')
  const config = path.join(ROOT, 'config')
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(config, { recursive: true })

  try {
    app = await _electron.launch({
      executablePath: require('electron'),
      args: ['--no-sandbox', APP],
      cwd: APP,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: config,
        AI_ASSISTANT_API_PORT: '0',
        AI_ASSISTANT_EXTENSION_PORT: '0',
        PATH: bin + path.delimiter + process.env.PATH,
      },
    })
    const p = await app.firstWindow()
    p.setDefaultTimeout(15000)
    p.on('pageerror', (e) => report.errors.push(e.message))
    p.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text()) })
    await p.waitForLoadState('domcontentloaded')
    await p.waitForFunction(() => !!window.engineApi?.read)
    await p.evaluate(() => {
      localStorage.setItem('ai-assistant.welcomed', 'true')
      localStorage.setItem('ai-assistant.profile', JSON.stringify({ name: 'Friend' }))
    })
    await p.reload()
    await p.waitForFunction(() => !!window.engineApi?.read)
    await p.waitForTimeout(3200) // the opening finishes on its own clock

    const native = await app.evaluate(({ app }) => ({ userData: app.getPath('userData'), version: app.getVersion() }))
    report.native = native

    // ---- §2: home measurements before leaving Chat -----------------------
    const measure = (sel, prop) => `(() => {
      const el = document.querySelector(${JSON.stringify(sel)})
      if (!el) return null
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { value: cs[${JSON.stringify(prop)}], width: Math.round(r.width), height: Math.round(r.height) }
    })()`
    report.spec2.homeHeading = await p.evaluate(`(() => {
      const h = document.querySelector('h1'); if (!h) return null
      const cs = getComputedStyle(h)
      return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, text: (h.textContent || '').slice(0, 40) }
    })()`)
    report.spec2.sidebar = await p.evaluate(measure('.ob-sidebar', 'width'))
    report.spec2.titlebar = await p.evaluate(measure('.ob-titlebar', 'height'))
    report.spec2.send = await p.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => (x.getAttribute('aria-label') || x.textContent || '').trim() === 'Send')
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { width: Math.round(r.width), height: Math.round(r.height) }
    })()`)
    report.spec2.composerRadius = await p.evaluate(`(() => {
      const el = document.querySelector('textarea, [contenteditable="true"]')
      return el ? getComputedStyle(el).borderRadius : null
    })()`)
    report.spec2.conversationWidth = await p.evaluate(`(() => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--chat-width').trim()
      return v || getComputedStyle(document.body).getPropertyValue('--chat-width').trim()
    })()`)
    report.spec2.bodyFont = await p.evaluate(`(() => {
      const el = document.querySelector('nav, .ob-sidebar')
      return el ? getComputedStyle(el).fontSize : null
    })()`)

    // ---- A. every main screen --------------------------------------------
    report.phase = 'views'
    for (const view of VIEWS) {
      await p.keyboard.press('Control+k')
      await p.getByRole('textbox', { name: 'Search chats and screens', exact: true }).fill(view)
      await p.locator('.ob-command-results>button').filter({ hasText: new RegExp('^' + view) }).first().click()
      await p.waitForTimeout(120)
      const g = await p.evaluate(() => ({
        root: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        renderErrors: document.querySelectorAll('.ob-render-error').length,
        content: (document.querySelector('.ob-shell-content')?.innerText || '').trim().length,
        view: JSON.parse(localStorage.getItem('ai-assistant.view') || 'null'),
      }))
      report.views.push({ view, ...g })
      assert.equal(g.renderErrors, 0, `view ${view}: no error boundary`)
      assert.ok(g.content >= 16, `view ${view}: shell content rendered (got ${g.content} chars)`)
      assert.ok(g.root <= g.viewport + 2, `view ${view}: no horizontal overflow (${g.root} vs ${g.viewport})`)
      // The default view is only written once the app has left and returned
      // to it — a first visit to Chat may read null, every other switch must
      // persist (that is the regression-sensitive part).
      const expected = view.toLowerCase()
      assert.ok(g.view === expected || (g.view === null && expected === 'chat'),
        `view ${view}: the app records the switch (got ${JSON.stringify(g.view)})`)
    }
    note(`All ${VIEWS.length} main screens render in the built app: content, no error boundaries, no horizontal overflow`)

    // ---- B. all 18 settings sections -------------------------------------
    report.phase = 'sections'
    await p.keyboard.press('Control+,')
    const sectionButtons = p.locator('.ob-settings-navigation button[aria-label^="Section:"]')
    const count = await sectionButtons.count()
    report.sectionCount = count
    assert.equal(count, 18, 'exactly 18 settings sections (inventory)')
    for (let i = 0; i < count; i++) {
      const btn = sectionButtons.nth(i)
      const title = (await btn.getAttribute('aria-label')).replace(/^Section: /, '')
      await btn.click()
      await p.waitForTimeout(90)
      const pane = await p.evaluate(() => {
        const el = document.querySelector('.ob-settings-content')
        const text = (el?.innerText || '').trim()
        const heading = document.querySelector('.ob-settings-content h1, .ob-settings-content header h1, .ob-settings-content h2')
        const cs = heading ? getComputedStyle(heading) : null
        return { chars: text.length, renderErrors: document.querySelectorAll('.ob-render-error').length, headingFontSize: cs ? cs.fontSize : null }
      })
      report.sections.push({ title, ...pane })
      assert.equal(pane.renderErrors, 0, `section ${title}: no error boundary`)
      assert.ok(pane.chars >= 16, `section ${title}: real content (got ${pane.chars} chars)`)
    }
    // §2 settings geometry, measured for evidence.
    report.spec2.settingsHeading = await p.evaluate(`(() => {
      const h = document.querySelector('.ob-settings-content h1, .ob-settings-content header h1, .ob-settings-content h2')
      return h ? getComputedStyle(h).fontSize : null
    })()`)
    report.spec2.settingsNav = await p.evaluate(measure('.ob-settings-navigation', 'width'))
    report.spec2.settingsPadding = await p.evaluate(`(() => {
      const el = document.querySelector('.ob-settings-content')
      return el ? getComputedStyle(el).paddingLeft : null
    })()`)
    await p.getByRole('button', { name: 'Close settings', exact: true }).click()
    note(`All ${count} settings sections open in the built app with real content`)

    // ---- D. engine:pick-binary through the real IPC layer -----------------
    report.phase = 'ipc-pick'
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, claudeFixture)
    const picked = await p.evaluate((id) => window.engineApi.pickBinary(id), 'claude-code')
    report.ipc.pick = picked
    assert.equal(picked.ok, true, 'pick-binary answers ok')
    assert.equal(picked.path, claudeFixture, 'pick-binary returns the pointed fixture')
    const override = await p.evaluate((id) => window.engineApi.binaryOverride(id), 'claude-code')
    assert.equal(override.path, claudeFixture, 'the override in main memory is the fixture')
    const stored = JSON.parse(fs.readFileSync(path.join(native.userData, 'engine-binaries.json'), 'utf8'))
    assert.equal(stored['claude-code'], claudeFixture, 'engine-binaries.json persists the pick')
    const detect = await p.evaluate((fresh) => window.engineApi.detect(fresh), true)
    const entry = (detect || []).find((e) => e.id === 'claude-code')
    report.ipc.detect = entry
    assert.ok(entry && entry.found, 'detection finds the engine after the pick')
    assert.equal(entry.path, claudeFixture, 'the pointed binary beats every probe — detection reports it')
    const cleared = await p.evaluate((id) => window.engineApi.clearBinary(id), 'claude-code')
    assert.equal(cleared.ok, true, 'clear-binary answers ok')
    const clearedStored = JSON.parse(fs.readFileSync(path.join(native.userData, 'engine-binaries.json'), 'utf8'))
    assert.equal(clearedStored['claude-code'], '', 'clear-binary persists the reset')
    note('engine:pick-binary (fixture in a temp dir) persists, beats every probe, and clears honestly — real IPC')

    // ---- E. serve start/stop through the real IPC layer --------------------
    report.phase = 'ipc-serve'
    const portBusy = await new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:11434/api/version', (res) => { res.resume(); resolve(true) })
      req.on('error', () => resolve(false))
      req.setTimeout(800, () => { req.destroy(); resolve(false) })
    })
    if (portBusy) {
      report.ipc.serve = { skipped: 'something already answers 127.0.0.1:11434 here — not the app, not ours to kill' }
      note('serve start/stop skipped: port 11434 is already answered in this environment (reported, not forced)')
    } else {
      const control = spawn('sleep', ['300'], { stdio: 'ignore' })
      try {
        const started = await p.evaluate(() => window.engineApi.downloads.serveStart())
        report.ipc.serveStart = started
        assert.equal(started.ok, true, 'serve-start answers ok')
        const pidFile = path.join(native.userData, 'ollama', 'serve.pid')
        const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
        assert.ok(Number.isInteger(pid) && pid > 0, 'serve-start writes a real pid')
        assert.notEqual(pid, control.pid, 'the pid file is the app spawn, never the unrelated process')
        assert.match(started.answer, /pid/, 'the answer names the pid')

        const stopped = await p.evaluate(() => window.engineApi.downloads.serveStop())
        report.ipc.serveStop = stopped
        assert.equal(stopped.ok, true, 'serve-stop answers ok')
        await new Promise((r) => setTimeout(r, 400))

        let appSpawnAlive = true
        try { process.kill(pid, 0) } catch { appSpawnAlive = false }
        assert.equal(appSpawnAlive, false, 'the process the app started is gone')

        let controlAlive = true
        try { process.kill(control.pid, 0) } catch { controlAlive = false }
        assert.equal(controlAlive, true, 'the unrelated process the app did NOT start keeps running')

        assert.equal(fs.existsSync(pidFile), false, 'the pid file is cleared')
        const again = await p.evaluate(() => window.engineApi.downloads.serveStop())
        report.ipc.serveStopAgain = again
        assert.equal(again.ok, false, 'a second stop refuses — the app is not starting/stopping what it never started')
        note('serve-start writes the app-spawned pid; serve-stop kills exactly it and leaves the unrelated process alive — real IPC')
      } finally {
        try { process.kill(control.pid, 'SIGKILL') } catch { /* gone */ }
      }
    }

    await p.screenshot({ path: path.join(QA, 'built-app-final.png') })
    assert.equal(report.errors.length, 0, 'zero page errors across every driven screen and section')
    report.ok = true
  } catch (e) {
    report.failure = e.stack || String(e)
    report.ok = false
    console.error(e.stack || e)
    process.exitCode = 1
  } finally {
    if (app) await app.close().catch(() => {})
    try { fs.rmSync(ROOT, { recursive: true, force: true }) } catch { /* keep QA evidence */ }
    fs.writeFileSync(path.join(QA, 'built-app-results.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  }
})()
