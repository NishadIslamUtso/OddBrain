// @vitest-environment node
import { test, expect } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { createZip } from '../src/main/vault/zip'
import { decodeDocument, extracted, officeText, pdfAssetBase, readDocumentZip } from '../src/main/media/documents'
import { mediaKind } from '../src/main/media/formats'
import { speechScript } from '../src/main/media/windowsSpeech'
import { attachmentsFromMedia } from '../src/renderer/src/hooks/useMediaAttachments'

function pdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 40 100 Td (${text}) Tj ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`]
  let file = '%PDF-1.4\n'; const offsets: number[] = []
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(file)); file += `${i + 1} 0 obj\n${object}\nendobj\n` }
  const xref = Buffer.byteLength(file)
  file += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(file)
}

test('UTF-8 and UTF-16 documents decode; binary, encrypted legacy Office and oversize text refuse', async () => {
  expect((await decodeDocument('notes.txt', Buffer.from('Hello বাংলা'))).text).toBe('Hello বাংলা')
  expect((await decodeDocument('notes.txt', Buffer.concat([Buffer.from([255,254]), Buffer.from('Unicode text', 'utf16le')]))).text).toBe('Unicode text')
  await expect(decodeDocument('bad.bin', Buffer.from([0,1,2,3]))).rejects.toThrow(/binary/)
  await expect(decodeDocument('secret.docx', Buffer.from('d0cf11e0a1b11ae10000', 'hex'))).rejects.toThrow(/Encrypted/)
  await expect(decodeDocument('large.txt', Buffer.alloc(2_000_001, 65))).rejects.toThrow(/2 MB/)
})
test('pdf.js asset urls keep a forward slash on Windows paths', () => {
  // pdf.js rejects a base that does not end with "/" and then reads it with
  // fs.readFile. A Windows join produced "...\\cmaps\\" and broke PDFs only on
  // Windows; both shapes must normalise to the same accepted form.
  expect(pdfAssetBase('C:\\app\\node_modules\\pdfjs-dist', 'cmaps')).toBe('C:/app/node_modules/pdfjs-dist/cmaps/')
  expect(pdfAssetBase('/home/app/node_modules/pdfjs-dist', 'cmaps')).toBe('/home/app/node_modules/pdfjs-dist/cmaps/')
  expect(pdfAssetBase('/home/app/pdfjs-dist/', 'cmaps')).toBe('/home/app/pdfjs-dist/cmaps/')
})

test('PDF extraction uses the actual parser and states page/image coverage', async () => {
  const result = await decodeDocument('example.pdf', pdf('fixture PDF words'))
  expect(result.text).toContain('fixture PDF words'); expect(result.disclosure).toContain('1 of 1 pages'); expect(result.disclosure).toContain('not interpreted')
})
test('OOXML Word, PowerPoint, stored spreadsheet values and ODF text decode locally', async () => {
  const word = '<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Hello &amp; welcome</w:t></w:r></w:p></w:body></w:document>'
  const docx = createZip([{ name: 'word/document.xml', content: word }])
  const result = await decodeDocument('example.docx', docx)
  expect(result.text).toContain('Hello & welcome'); expect(result.disclosure).toContain('not executed')
  const sheet = officeText({ 'xl/sharedStrings.xml': '<sst><si><t>Budget</t></si></sst>', 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>' }, 'xlsx')
  expect(sheet).toContain('A1: Budget'); expect(sheet).toContain('B1: 2')
  expect(officeText({ 'ppt/slides/slide1.xml': '<p:sld xmlns:p="x"><p:sp><a:p xmlns:a="y"><a:r><a:t>Slide words</a:t></a:r></a:p></p:sp></p:sld>' }, 'pptx')).toContain('Slide words')
  expect(officeText({ 'content.xml': '<office><text:p xmlns:text="t">ODF words</text:p></office>' }, 'odt')).toContain('ODF words')
})
test('document extraction refuses DTDs and oversized ZIP parts before expanding them', async () => {
  expect(() => officeText({ 'word/document.xml': '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]><p>&x;</p>' }, 'docx')).toThrow(/entity/)
  const zip = createZip([{ name: 'word/document.xml', content: '<p>' + 'safe'.repeat(100) + '</p>' }])
  const central = zip.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])); zip.writeUInt32LE(8_000_001, central + 24)
  await expect(readDocumentZip(zip)).rejects.toThrow(/limit/)
})
test('image decoding creates a bounded JPEG and discloses the first-frame limitation', async () => {
  const canvas = createCanvas(8, 8); const pen = canvas.getContext('2d'); pen.fillStyle = 'red'; pen.fillRect(0,0,8,8)
  const bytes = canvas.toBuffer('image/png')
  expect(mediaKind(bytes)).toEqual({ kind: 'image', mime: 'image/png' })
  const result = await decodeDocument('picture.png', bytes)
  expect(result.images?.[0].mime).toBe('image/jpeg'); expect(result.disclosure).toContain('first frame')
  expect(Buffer.from(result.images![0].data, 'base64').length).toBeLessThan(2 * 1024 * 1024)
  expect(attachmentsFromMedia(result, bytes.length)[0].extraction).toContain('first frame')
})
test('large extraction is offered as complete selectable sections and is never clipped into an attachment', () => {
  const source = 'x'.repeat(20_000), result = extracted('long.txt', source, 'Local text.')
  expect(result.text).toBeUndefined(); expect(result.textComplete).toBe(true); expect(result.disclosure).toContain('selectable section')
  expect(result.segments?.map(segment => segment.text).join('')).toBe(source)
  expect(result.segments?.every(segment => segment.text.length <= 6_000)).toBe(true)
  expect(attachmentsFromMedia(result, 20000)).toEqual([])
})
test('media signatures do not promote an HTML page or playlist based on a file name', () => {
  expect(mediaKind(Buffer.from('#EXTM3U\nhttps://attacker.test/movie'))).toEqual({ kind: 'document', mime: 'application/octet-stream' })
  expect(mediaKind(Buffer.from('<html>fake image</html>')).kind).toBe('document')
})
test('Windows recognition uses fixed System.Speech calls, quotes paths and rejects injected locales', () => {
  expect(() => speechScript("en-US';Write-Host hacked")).toThrow(/Invalid/)
  expect(speechScript('en-US')).toContain('SetInputToDefaultAudioDevice')
  expect(speechScript('en-US')).toContain('FromSeconds(60)')
  expect(speechScript('en-US', "C:\\a'b.wav")).toContain("'C:\\a''b.wav'")
})
export { pdf }
