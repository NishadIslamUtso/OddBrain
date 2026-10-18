import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync, gzipSync } from 'node:zlib'
import { decodeAttachment, DECODED_TEXT_CAP, MAX_INGEST_BYTES } from '../src/main/ingest/decode'
import { MAX_TEXT_LENGTH } from '../src/shared/lib/attachments'

/**
 * The honest file reader: every format either yields REAL extracted text or
 * names the REAL reason it could not be read. These pins keep both halves
 * honest — no guessing, no claiming, no silent truncation.
 */

/** A stored (method 0) zip with real payloads; the reader never checks CRC. */
function storedZip(entries: { name: string; data: string; flags?: number }[]): Uint8Array {
  const enc = new TextEncoder()
  const prepared = entries.map(e => ({ name: enc.encode(e.name), data: enc.encode(e.data), flags: e.flags ?? 0 }))
  const size =
    prepared.reduce((sum, e) => sum + 30 + e.name.length + e.data.length + 46 + e.name.length, 0) + 22
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  let at = 0
  let central = 0
  const centralStart = prepared.reduce((sum, e) => sum + 30 + e.name.length + e.data.length, 0)
  prepared.forEach((e) => {
    view.setUint32(at, 0x04034b50, true)
    view.setUint16(at + 6, e.flags, true)
    view.setUint16(at + 8, 0, true) // stored
    view.setUint32(at + 14, e.data.length, true)
    view.setUint32(at + 18, e.data.length, true)
    view.setUint16(at + 26, e.name.length, true)
    bytes.set(e.name, at + 30)
    bytes.set(e.data, at + 30 + e.name.length)
    const c = centralStart + central
    view.setUint32(c, 0x02014b50, true)
    view.setUint16(c + 8, e.flags, true)
    view.setUint16(c + 10, 0, true)
    view.setUint32(c + 20, e.data.length, true)
    view.setUint32(c + 24, e.data.length, true)
    view.setUint16(c + 28, e.name.length, true)
    view.setUint32(c + 42, at, true)
    bytes.set(e.name, c + 46)
    at += 30 + e.name.length + e.data.length
    central += 46 + e.name.length
  })
  view.setUint32(centralStart + central, 0x06054b50, true)
  view.setUint16(centralStart + central + 8, prepared.length, true)
  view.setUint16(centralStart + central + 10, prepared.length, true)
  view.setUint32(centralStart + central + 12, central, true)
  view.setUint32(centralStart + central + 16, centralStart, true)
  return bytes
}

const bytesOf = (value: string): Uint8Array => new TextEncoder().encode(value)

function pdfWithStream(dict: string, content: Uint8Array): Uint8Array {
  const head = bytesOf(`%PDF-1.4\n1 0 obj\n<< ${dict} /Length ${content.length} >>\nstream\n`)
  const tail = bytesOf('\nendstream\nendobj\ntrailer\n<< >>\n%%EOF')
  const out = new Uint8Array(head.length + content.length + tail.length)
  out.set(head, 0)
  out.set(content, head.length)
  out.set(tail, head.length + content.length)
  return out
}

test('the decode cap is the composer cap — one rule, two places', () => {
  assert.equal(DECODED_TEXT_CAP, MAX_TEXT_LENGTH)
  assert.ok(MAX_INGEST_BYTES >= 64 * 1024 * 1024)
})

test('a real PDF yields its real words (flate and plain)', () => {
  const plain = 'BT (Hello owner) Tj ET'
  const flate = deflateSync(Buffer.from('BT (Flate words ride along) Tj ET'))
  const one = decodeAttachment(pdfWithStream('/Filter /FlateDecode', new Uint8Array(flate)), 'one.pdf', 'application/pdf')
  assert.equal(one.ok, true)
  assert.ok(one.ok && one.text.includes('Flate words ride along'))
  const two = decodeAttachment(pdfWithStream('', bytesOf(plain)), 'two.pdf', 'application/pdf')
  assert.equal(two.ok, true)
  assert.ok(two.ok && two.text.includes('Hello owner'))
})

test('an encrypted PDF says encrypted; a scan says nothing was read', () => {
  const encrypted = decodeAttachment(bytesOf('%PDF-1.4\n5 0 obj\n<< /Filter /Standard /V 1 >>\nendobj\ntrailer\n<< /Encrypt 5 0 R >>'), 'locked.pdf', 'application/pdf')
  assert.equal(encrypted.ok, false)
  assert.ok(!encrypted.ok && /password-protected/.test(encrypted.reason))
  const scanned = decodeAttachment(pdfWithStream('/Filter /DCTDecode', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'scan.pdf', 'application/pdf')
  assert.equal(scanned.ok, false)
  assert.ok(!scanned.ok && /no readable text layer/.test(scanned.reason))
  assert.ok(!scanned.ok && /Nothing was read/.test(scanned.reason))
})

test('a DOCX/PPTX/ODT/EPUB yields the words inside', () => {
  const docx = decodeAttachment(storedZip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'word/document.xml', data: '<w:document><w:body><w:p><w:r><w:t>First line</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r></w:p></w:body></w:document>' },
  ]), 'notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.equal(docx.ok, true)
  assert.ok(docx.ok && docx.text.includes('First line') && docx.text.includes('Second line'))

  const pptx = decodeAttachment(storedZip([
    { name: 'ppt/slides/slide2.xml', data: '<p:sld><a:t>Slide two words</a:t></p:sld>' },
    { name: 'ppt/slides/slide1.xml', data: '<p:sld><a:t>Slide one words</a:t></p:sld>' },
  ]), 'deck.pptx', '')
  assert.equal(pptx.ok, true)
  assert.ok(pptx.ok && pptx.text.indexOf('Slide one') < pptx.text.indexOf('Slide two'))

  const odt = decodeAttachment(storedZip([{ name: 'content.xml', data: '<office:text><text:p>Plain open document</text:p></office:text>' }]), 'file.odt', '')
  assert.equal(odt.ok, true)
  assert.ok(odt.ok && odt.text.includes('Plain open document'))

  const epub = decodeAttachment(storedZip([
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'OEBPS/ch1.xhtml', data: '<html><body><p>Chapter one prose</p></body></html>' },
  ]), 'book.epub', '')
  assert.equal(epub.ok, true)
  assert.ok(epub.ok && epub.text.includes('Chapter one prose'))
})

