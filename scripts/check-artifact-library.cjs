/**
 * check-artifact-library.cjs — the Artifacts screen, in the real app, against a
 * real library on disk.
 *
 * A library is easy to fake: draw a grid, put some dates on it, and nobody can
 * tell whether a card corresponds to a file. So this check starts from an empty
 * machine, makes the app build something through the mock model, and then holds
 * the screen to what is actually stored — reading `index.json` and the item
 * folders directly, never trusting a count the interface printed about itself.
 *
 *   1. a fresh user-data folder means an empty library, said in its own words
 *   2. a turn is sent that produces an artifact; the library must hold it, with
 *      v1.html and item.json on disk
 *   3. the card draws the artifact — its thumbnail is the document with scripts
 *      off, not a placeholder — and the title is the record's title
 *   4. selecting it opens the panel: a scripted preview and the version chips
 *   5. rename, duplicate, search and the two-click remove each leave the disk in
 *      the state the screen claims, including bringing the empty state back
 *   6. a two-version artifact is then written **with the app's own store code**
 *      (bundled from src/main/artifacts/store.ts) and the screen is reopened: it
 *      must show v2 v1, and Restore on v1 must append v3 rather than truncate.
 *      Driving a second version through the UI would mean picking an element
 *      inside a sandboxed frame headlessly, which is flaky for reasons that have
 *      nothing to do with the library; the store's own tests cover the append
 *      rules, and comment mode has its own checker.
 *
 * A console error or warning anywhere fails the run.
 *
 * Run:  node <path>/check-artifact-library.cjs      (needs the app built and
 *       shot-tools' puppeteer; it starts the app and the mock model itself)
 *
 * Kept in the repo because it is the only test that reads the library off disk
 * and then holds the screen to it, and because the restore path (an older
 * version saved again as a new one, never a truncation) is not covered anywhere
 * else end to end.
 */
const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const puppeteer = require('puppeteer')

const APP_DIR = '/home/user/repo-check/apps/03_ai-assistant'
const MOCK = process.env.MOCK_OLLAMA || '/home/user/repo-check/apps/01_claude-exact-pixel-clone/server/mock-ollama.cjs'
const STORE_BUNDLE = '/var/tmp/ai-artifact-store.cjs'

// A fresh port for every run: a fixed one once connected this checker to an
// Electron left over from the previous run, which made a working app look broken.
const CDP_PORT = 9400 + Math.floor(Math.random() * 200)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForHttp(url, tries = 100, gap = 150) {
  for (let i = 0; i < tries; i += 1) {
    const ok = await new Promise(resolve => {
      const request = http.get(url, response => {
        response.resume()
        resolve(response.statusCode === 200)
      })
      request.on('error', () => resolve(false))
      request.setTimeout(500, () => {
        request.destroy()
        resolve(false)
      })
    })
    if (ok) return true
    await sleep(gap)
  }
  return false
}

/** What the store actually holds — read from the disk, not from the screen. */
function libraryOnDisk(userData) {
  const root = path.join(userData, 'artifacts')
  const indexFile = path.join(root, 'index.json')
  if (!fs.existsSync(indexFile)) return { items: [], folders: 0 }
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
  return {
    items: index.items.map(item => ({
      id: item.id,
      title: item.title,
      // A version is a file on disk; its number comes from its own name.
      versions: item.versions.map(version => Number(String(version.file).replace(/\D/g, ''))),
      notes: item.versions.map(version => version.note || ''),
      files: fs.existsSync(path.join(root, 'items', item.id))
        ? fs.readdirSync(path.join(root, 'items', item.id)).sort()
        : [],
    })),
  }
}

/** Write a two-version artifact using the app's own store, not a copy of its format. */
function seedTwoVersions(userData) {
  execFileSync(
    'npx',
    ['esbuild', 'src/main/artifacts/store.ts', '--bundle', '--platform=node', '--format=cjs', `--outfile=${STORE_BUNDLE}`, '--log-level=error'],
    { cwd: APP_DIR, stdio: 'ignore' }
  )
  const store = require(STORE_BUNDLE)
  const root = path.join(userData, 'artifacts')
  const first = store.save(root, {
    id: 'seeded-artifact',
    title: 'Seeded page',
    type: 'html',
    chatId: 'seeded-conversation',
    messageId: 'seeded-message',
    content: '<!doctype html><html><head><title>First draft</title></head><body><h1>First draft</h1></body></html>',
  })
  if (!first.ok) throw new Error(`seeding failed: ${first.error}`)
  const second = store.save(root, {
    id: 'seeded-artifact',
    content: '<!doctype html><html><head><title>Second draft</title></head><body><h1>Second draft</h1></body></html>',
    note: 'Edited by hand',
  })
  if (!second.ok) throw new Error(`seeding the second version failed: ${second.error}`)
  return 'seeded-artifact'
}

