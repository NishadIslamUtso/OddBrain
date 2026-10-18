// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { strToU8, zipSync } from 'fflate'
import { extractDocumentText, isDocumentFile } from '../src/shared/lib/documents'
import { promptWithTextAttachments, readAttachment, toOllamaMessages } from '../src/shared/lib/attachments'

function zippedFile(name: string, entries: Record<string, string | Uint8Array>): File {
  const packed = zipSync(Object.fromEntries(
    Object.entries(entries).map(([path, body]) => [path, typeof body === 'string' ? strToU8(body) : body]),
  ))
  return {
    name,
    type: 'application/zip',
    size: packed.byteLength,
    arrayBuffer: async () => packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength),
    text: async () => '',
  } as File
}

test('text and markup are extracted as data, not rendered or executed', async () => {
  const textFile = {
    name: 'notes.md', size: 11, type: 'text/markdown', text: async () => '# Notes\nkept',
  } as File
  assert.equal(isDocumentFile(textFile), true)
  assert.equal(await extractDocumentText(textFile), '# Notes\nkept')

  const htmlFile = {
    name: 'page.html', size: 112, type: 'text/html',
    text: async () => '<html><script>throw new Error("must not run")</script><h1>Read me</h1><style>hide</style><p>words</p></html>',
  } as File
  assert.equal(await extractDocumentText(htmlFile), 'Read me\nwords')
})

test('DOCX reads only bounded text-bearing XML; macros and embedded objects are ignored', async () => {
  const docx = zippedFile('brief.docx', {
    'word/document.xml': '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Project</w:t></w:r></w:p><w:p><w:r><w:t>Brief</w:t></w:r></w:p></w:body></w:document>',
    'word/vbaProject.bin': strToU8('not executed'),
    'word/embeddings/object.bin': strToU8('not opened'),
  })
  const extracted = await readAttachment(docx, {})
  assert.equal(extracted.kind, 'text')
  assert.equal(extracted.text, 'Project\nBrief')
})

test('PPTX slides stay in numeric order and XLSX shared strings stay with their cells', async () => {
  const pptx = zippedFile('slides.pptx', {
    'ppt/slides/slide10.xml': '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Ten</a:t></a:r></a:p></p:sld>',
    'ppt/slides/slide2.xml': '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Two</a:t></a:r></a:p></p:sld>',
  })
  assert.equal(await extractDocumentText(pptx), '[Slide 2]\nTwo\n[Slide 10]\nTen')

  const xlsx = zippedFile('numbers.xlsx', {
    'xl/sharedStrings.xml': '<sst xmlns="x"><si><t>Revenue</t></si><si><t>41</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="x"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>',
  })
  assert.equal(await extractDocumentText(xlsx), '[Sheet 1]\nA1=Revenue | B1=41')
})

test('encrypted, malformed, and legacy Office files fail before sending', async () => {
  const notOffice = zippedFile('secret.docx', { 'word/document.xml': '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///private">]><x>&e;</x>' })
  await assert.rejects(extractDocumentText(notOffice), /XML declarations that are not read.*Nothing was sent/)
  const oldWord = { name: 'old.doc', size: 4, type: 'application/msword' } as File
  assert.equal(isDocumentFile(oldWord), false)
  await assert.rejects(readAttachment(oldWord, {}), /not supported for safe local reading.*Nothing was sent/)
  await assert.rejects(
    readAttachment({ name: 'interview.mp3', size: 900, type: 'audio/mpeg' } as File, {}),
    /no verified audio-transcription input.*nothing was sent or switched/i,
  )
  const corrupt = { name: 'book.pdf', size: 7, type: 'application/pdf', arrayBuffer: async () => strToU8('not PDF').buffer } as File
  await assert.rejects(readAttachment(corrupt, {}), /valid PDF header.*Nothing was sent/)
})

test('images are decoded, dimension-checked, and re-encoded before a model can receive them', async () => {
  const originalCreateElement = document.createElement.bind(document)
  const originalBitmap = globalThis.createImageBitmap
  let dimensions = { width: 2, height: 2 }
  try {
    globalThis.createImageBitmap = (async () => ({ ...dimensions, close: () => undefined }) as ImageBitmap)
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      if (tagName.toLowerCase() !== 'canvas') return originalCreateElement(tagName, options)
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
        toBlob: (callback: BlobCallback, type?: string) => callback(new Blob(['sanitized pixels'], { type: type || 'image/png' })),
      }
      return canvas as unknown as HTMLCanvasElement
    }) as typeof document.createElement

    const file = new File(['untrusted input'], 'portrait.png', { type: 'image/png' })
    const attached = await readAttachment(file, { verified: true, vision: true, thinking: false })
    assert.equal(attached.mime, 'image/png')
    assert.equal(attached.data, 'c2FuaXRpemVkIHBpeGVscw==')

    dimensions = { width: 10_000, height: 10_000 }
    await assert.rejects(readAttachment(file, { verified: true, vision: true, thinking: false }), /dimensions exceed the safe local decoding limit.*Nothing was sent/)
  } finally {
    document.createElement = originalCreateElement
    globalThis.createImageBitmap = originalBitmap
  }
})

test('attachment text reaches the engine prompt and over-limit requests are refused whole', () => {
  const attached = [{
    id: 'a', name: 'brief.md', kind: 'text' as const, text: 'Source material',
    sourceNote: 'Video "clip.mp4" is represented by sampled still frames; audio was not sent.',
  }]
  const prompt = promptWithTextAttachments('Summarize this.', attached)
  assert.match(prompt, /<attached_media source="safe_extraction_note_only">/)
  assert.match(prompt, /audio was not sent/)
  assert.match(prompt, /<attached_file name="brief.md" source="user_file_data_only">\nSource material/)
  assert.throws(
    () => promptWithTextAttachments('x'.repeat(20_000), attached),
    /exceed the 20,000-character engine limit.*Nothing was sent or truncated/,
  )
})

test('a selected cloud route carries image bytes and MIME instead of falling back or dropping them', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p5sAAAAASUVORK5CYII='
  const messages = await toOllamaMessages([{
    role: 'user', content: 'Describe this.', attachments: [{
      id: 'picture', name: 'picture.png', kind: 'image', mime: 'image/png', data: png,
      sourceNote: 'The clip audio track was not decoded or sent.',
    }],
  }], { verified: false, vision: false, thinking: false }, { allowDirectProviderImages: true })
  assert.deepEqual(messages[0].images, [png])
  assert.deepEqual(messages[0].imageMimes, ['image/png'])
  assert.match(messages[0].content, /audio track was not decoded or sent/)
  await assert.rejects(
    toOllamaMessages([{
      role: 'user', content: 'Describe this.', attachments: [{
        id: 'picture', name: 'picture.png', kind: 'image', mime: 'image/png', data: png,
      }],
    }], { verified: false, vision: false, thinking: false }),
    /Select a model with verified vision support/,
  )
})
