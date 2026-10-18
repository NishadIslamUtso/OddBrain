/**
 * UI smoke test — renders the whole app in jsdom and fails on any console
 * error or uncaught exception.
 *
 * There is no browser in the sandbox, so the app is bundled with esbuild
 * (already present as a transitive dependency of Vite) and driven inside
 * jsdom with a stubbed fetch.
 *
 * jsdom is NOT a declared dependency on purpose — the target machine has a
 * slow connection, and this test is a nicety, not a gate. Install it when you
 * want to run it:
 *
 *     npm i -D jsdom && npm run test:ui
 *
 * Without jsdom the file skips cleanly.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

let jsdom, esbuild
try {
  jsdom = require('jsdom')
  esbuild = require('esbuild')
} catch (e) {
  test('UI smoke test', { skip: 'jsdom/esbuild not installed — run `npm i -D jsdom` to enable' }, () => {})
  return
}

const ROOT = path.join(__dirname, '..')
const errors = []

function bundle() {
  const result = esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'src', 'main.jsx')],
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    loader: { '.jsx': 'jsx', '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    write: false,
    logLevel: 'silent',
  })
  return result.outputFiles[0].text
}

function ndjson(lines) {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(JSON.stringify(l) + '\n'))
      c.close()
    },
  })
}

/** Build a jsdom window whose fetch answers like a local Ollama + vault API. */
function makeDom() {
  const { JSDOM, VirtualConsole } = jsdom
  const vc = new VirtualConsole()
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)))
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')))

  const dom = new JSDOM(
    '<!doctype html><html data-theme="dark"><head></head><body><div id="root"></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:5173/', virtualConsole: vc },
  )
  const { window } = dom
  const doc = window.document

  const payload = async (u, opts = {}) => {
    if (u.includes('/tags'))
      return { models: [{ name: 'qwen2.5:3b', size: 2e9, details: {} }, { name: 'qwen3-vl:4b', size: 3e9, details: {} }] }
    if (u.includes('/show')) {
      const name = JSON.parse(opts?.body || '{}').model || ''
      return { details: { family: 'qwen2' }, capabilities: /vl|vision/i.test(name) ? ['completion', 'vision'] : ['completion'] }
    }
    if (u.includes('/status')) return { ok: true, vault: '/tmp/vault', counts: { files: 3, entities: 1 } }
    if (u.includes('/today'))
      return {
        date: '2026-10-11',
        snapshot: 'Working on the Claude clone.',
        openLoops: '- [ ] Follow-up: [[gym-plan]] - next check 2026-10-12',
        followups: [{ topic: 'Follow-up: gym-plan', next_check: '2026-10-12', last_update: '' }],
        journal: '',
        journalPath: '08 Journal/2026/2026-10-11.md',
        vault: '/tmp/vault',
      }
    if (u.includes('/blacklist')) return { excluded_patterns: ['bank.com/*'] }
    if (u.includes('/capsules')) return { items: [{ id: 'c1', title: 'Workout plan', type: 'capsule' }] }
    if (u.includes('/context')) return { capsules: [], entities: [] }
    if (u.includes('/capture')) return { ok: true, source: '02 Sources/Conversations/AI ASSISTANT/2026/x.md', duplicate: false }
    return { ok: true }
  }

  window.fetch = async (url, opts) => {
    const u = String(url)
    if (u.includes('/chat')) {
      const body = JSON.parse(opts.body)
      const subAgent = /sub-agent/i.test(JSON.stringify(body.messages))
      const reply = subAgent
        ? 'SUB-AGENT-OUTPUT-ONLY: two open questions in that plan.'
        : /\b(tic|tac|toe|game)\b/i.test(JSON.stringify(body.messages))
        ? 'Sure:\n\n```html\n<!doctype html><html><title>Tic Tac Toe</title><body>hi</body></html>\n```\n'
        : 'Sure — here is the answer.\n\n- one\n- two\n'
      const chunks = reply.match(/[\s\S]{1,25}/g) || []
      const lines = [
        ...chunks.map((c) => ({ message: { role: 'assistant', content: c }, done: false })),
        { message: { role: 'assistant', content: '' }, done: true },
      ]
      const enc = new TextEncoder()
      let index = 0
      // A real model arrives over time; pacing the stub keeps the streaming paths
      // (live artifacts, the stop button, the vision bridge) on the normal code path.
      const stream = new ReadableStream({
        async pull(controller) {
          if (index >= lines.length) return controller.close()
          await new Promise((resolve) => setTimeout(resolve, 4))
          controller.enqueue(enc.encode(JSON.stringify(lines[index++]) + '\n'))
        },
      })
      return { ok: true, status: 200, body: stream, json: async () => ({}), text: async () => '' }
    }
    return { ok: true, status: 200, json: async () => payload(u, opts), text: async () => JSON.stringify(await payload(u, opts)) }
  }
  // jsdom has no IndexedDB. Images sent to a model are persisted there, so the
  // vision-bridge path needs a stand-in that behaves like the real API.
  const imageStore = new Map()
  window.indexedDB = {
    open() {
      const request = {
        result: {
          transaction: () => {
            const tx = {
              objectStore: () => ({
                put: (value, key) => imageStore.set(key, value),
                get: (key) => { const get = {}; setTimeout(() => { get.result = imageStore.get(key); get.onsuccess?.() }, 0); return get },
              }),
            }
            setTimeout(() => tx.oncomplete?.(), 0)
            return tx
          },
          close() {},
        },
      }
      setTimeout(() => request.onsuccess?.(), 0)
      return request
    },
  }
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
  window.scrollTo = () => {}
  // jsdom implements neither Element.scrollTo nor scrollIntoView; browsers do.
  // The transcript auto-scroll calls Element.scrollTo on every render.
  window.Element.prototype.scrollTo = () => {}
  window.HTMLElement.prototype.scrollTo = () => {}
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.alert = () => {}
  window.confirm = () => true
  window.prompt = () => 'test-project'
  if (!window.TextDecoder) window.TextDecoder = require('node:util').TextDecoder

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  const byText = (sel, re) => [...doc.querySelectorAll(sel)].find((e) => re.test((e.textContent || '').trim()))
  const txt = () => doc.getElementById('root').textContent || ''
  const allText = () => doc.body.textContent || '' // dialogs are portalled to <body>
  const type = (el, value) => {
    // The composer is a textarea, but settings fields are <input>. React listens
    // for the native setter of the right prototype, so pick it by tag.
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  }
  const key = (el, k, o = {}) =>
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))

  /** Wait until the running response finishes (the Stop button disappears). */
  const waitIdle = async () => {
    await sleep(400)
    const settled = await waitFor(() => !doc.querySelector('[aria-label="Stop response"]'), 15_000)
    if (!settled) throw new Error('the response never finished')
    await sleep(200)
  }
  const waitFor = async (fn, timeout = 8000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (fn()) return true
      await sleep(100)
    }
    return false
  }
  /**
   * The composer is a controlled textarea: React must process the input event
   * before Enter is pressed, or the handler still sees the previous value.
   * It is also recreated when a new chat opens, so always take a live node.
   */
  const send = async (text) => {
    const el = [...doc.querySelectorAll('textarea')].find((t) => t.isConnected)
    type(el, text)
    await sleep(120)
    key(el, 'Enter')
    await sleep(120)
  }

  // jsdom keeps timers alive; without this the node process never exits
  const close = () => {
    try { window.close() } catch (e) { /* ignore */ }
  }

  return { dom, window, doc, sleep, click, byText, txt, allText, type, key, send, waitFor, waitIdle, close }
}

