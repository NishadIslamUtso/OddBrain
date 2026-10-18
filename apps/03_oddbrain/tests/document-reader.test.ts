// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { readAttachment } from '../src/shared/lib/attachments'
import { readDocumentText } from '../src/shared/lib/documentReader'

function attachment(name: string, bytes: Uint8Array) {
  return { name, type: 'application/octet-stream', size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer } as File
}
const zip = (parts: Record<string, string>): Uint8Array => zipSync(Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, strToU8(value)])))

describe('local document ingestion', () => {
  it('reads Word paragraphs and headers without running macros or uploading anything', async () => {
    const docx = attachment('spec.docx', zip({
      'word/document.xml': '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>World</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r></w:p></w:body></w:document>',
      'word/header1.xml': '<w:hdr xmlns:w="urn:w"><w:p><w:t>Header</w:t></w:p></w:hdr>',
    }))
    expect((await readAttachment(docx, { verified: false, vision: false, thinking: false })).text).toBe('Hello\tWorld\nSecond line\nHeader')
  })

  it('reads sheets and slides, including shared strings, as quoted source text', async () => {
    const xlsx = attachment('table.xlsx', zip({
      'xl/sharedStrings.xml': '<sst><si><t>Delta</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c t="s"><v>0</v></c><c><v>42</v></c></row></sheetData></worksheet>',
    }))
    expect(await readDocumentText(xlsx)).toBe('Delta\t42')
    const pptx = attachment('slides.pptx', zip({
      'ppt/slides/slide1.xml': '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:t>First slide</a:t></a:p></p:sld>',
    }))
    expect(await readDocumentText(pptx)).toBe('First slide')
  })

  it('refuses protected, oversized, corrupt and misleading files instead of silently skipping them', async () => {
    const original = zip({ 'word/document.xml': '<w:document><w:p><w:t>safe</w:t></w:p></w:document>' })
    const central = original.findIndex((_, i) => i + 3 < original.length && original[i] === 0x50 && original[i + 1] === 0x4b && original[i + 2] === 1 && original[i + 3] === 2)
    const corrupt = original.slice()
    corrupt[central + 16] ^= 0xff // mismatched checksum
    await expect(readDocumentText(attachment('broken.docx', corrupt))).rejects.toThrow(/checksum/)
    await expect(readDocumentText(attachment('fake.docx', strToU8('not zip')))).rejects.toThrow(/not a readable ZIP/)
    const unsafe = original.slice()
    // Central directory flags at +8; encryption is always rejected.
    unsafe[central + 8] |= 1
    await expect(readDocumentText(attachment('protected.docx', unsafe))).rejects.toThrow(/encrypted/)
    const huge = attachment('huge.docx', zip({ 'word/document.xml': `<document><p><t>${'X'.repeat(12_001)}</t></p></document>` }))
    await expect(readDocumentText(huge)).rejects.toThrow(/12,000 characters/)
    await expect(readDocumentText(attachment('unknown.rtf', strToU8('{\\rtf1 hello}')))).rejects.toThrow(/not supported/)
  })
})