test('an XLSX keeps cell values with their strings', () => {
  const xlsx = decodeAttachment(storedZip([
    { name: 'xl/sharedStrings.xml', data: '<sst><si><t>Revenue</t></si><si><t>Q1</t></si></sst>' },
    { name: 'xl/worksheets/sheet1.xml', data: '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><v>42</v></c></row></sheetData></worksheet>' },
  ]), 'book.xlsx', '')
  assert.equal(xlsx.ok, true)
  assert.ok(xlsx.ok && xlsx.text.includes('Revenue') && xlsx.text.includes('Q1') && xlsx.text.includes('42'))
})

test('a password-protected zip says password, not damaged', () => {
  const locked = decodeAttachment(storedZip([{ name: 'word/document.xml', data: '<w:t>secret</w:t>', flags: 0x1 }]), 'locked.docx', '')
  assert.equal(locked.ok, false)
  assert.ok(!locked.ok && /password-protected/.test(locked.reason))
  assert.ok(!locked.ok && !/corrupt/.test(locked.reason))
})

test('rar/7z/unknown formats refuse by name; gzip unwraps', () => {
  const rar = decodeAttachment(bytesOf('Rar!\x16\x07\x00junkjunkjunkjunkjunkjunkjunkjunk'), 'pack.rar', '')
  assert.equal(rar.ok, false)
  assert.ok(!rar.ok && /RAR/.test(rar.reason) && /extract/i.test(rar.reason))

  const unknown = decodeAttachment(new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10]), 'thing.xyz', 'application/xyz')
  assert.equal(unknown.ok, false)
  assert.ok(!unknown.ok && /no decoder/.test(unknown.reason))

  const gz = decodeAttachment(new Uint8Array(gzipSync(Buffer.from('plain words inside the gzip'))), 'notes.txt.gz', '')
  assert.equal(gz.ok, true)
  assert.ok(gz.ok && gz.text.includes('plain words inside the gzip'))
})

test('audio and video containers read to honest facts, DRM names itself', () => {
  // 1 second of silence-shaped WAV: RIFF/WAVE, fmt + data chunks.
  const wav = new Uint8Array(44 + 8000)
  const view = new DataView(wav.buffer)
  wav.set(bytesOf('RIFF'), 0)
  view.setUint32(4, 36 + 8000, true)
  wav.set(bytesOf('WAVE'), 8)
  wav.set(bytesOf('fmt '), 12)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  wav.set(bytesOf('data'), 36)
  view.setUint32(40, 8000, true)
  const audio = decodeAttachment(wav, 'voice.wav', 'audio/wav')
  assert.equal(audio.ok, true)
  assert.ok(audio.ok && /WAV audio/.test(audio.text) && /Duration 0:01/.test(audio.text))
  assert.ok(audio.ok && /not transcribed/.test(audio.text), 'says the sound was NOT transcribed')

  // An mp4 whose boxes carry the DRM marker.
  const drm = new Uint8Array(256)
  drm.set(bytesOf('\x00\x00\x00\x20ftypisom'), 0)
  drm.set(bytesOf('sinf'), 120)
  const protectedFile = decodeAttachment(drm, 'movie.mp4', 'video/mp4')
  assert.equal(protectedFile.ok, false)
  assert.ok(!protectedFile.ok && /DRM/.test(protectedFile.reason) && /does not decrypt/.test(protectedFile.reason))

  // A truncated container is corrupt, not mysteriously empty.
  const broken = decodeAttachment(bytesOf('RIFF'), 'cut.wav', 'audio/wav')
  assert.equal(broken.ok, false)
  assert.ok(!broken.ok && /corrupt|cut off/.test(broken.reason))
})

test('oversize decodes refuse with the exact numbers — never silent truncation', () => {
  const big = '<w:p><w:r><w:t>' + 'x'.repeat(DECODED_TEXT_CAP + 100) + '</w:t></w:r></w:p>'
  const doc = decodeAttachment(storedZip([{ name: 'word/document.xml', data: big }]), 'long.docx', '')
  assert.equal(doc.ok, false)
  assert.ok(!doc.ok && doc.reason.includes('12,100') && doc.reason.includes('12,000'))
  assert.ok(!doc.ok && /cut silently/.test(doc.reason))
})

test('a plain text file with an unknown extension still reads as text', () => {
  const plain = decodeAttachment(bytesOf('just words, no extension trouble\nsecond line'), 'data.blob', '')
  assert.equal(plain.ok, true)
  assert.ok(plain.ok && plain.text.startsWith('just words'))
})
