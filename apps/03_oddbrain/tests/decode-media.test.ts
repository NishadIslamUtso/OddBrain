import test from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync, deflateSync } from 'node:zlib'
import {
  describeDuration,
  mediaKind,
  officeText,
  pdfText,
  readZipEntries,
  unescapePdfString,
  xmlText,
} from '../src/shared/lib/decode'
import { createZip } from '../src/shared/lib/zip'

/** A tiny PDF with one page and one text run, Flate-compressed the way real
 *  writers do it. The point is the stream reader, not a full PDF engine. */
function pdfWith(text: string): Uint8Array {
  const content = deflateSync(Buffer.from(`BT /F1 12 Tf 72 720 Td (${text}) Tj ET`))
  const head = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Page/Count 1>>stream\n',
    'latin1',
  )
  const tail = Buffer.from('\nendstream\nendobj\ntrailer<<>>\n%%EOF', 'latin1')
  return new Uint8Array(Buffer.concat([head, content, tail]))
}

const inflate = async (bytes: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateSync(bytes))

test('PDF text is pulled out of the content stream, not guessed at', async () => {
  const { text, pages } = await pdfText(pdfWith('Quarterly numbers are up'), inflate)
  assert.equal(text, 'Quarterly numbers are up')
  assert.equal(pages, 1)
})

test('a scan with no text operators reports no text, never an empty document', async () => {
  const scan = new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj<</Type/Page>>stream\nq 612 0 0 792 0 0 cm /Im0 Do Q\nendstream\nendobj\n%%EOF', 'latin1'))
  const { text } = await pdfText(scan, inflate)
  assert.equal(text, '')
})

test('PDF string escapes survive: newlines, parens and octal', async () => {
  assert.equal(unescapePdfString('line1\\nline2'), 'line1\nline2')
  assert.equal(unescapePdfString('a\\(b\\)c'), 'a(b)c')
  assert.equal(unescapePdfString('\\101BC'), 'ABC')
})

test('document XML becomes readable lines, entities and all', () => {
  const xml = '<w:body><w:p><w:r><w:t>Dear Osman &amp; co</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r></w:p></w:body>'
  const text = xmlText(xml)
  assert.match(text, /Dear Osman & co/)
  assert.match(text, /Second line/)
  assert.ok(text.indexOf('Second line') > text.indexOf('Dear'))
})

test('a .docx is read for its words', async () => {
  const zip = createZip([{ name: 'word/document.xml', content: '<w:document><w:body><w:p><w:r><w:t>The plan is the plan.</w:t></w:r></w:p></w:body></w:document>' }])
  const file = new File([zip as unknown as BlobPart], 'plan.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const result = await officeText(file)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.match(result.text, /The plan is the plan\./)
    assert.match(result.note, /Text only/)
  }
})

test('a .xlsx reads shared strings and cells into rows', async () => {
  const zip = createZip([
    { name: 'xl/sharedStrings.xml', content: '<sst><si><t>Revenue</t></si><si><t>Costs</t></si></sst>' },
    { name: 'xl/worksheets/sheet1.xml', content: '<worksheet><sheetData><row><c t="s"><v>0</v></c><c><v>120</v></c></row><row><c t="s"><v>1</v></c><c><v>80</v></c></row></sheetData></worksheet>' },
  ])
  const file = new File([zip as unknown as BlobPart], 'book.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const result = await officeText(file)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.match(result.text, /Revenue \| 120/)
    assert.match(result.text, /Costs \| 80/)
    assert.match(result.note, /formulas/i)
  }
})

test('a .pptx keeps slide order', async () => {
  const zip = createZip([
    { name: 'ppt/slides/slide2.xml', content: '<p:sld><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:sld>' },
    { name: 'ppt/slides/slide1.xml', content: '<p:sld><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p:sld>' },
  ])
  const file = new File([zip as unknown as BlobPart], 'deck.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
  const result = await officeText(file)
  assert.equal(result.ok, true)
  if (result.ok) assert.ok(result.text.indexOf('First slide') < result.text.indexOf('Second slide'))
})

test('a damaged Office file says so instead of pretending', async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4]) as unknown as BlobPart], 'broken.docx', { type: 'application/octet-stream' })
  const result = await officeText(file)
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.problem, /not look like an Office file/)
})

test('zip entries are listed by name from the central directory', async () => {
  const zip = createZip([{ name: 'a.txt', content: 'alpha' }, { name: 'nested/b.txt', content: 'beta' }])
  const entries = await readZipEntries(zip)
  assert.deepEqual([...entries.keys()].sort(), ['a.txt', 'nested/b.txt'])
  assert.equal(new TextDecoder().decode(entries.get('a.txt')), 'alpha')
})

test('every file kind is recognised from its name, even with a blank type', () => {
  assert.equal(mediaKind({ name: 'shot.HEIC', type: '' }), 'image')
  assert.equal(mediaKind({ name: 'clip.mkv', type: '' }), 'video')
  assert.equal(mediaKind({ name: 'note.opus', type: '' }), 'audio')
  assert.equal(mediaKind({ name: 'paper.pdf', type: '' }), 'pdf')
  assert.equal(mediaKind({ name: 'sheet.xlsx', type: '' }), 'office')
  assert.equal(mediaKind({ name: 'main.rs', type: '' }), 'text')
  assert.equal(mediaKind({ name: 'thing.xyz', type: '' }), 'unknown')
})

test('a duration reads like a sentence', () => {
  assert.equal(describeDuration(200), '3 minutes 20 seconds')
  assert.equal(describeDuration(1), '1 second')
  assert.equal(describeDuration(59), '59 seconds')
})