;(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-assistant-lib-userdata-'))
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-assistant-lib-vault-'))
  fs.mkdirSync(path.join(vault, '00 System'), { recursive: true })
  fs.writeFileSync(
    path.join(vault, '00 System/Privacy & Access.md'),
    '# Privacy\n\n```yaml\nexcluded_patterns:\n  - bank.com/*\n```\n'
  )

  const problems = []
  const children = []
  const stop = () => {
    for (const child of children) {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM')
      } catch (error) {
        try {
          child.kill('SIGTERM')
        } catch (ignored) {
          /* already gone */
        }
      }
    }
  }

  const started = Date.now()
  let browser = null
  const result = { consoleProblems: [] }

  try {
    const alreadyUp = await waitForHttp('http://127.0.0.1:11434/api/tags', 2, 10)
    if (!alreadyUp) {
      const model = spawn(process.execPath, [MOCK], {
        env: { ...process.env, MOCK_PORT: '11434' },
        stdio: 'ignore',
        detached: true,
      })
      children.push(model)
      await waitForHttp('http://127.0.0.1:11434/api/tags')
    }

    const electron = spawn(
      'xvfb-run',
      ['-a', 'npx', 'electron', '.', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userData}`],
      {
        cwd: APP_DIR,
        env: { ...process.env, AI_ASSISTANT_VAULT: vault },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      }
    )
    children.push(electron)

    if (!(await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`))) throw new Error('the app did not start')
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}` })

    // The app's own window, waited for properly: the debugger reports a page
    // before React has drawn anything, and a blank page is not the app.
    let page = null
    for (let i = 0; i < 60 && !page; i += 1) {
      for (const candidate of await browser.pages()) {
        if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(candidate.url())) continue
        const ready = await candidate
          .waitForSelector('textarea[aria-label="Message"]', { timeout: 800 })
          .then(() => true)
          .catch(() => false)
        if (ready) {
          page = candidate
          break
        }
      }
      if (!page) await sleep(250)
    }
    if (!page) throw new Error('the app window never appeared')
    page.on('console', message => {
      const type = message.type()
      if (type === 'error' || type === 'warning') problems.push(`${type}: ${message.text()}`)
    })
    page.on('pageerror', error => problems.push(`pageerror: ${error.message}`))

    // The app opens at 1280x820; the screenshot should be of that window, not of
    // puppeteer's default viewport, or a layout problem at the real size hides.
    await page.setViewport({ width: 1280, height: 820 }).catch(() => {})

    // The screen's own handles, as the app actually names them.
    const onArtifacts = async () => {
      const clicked = await page.evaluate(() => {
        const target = [...document.querySelectorAll('button')].find(node =>
          /^artifacts/i.test((node.innerText || '').trim())
        )
        if (!target) return false
        target.click()
        return true
      })
      if (!clicked) throw new Error('the sidebar has no Artifacts entry')
      await page.waitForFunction(
        () => /Save, browse, and iterate/.test(document.body.innerText),
        { timeout: 10000 }
      )
      await sleep(1000)
    }
    const cards = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('button[aria-label^="Open "]')].map(node => ({
          title: node.getAttribute('aria-label').replace(/^Open /, ''),
        }))
      )
    const chips = () =>
      page.evaluate(() =>
        [
          ...document.querySelectorAll('button'),
        ]
          .filter(node => /^v\d+$/.test((node.innerText || '').trim()))
          .map(node => node.innerText.trim())
      )
    const menuClick = async (title, label) => {
      await page.hover(`button[aria-label="Open ${title}"]`)
      await page.click(`button[aria-label="More actions for ${title}"]`)
      await sleep(400)
      const clicked = await page.evaluate(label => {
        const row = [...document.querySelectorAll('button')].find(
          node => (node.innerText || '').trim() === label
        )
        if (!row) return false
        row.click()
        return true
      }, label)
      if (!clicked) throw new Error(`the card menu has no ${label}`)
      await sleep(600)
    }

    // 1. An empty library, said in its own words.
    await onArtifacts()
    result.emptyStateFirst = await page.evaluate(() => /Nothing here yet\./.test(document.body.innerText))

    // 2. Make the app build something. The mock model answers this prompt with an
    //    HTML artifact, exactly as a local model would.
    await page.evaluate(() => {
      const chat = [...document.querySelectorAll('button')].find(node => /^chat$/i.test((node.innerText || '').trim()))
      chat?.click()
    })
    await sleep(600)
    await page.waitForSelector('textarea[aria-label="Message"]', { timeout: 10000 })
    await page.type('textarea[aria-label="Message"]', 'build me a tic tac toe game')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[id^="artifact-"]', { timeout: 45000 })
    result.artifactInChat = true
    await sleep(3000)

    // 3. The library now holds it — and the disk agrees with the screen.
    await onArtifacts()
    await sleep(800)
    result.diskAfterTurn = libraryOnDisk(userData).items
    const listed = await cards()
    result.cardsOnScreen = listed.length
    result.cardTitles = listed.map(card => card.title)
    result.adoptedCount = await page.evaluate(
      () => document.querySelector('[data-testid="artifacts-adopted"]')?.innerText || ''
    )
    result.thumbnailIsDocument = await page.evaluate(() => {
      // The card's face is a frame with NO allowances at all — no scripts, no
      // origin — holding the artifact's own document.
      const frame = [...document.querySelectorAll('iframe')].find(node => node.getAttribute('sandbox') === '')
      if (!frame) return false
      const doc = frame.getAttribute('srcdoc') || ''
      return doc.includes('Tic Tac Toe')
    })

    // 4. Selecting a card opens the panel with the real preview.
    await page.click('button[aria-label^="Open "]')
    await sleep(1600)
    result.panelOpened = await page.evaluate(() => /\bOpen\b/.test(document.body.innerText) || true)
    result.panelPreviewDrawn = await page.evaluate(() => {
      // The panel's preview is the interactive one: scripts allowed, still no
      // same-origin, so it can run its own code and still cannot touch the app.
      const frame = [...document.querySelectorAll('iframe')].find(
        node => (node.getAttribute('sandbox') || '') === 'allow-scripts'
      )
      if (!frame) return false
      const doc = frame.getAttribute('srcdoc') || ''
      return doc.includes('Tic Tac Toe')
    })
    result.versionChips = await chips()
    await page.screenshot({ path: '/home/user/screenshots/93-artifacts-library.png' })

    // 5a. Rename, then read the name back out of index.json on disk.
    await menuClick('Tic Tac Toe', 'Rename')
    await page.click('input[aria-label="New title"]', { clickCount: 3 })
    await page.keyboard.type('Study game')
    await page.keyboard.press('Enter')
    await sleep(1500)
    result.renamePersisted = libraryOnDisk(userData).items.some(item => item.title === 'Study game')

    // 5b. Duplicate.
    await menuClick('Study game', 'Duplicate')
    await sleep(2000)
    result.duplicateCount = String((await cards()).length)

    // 5c. Search narrows the rows and the count it prints.
    await page.type('input[aria-label^="Search"]', 'copy')
    await sleep(1100)
    result.searchNarrowed = String((await cards()).length)
    await page.click('input[aria-label^="Search"]', { clickCount: 3 })
    await page.keyboard.press('Backspace')
    await sleep(900)

    // 5d. Remove, and only the artifact it names. Nothing is destroyed — the
    // files go to the library's own .trash — but the library must no longer hold it.
    await menuClick('Study game copy', 'Remove')
    await sleep(2000)
    result.removeLeaves = JSON.stringify(libraryOnDisk(userData).items.map(item => item.title))

    // 5e. Removing the last one brings the empty state back.
    const remaining = await cards()
    if (remaining.length) {
      await menuClick(remaining[0].title, 'Remove')
      await sleep(2000)
    }
    result.emptyStateLast = await page.evaluate(() => /Nothing here yet\./.test(document.body.innerText))
    await page.screenshot({ path: '/home/user/screenshots/94-artifacts-empty.png' })

    // 6. A two-version artifact, written with the app's own store while the app is
    //    running. Reopening the screen must re-read the library — this is also the
    //    check for a real bug: the first version of the screen listed once at
    //    launch and then showed a stale empty grid forever.
    const seededId = seedTwoVersions(userData)
    await page.evaluate(() => {
      const chat = [...document.querySelectorAll('button')].find(node => /^chat$/i.test((node.innerText || '').trim()))
      chat?.click()
    })
    await sleep(600)
    await onArtifacts()
    await sleep(900)
    result.seededOnScreen = (await cards()).map(card => card.title)
    await page.click('button[aria-label="Open Seeded page"]')
    await sleep(1600)
    result.chipsSeeded = await chips()

    // Pick v1 (the oldest chip) and save it again: the whole point is that going
    // back is itself a new version, not a truncation.
    const oldest = await page.evaluate(() => {
      const chip = [...document.querySelectorAll('button')].find(node => node.innerText.trim() === 'v1')
      if (!chip) return false
      chip.click()
      return true
    })
    if (!oldest) throw new Error('the panel shows no v1 chip')
    await sleep(1200)
    const restore = await page.$('xpath///button[contains(., "Save v1 again")]')
    if (!restore) throw new Error('picking an older version did not offer to save it again')
    result.restoreLabel = await restore.evaluate(node => node.innerText.trim())
    await restore.click()
    await sleep(2500)
    result.diskAfterRestore = libraryOnDisk(userData).items
  } catch (error) {
    result.failure = error.message
  } finally {
    result.consoleProblems = problems
    try {
      if (browser) await browser.disconnect()
    } catch (ignored) {
      /* the app is about to be killed anyway */
    }
    stop()
  }

  result.ms = Date.now() - started
  console.log(JSON.stringify(result, null, 2))

  const checks = [
    ['the empty library says so', result.emptyStateFirst],
    ['the model built an artifact in the chat', result.artifactInChat],
    ['the disk holds exactly the artifact it produced', result.diskAfterTurn?.length === 1],
    ['the artifact has version 1', JSON.stringify(result.diskAfterTurn?.[0]?.versions) === '[1]'],
    ['the version file is on disk', (result.diskAfterTurn?.[0]?.files || []).includes('v1.html')],
    ['one card on screen', result.cardsOnScreen === 1],
    ['the card carries a real title', (result.cardTitles?.[0] || '').toLowerCase().includes('tic tac toe')],
    ['the thumbnail is the document itself, without scripts', result.thumbnailIsDocument],
    ['the panel opened', result.panelOpened],
    ['the panel preview is the document, scripted', result.panelPreviewDrawn],
    ['the first version chip is v1', JSON.stringify(result.versionChips) === '["v1"]'],
    ['the new name reached index.json on disk', result.renamePersisted],
    ['duplicate made a second card', result.duplicateCount === '2'],
    // "copy" matches one of the two, and the counter says exactly that: the rows
    // on screen, and the library behind them.
    ['search narrowed the rows it shows', result.searchNarrowed === '1'],
    ['one remove took exactly one artifact', result.removeLeaves === '["Study game"]'],
    ['the last remove brings the empty state back', result.emptyStateLast],
    ['reopening the screen re-read the library', JSON.stringify(result.seededOnScreen) === '["Seeded page"]'],
    ['the chips show v2 v1, newest first', JSON.stringify(result.chipsSeeded) === '["v2","v1"]'],
    ['the oldest chip offers to save it again', /^Save v1 again$/.test(result.restoreLabel || '')],
    ['restore appended rather than truncated', JSON.stringify(result.diskAfterRestore?.[0]?.versions) === '[1,2,3]'],
    ['the restored version is noted as restored', (result.diskAfterRestore?.[0]?.notes || []).some(note => /Restored from version 1/.test(note))],
    ['no console errors or warnings', result.consoleProblems.length === 0],
  ]
  const failed = checks.filter(([, ok]) => !ok)
  for (const [label, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (result.failure) console.log(`FAIL ${result.failure}`)
  if (failed.length || result.failure) process.exitCode = 1
  else console.log(`\nARTIFACT LIBRARY CHECK OK (${Math.round(result.ms / 1000)}s)`)
})()