const CODE = bundle()

test('app renders the full shell without console errors', async () => {
  const { window, doc, sleep, txt, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(700)
    const text = txt()
    for (const needle of ['New', 'Projects', 'Artifacts', 'Today', 'Friend']) {
      assert.ok(text.includes(needle), `missing ${needle}`)
    }
    assert.ok(doc.querySelector('textarea'), 'composer missing')
    assert.ok(/How can I help you today\?/.test(doc.body.innerHTML), 'composer placeholder missing')
    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('a normal question produces no artifact; an explicit build request does', async () => {
  const { window, doc, sleep, send, waitFor, waitIdle, click, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(700)

    await send('explain the difference between RAM and VRAM')
    await waitIdle()
    assert.equal(doc.querySelectorAll('.artifact-message-card').length, 0, 'a normal question opened an artifact')

    await send('make me a tic tac toe game')
    await waitIdle()
    const cards = doc.querySelectorAll('.artifact-message-card').length
    assert.equal(cards, 1, 'the build request produced no artifact card; DOM tail = ' + doc.body.textContent.slice(-400) + ' notices=' + [...doc.querySelectorAll('.notice')].map(n => n.textContent).join('|'))

    click(doc.querySelector('.artifact-message-card'))
    assert.ok(await waitFor(() => doc.querySelector('iframe[title^="Artifact preview"]')), 'clicking the card did not open a sandboxed preview')
    assert.equal(doc.querySelector('iframe[title^="Artifact preview"]').getAttribute('sandbox'), 'allow-scripts')
    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('user menu, settings and the theme switch all work', async () => {
  const { window, doc, sleep, allText, click, byText, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(600)

    click(byText('button', /Friend/))
    await sleep(200)
    assert.match(allText(), /Friend · this browser only/)
    assert.match(allText(), /Get API keys/)

    click(byText('button', /^Settings/))
    await sleep(300)
    const t = allText() // the dialog is portalled to <body>, not inside #root
    assert.match(t, /Appearance/)
    assert.match(t, /Transcript text size/)
    assert.match(t, /Voice/)
    assert.match(t, /Buttery/)

    const themeButton = (name) => doc.querySelector(`[role="group"][aria-label="Theme"] button[aria-label="${name}"]`)
    click(themeButton('light'))
    await sleep(200)
    assert.equal(doc.documentElement.getAttribute('data-theme'), 'light')
    click(themeButton('dark'))
    await sleep(200)
    assert.equal(doc.documentElement.getAttribute('data-theme'), 'dark')
    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('the Today view opens with Alt+T and reads the vault', async () => {
  const { window, doc, sleep, allText, key, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(600)

    key(doc.body, 't', { altKey: true })
    await sleep(600)
    assert.ok(doc.querySelector('[role="dialog"]'), 'Alt+T did not open the Today view')
    const text = allText()
    assert.match(text, /Current snapshot/i)
    assert.match(text, /Open loops/i)
    assert.match(text, /Working on the Claude clone/, 'snapshot text from the vault API is missing')
    assert.match(text, /gym-plan/, 'parsed follow-up is missing')
    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('sidebar chat context menu offers the documented actions', async () => {
  const { window, doc, sleep, click, byText, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(600)

    const item = [...doc.querySelectorAll('.chat-item')].find((d) =>
      /Refining a 5-day workout cycle/.test(d.textContent || ''),
    )
    assert.ok(item, 'default chat row missing')
    item.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 300 }))
    await sleep(250)
    const labels = [...doc.querySelectorAll('button')].map((b) => (b.textContent || '').trim())
    for (const l of ['Open in new window', 'Pin', 'Rename', 'Add to project', 'Move to group', 'Delete']) {
      assert.ok(labels.some((x) => x.includes(l)), `missing menu item ${l}`)
    }

    click(byText('button', /^Pin[Pp]?$/))
    await sleep(300)
    assert.match(doc.getElementById('root').textContent, /Pinned/)
    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('a build request opens the live preview by itself and never asks for a click', async () => {
  const { window, doc, sleep, send, waitFor, waitIdle, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(700)

    await send('make me a tic tac toe game')
    // The whole point of the inline visualizer: the panel is already there while
    // the document is still being written, not only once the reply lands.
    const live = await waitFor(() => doc.querySelector('.live-badge'), 8000)
    const panelOpenEarly = Boolean(doc.querySelector('iframe[title^="Artifact preview"]'))
    await waitIdle()

    assert.ok(live || panelOpenEarly, 'the artifact panel did not open until the reply had finished')
    assert.ok(doc.querySelector('iframe[title^="Artifact preview"]'), 'no preview iframe after the reply')
    const frame = doc.querySelector('iframe[title^="Artifact preview"]')
    assert.match(frame.getAttribute('srcdoc') || '', /Tic Tac Toe/, 'the live preview did not carry the streaming document')
    assert.equal(doc.querySelectorAll('.artifact-message-card').length, 1, 'the finished artifact should appear exactly once')
    assert.equal(doc.querySelectorAll('.artifact-message-card.live').length, 0, 'the live card must be replaced by the saved one')
    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('a sub agent answers in its own context and leaves the transcript alone', async () => {
  const { window, doc, sleep, click, byText, send, waitFor, waitIdle, type, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(700)

    await send('explain the difference between RAM and VRAM')
    await waitIdle()
    const transcriptBefore = (doc.querySelector('.transcript') || {}).textContent || ''

    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'G', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    assert.ok(await waitFor(() => doc.querySelector('[aria-label="Sub agents"]'), 4000), 'Ctrl+Shift+G did not open the sub-agent panel')

    click(byText('button', /New sub agent/))
    await sleep(200)
    // Target the Task field by its label, never by index. Adding a field
    // above it once silently broke this test — it typed into the Instruction
    // box instead and the agent ran with an empty task.
    const task = [...doc.querySelectorAll('.agent-field')]
      .find(label => /^Task$/.test(label.querySelector('span')?.textContent || ''))
      ?.querySelector('textarea')
    assert.ok(task, 'the sub-agent task field is missing')
    type(task, 'List the open questions in the workout plan')
    await sleep(150)
    click(byText('button', /Run agent/))

    assert.ok(await waitFor(() => doc.querySelector('.agent-result'), 12_000), 'the sub agent produced no result')
    assert.match(doc.querySelector('.agent-result').textContent, /SUB-AGENT-OUTPUT-ONLY/)
    // Isolation is the whole feature: nothing may leak into the chat transcript.
    assert.doesNotMatch((doc.querySelector('.transcript') || {}).textContent || '', /SUB-AGENT-OUTPUT-ONLY/)
    assert.equal((doc.querySelector('.transcript') || {}).textContent, transcriptBefore, 'the sub-agent run changed the chat transcript')

    click(doc.querySelector('[aria-label="Insert result into the composer"]'))
    await sleep(250)
    const composer = [...doc.querySelectorAll('textarea')].find((t) => t.getAttribute('aria-label') === 'Message')
    assert.match(composer.value, /SUB-AGENT-OUTPUT-ONLY/, 'the insert button did not put the result in the composer')
    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('an image reaches a text-only model through the vision bridge, labelled', async () => {
  const { window, doc, sleep, send, waitFor, waitIdle, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(700)
    // Wait for the capability probe: names are never trusted, /api/show is.
    assert.ok(await waitFor(() => (window.localStorage.getItem('claude_exact_model_capabilities') || '').includes('vision'), 6000), 'the capability probe never verified a vision model')

    const file = new window.File([new Uint8Array([1, 2, 3, 4])], 'screenshot.png', { type: 'image/png' })
    const input = doc.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new window.Event('change', { bubbles: true }))
    await waitFor(() => doc.querySelector('.attachment-chip'), 4000)

    const chip = doc.querySelector('.attachment-chip').textContent
    assert.match(chip, /screenshot\.png/, 'the attachment chip is missing')
    assert.match(chip, /looks/, 'the chip does not name the model that will look at the picture')

    await send('what is in this screenshot?')
    await waitIdle()
    const text = doc.getElementById('root').textContent
    assert.match(text, /Image described by|described by qwen3-vl:4b/i, 'the bridge step is not reported in the transcript')
    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('a reply can be branched without touching the original chat', async () => {
  const { window, doc, sleep, click, byText, send, waitFor, waitIdle, allText, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(700)
    await send('explain RAM vs VRAM')
    await waitIdle()

    const branch = byText('.message-actions button', /Branch from here/)
    assert.ok(branch, 'no branch action on the response')
    click(branch)
    assert.ok(await waitFor(() => doc.querySelector('.chat-header small')?.textContent?.includes('Branch'), 4000), 'the branch chat did not open')
    assert.ok([...doc.querySelectorAll('.chat-item')].some((item) => /\(branch/.test(item.textContent || '')), 'the branch is not in the sidebar')
    assert.match(allText(), /Branched into a new chat/)
    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('the name is customizable and no native file control is ever visible', async () => {
  const { window, doc, sleep, click, byText, type, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(700)

    // Account menu -> Settings -> Account
    click(byText('button', /Friend/))
    await sleep(200)
    click(byText('button', /^Settings/))
    await sleep(300)
    click(byText('button', /^Account$/))
    await sleep(300)

    const name = doc.querySelector('input[aria-label="Your name"]')
    assert.ok(name, 'the Account section has no name field')
    type(name, 'Ada Lovelace')
    await sleep(300)

    // A fresh clone must never show the previous owner's name: the sidebar is the proof.
    const button = doc.querySelector('.account-button')
    assert.ok(button, 'no account button in the sidebar')
    assert.match(button.textContent, /Ada/, 'the sidebar did not pick the new name up')
    assert.match(button.getAttribute('aria-label') || '', /Ada/, 'the account button aria-label still carries the old name')
    assert.match(button.textContent, /· Local/, 'the account button should describe local mode')

    // The real file input is hidden, so the browser's own "No file chosen" text
    // can never render. Anything visible would be a regression.
    for (const input of doc.querySelectorAll('input[type="file"]')) {
      assert.ok(input.hasAttribute('hidden'), 'a native file input is visible to the user')
    }
    assert.ok(!doc.body.textContent.includes('No file chosen'), 'the browser file-control text leaked into the UI')

    assert.deepEqual(errors, [])
  } finally {
    close()
  }
})

test('every settings section renders without taking the app down', async () => {
  const { window, doc, sleep, click, byText, close } = makeDom()
  try {
    window.eval(CODE)
    await sleep(600)
    click(byText('button', /Friend/))
    await sleep(200)
    click(byText('button', /^Settings/))
    await sleep(400)

    const names = () => [...doc.querySelectorAll('nav button')].map(button => button.textContent.trim())
    const sections = names()
    assert.ok(sections.length > 8, `expected a full settings nav, found ${sections.length}`)

    for (const name of sections) {
      const button = [...doc.querySelectorAll('nav button')].find(item => item.textContent.trim() === name)
      if (!button) continue
      click(button)
      await sleep(160)
      assert.ok(!/failed to start/i.test(doc.body.textContent || ''), `opening "${name}" crashed the app`)
      assert.deepEqual(errors, [], `opening "${name}" logged an error`)
    }

    // The memory profile must show real values on a first run, not undefined.
    click([...doc.querySelectorAll('nav button')].find(item => item.textContent.trim() === 'Performance'))
    await sleep(200)
    assert.match(doc.body.textContent, /num_ctx=4096/, 'the Performance section did not show the resolved Ollama options')
  } finally {
    close()
  }
})
