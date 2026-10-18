// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { createZip as sourceZip } from '../src/shared/lib/zip'
import { officeText, readDocumentText } from '../src/renderer/src/lib/documentText'
const createZip = (entries: { name: string; content: string }[]): Uint8Array => sourceZip(entries.map(entry => ({ ...entry, content: new Uint8Array(new TextEncoder().encode(entry.content)) })))
const body = '<w:document xmlns:w="urn:word"><w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p><w:p><w:r><w:t>Next paragraph</w:t></w:r></w:p></w:document>'
function file(bytes: Uint8Array, name = 'notes.docx'): File { return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as File }
function text(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(file) }) }
test('DOCX body text keeps paragraph boundaries without interpreting embedded markup', async () => {
  const bytes = createZip([{ name: 'word/document.xml', content: body }, { name: 'word/vbaProject.bin', content: 'not executed' }])
  const decoded = await readDocumentText(file(bytes))
  assert.equal(await text(decoded), 'Hello world\nNext paragraph')
})
test('PPTX slides are ordered numerically and spreadsheet shared/inline/saved values are readable', () => {
  const slide = (value: string): string => `<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:r><a:t>${value}</a:t></a:r></a:p></p:sld>`
  const slides = officeText(new Map([['ppt/slides/slide10.xml', slide('Ten')], ['ppt/slides/slide2.xml', slide('Two')]]), 'pptx')
  assert(slides.indexOf('Two') < slides.indexOf('Ten'))
  const sheets = officeText(new Map([['xl/sharedStrings.xml','<sst xmlns="urn:x"><si><t>Saved label</t></si></sst>'],['xl/worksheets/sheet1.xml','<worksheet xmlns="urn:x"><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c><c r="C1" t="inlineStr"><is><t>Inline</t></is></c></row></worksheet>']]), 'xlsx')
  assert.match(sheets, /A1: Saved label\tB1: 42\tC1: Inline/)
})
test('OpenDocument body text is decoded locally', () => {
  assert.equal(officeText(new Map([['content.xml','<office:document xmlns:office="urn:o" xmlns:text="urn:t"><text:p>One <text:span>two</text:span></text:p></office:document>']]),'odt'), 'One two')
})
test('damaged, oversized, empty and entity-bearing documents are refused rather than silently read', async () => {
  await assert.rejects(readDocumentText(file(new Uint8Array([1,2,3]))), /Not a readable/)
  await assert.rejects(readDocumentText({ name:'big.docx', size:9*1024**2 } as File), /8 MB/)
  await assert.rejects(readDocumentText(file(createZip([{name:'word/document.xml',content:'<!DOCTYPE x><w:document xmlns:w="urn:w"/>'}]))), /declarations/)
  await assert.rejects(readDocumentText(file(createZip([{name:'word/document.xml',content:'<broken>'}]))), /damaged XML/)
  await assert.rejects(readDocumentText(file(createZip([{name:'word/document.xml',content:'<empty/>'}]))), /no readable/)
})
