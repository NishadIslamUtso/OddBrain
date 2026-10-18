const { chromium } = require('playwright-core')
const { zipSync, strToU8 } = require('fflate')
const { Resvg } = require('@resvg/resvg-js')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const BASE = process.env.ODDBRAIN_UI_URL || 'http://127.0.0.1:5174/'
const QA = path.resolve(process.env.ODDBRAIN_QA_DIR || 'qa-ui')
fs.mkdirSync(QA, { recursive: true })
function pdfFixture(contents = 'BT /F1 12 Tf 72 720 Td (OddBrain reads real PDF text) Tj ET\n') {
  let pdf = '%PDF-1.4\n'
  const positions = [0]
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${contents.length} >>\nstream\n${contents}endstream`,
  ]
  for (const object of objects) { positions.push(pdf.length); pdf += `${positions.length - 1} 0 obj\n${object}\nendobj\n` }
  const start = pdf.length
  pdf += `xref\n0 ${positions.length}\n0000000000 65535 f \n` + positions.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Root 1 0 R /Size ${positions.length} >>\nstartxref\n${start}\n%%EOF\n`
  return Buffer.from(pdf)
}

;(async () => {
  const browser = await chromium.launch(process.env.ODDBRAIN_CHROMIUM_PATH
    ? { executablePath: process.env.ODDBRAIN_CHROMIUM_PATH, args: ['--no-sandbox', '--no-zygote', '--disable-web-security'] }
    : undefined)
  const page = await browser.newPage({ viewport: { width: 1536, height: 824 } })
  page.setDefaultTimeout(15000)
  const result = { errors: [], checks: [] }
  page.on('pageerror', error => result.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()) })
  try {
    await page.goto(BASE)
    await page.evaluate(() => {
      localStorage.setItem('ai-assistant.welcomed', 'true')
      localStorage.setItem('ai-assistant.profile', JSON.stringify({ name: 'Friend' }))
    })
    await page.reload()
    await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor()
    await page.waitForTimeout(2200)
    const input = page.locator('input[type=file]').first()
    await input.setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: pdfFixture() })
    await page.getByRole('list', { name: 'Attached' }).getByText('notes.pdf').waitFor()
    result.checks.push('PDF.js extracted text from an actual one-page PDF in Chromium and attached it as source data')
    await input.setInputFiles({ name: 'report.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from(zipSync({ 'word/document.xml': strToU8('<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Real Word content</w:t></w:r></w:p></w:body></w:document>') })) })
    await page.getByRole('list', { name: 'Attached' }).getByText('report.docx').waitFor()
    result.checks.push('ZIP-based Word text was decoded locally with no provider request')
    await page.getByRole('button', { name: 'Remove notes.pdf' }).click()
    await page.getByRole('button', { name: 'Remove report.docx' }).click()
    await page.evaluate(async () => {
      // Vite may serve an HMR-stamped module URL; import the exact instance
      // App.tsx uses rather than constructing a separate bridge singleton.
      const appSource = await (await fetch('/src/App.tsx')).text()
      const bridgeUrl = appSource.match(/from "(\/src\/platform\/bridge\.ts(?:\?t=\d+)?)"/)?.[1]
      if (!bridgeUrl) throw new Error('Cannot find the real renderer bridge URL')
      const { bridge } = await import(bridgeUrl)
      window.__mediaCalls = []
      bridge.media.vision = async () => ({ supported: false, reason: 'The selected model has no verified vision.' })
      bridge.media.providers = async operation => ({ options: operation === 'image'
        ? [{ provider: 'anthropic', label: 'Claude (Anthropic)', model: 'claude-sonnet-4-5', operation }]
        : [{ provider: 'openai', label: 'GPT (OpenAI)', model: 'whisper-1', operation }], reason: '' })
      bridge.media.describe = async input => { window.__mediaCalls.push({ kind: 'image', provider: input.provider, images: input.images.length }); return { ok: true, text: 'A small blue square.', provider: 'Claude (Anthropic)', model: input.model } }
      bridge.media.transcribe = async input => { window.__mediaCalls.push({ kind: 'audio', provider: input.provider, length: input.data.length }); return { ok: true, text: 'These words were transcribed.', provider: 'GPT (OpenAI)', model: input.model } }
    })
    const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="blue"/></svg>').render().asPng()
    await input.setInputFiles({ name: 'square.png', mimeType: 'image/png', buffer: png })
    const picker = page.getByRole('dialog', { name: 'Choose a media provider' })
    await picker.waitFor()
    assert.equal(await page.evaluate(() => window.__mediaCalls.length), 0)
    assert.match(await picker.innerText(), /may charge you/)
    await page.screenshot({ path: path.join(QA, 'media-provider-choice-1536x824.png') })
    await picker.getByRole('button', { name: /Upload to Claude/ }).click()
    await page.getByRole('list', { name: 'Attached' }).getByText(/visual description by Claude/).waitFor()
    assert.deepEqual(await page.evaluate(() => window.__mediaCalls), [{ kind: 'image', provider: 'anthropic', images: 1 }])
    result.checks.push('Image provider sees bytes only after explicit per-file choice; current chat model stays unchanged')
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(40)])
    await input.setInputFiles({ name: 'recording.wav', mimeType: 'audio/wav', buffer: wav })
    await picker.waitFor()
    assert.equal(await page.evaluate(() => window.__mediaCalls.length), 1)
    await picker.getByRole('button', { name: /Upload to GPT/ }).click()
    await page.getByRole('list', { name: 'Attached' }).getByText(/transcript by GPT/).waitFor()
    const calls = await page.evaluate(() => window.__mediaCalls)
    assert.equal(calls[1].provider, 'openai')
    assert(calls[1].length > 30)
    result.checks.push('Audio waits for explicit choice, then its returned transcript is an attachment')
    await page.getByRole('button', { name: /Remove square.png/ }).click()
    await page.getByRole('button', { name: /Remove recording.wav/ }).click()
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 64; canvas.height = 64
      const pen = canvas.getContext('2d')
      const stream = canvas.captureStream(10)
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
      const chunks = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      const stopped = new Promise(resolve => { recorder.onstop = resolve })
      recorder.start()
      let index = 0
      const timer = setInterval(() => { pen.fillStyle = index++ % 2 ? 'red' : 'blue'; pen.fillRect(0, 0, 64, 64) }, 85)
      await new Promise(resolve => setTimeout(resolve, 1300))
      recorder.stop(); clearInterval(timer); await stopped
      stream.getTracks().forEach(track => track.stop())
      const file = new File(chunks, 'clip.webm', { type: 'video/webm' })
      const chosen = new DataTransfer()
      chosen.items.add(file)
      const input = document.querySelector('input[type=file]')
      input.files = chosen.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await picker.waitFor()
    assert.equal(await page.evaluate(() => window.__mediaCalls.length), 2)
    await picker.getByRole('button', { name: /Upload to Claude/ }).click()
    await picker.getByText('Also transcribe the soundtrack?').waitFor()
    assert.equal(await page.evaluate(() => window.__mediaCalls.length), 3)
    await picker.getByRole('button', { name: /Upload to GPT/ }).click()
    await page.getByRole('list', { name: 'Attached' }).getByText(/clip.webm — transcript by GPT/).waitFor()
    assert.deepEqual(await page.evaluate(() => window.__mediaCalls.slice(2).map(x => [x.kind, x.images || 0])), [['image', 3], ['audio', 0]])
    result.checks.push('Actual WebM in Chromium yields three time-stamped stills; visual description and optional soundtrack each require a separate explicit choice (mock provider replies)')
    await input.setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdfFixture('0 0 1 rg 20 20 200 200 re f\n') })
    await picker.waitFor()
    assert.equal(await page.evaluate(() => window.__mediaCalls.length), 4)
    await picker.getByRole('button', { name: /Upload to Claude/ }).click()
    await page.getByRole('list', { name: 'Attached' }).getByText(/scan.pdf — visual description/).waitFor()
    assert.equal(await page.evaluate(() => window.__mediaCalls.length), 5)
    result.checks.push('An image-only PDF is locally rendered page-by-page and needs explicit vision provider consent; no pages are silently skipped')
    await page.getByRole('button', { name: 'Record dictation' }).click()
    assert.match(await page.locator('.ob-composer-host').innerText(), /desktop app/i)
    assert.equal(await page.evaluate(() => window.__mediaCalls.length), 5)
    result.checks.push('The browser preview never opens a microphone or pretends a provider is installed')
    assert.deepEqual(result.errors, [])
  } catch (error) {
    result.failure = error.stack
    result.composer = await page.locator('.ob-composer-host').first().innerText().catch(() => '')
    await page.screenshot({ path: path.join(QA, 'media-ui-failure.png') }).catch(() => undefined)
    process.exitCode = 1
  }
  finally {
    fs.writeFileSync(path.join(QA, 'media-ui-results.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
    await browser.close()
  }
})()
