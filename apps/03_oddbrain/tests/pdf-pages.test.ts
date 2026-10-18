// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { vi } from 'vitest'

const pdfMock = vi.hoisted(() => ({
  numPages: 6,
  permissions: [16],
  password: false,
  rendered: [] as number[],
}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  VerbosityLevel: { ERRORS: 0 },
  PermissionFlag: { COPY: 16 },
  AnnotationMode: { DISABLE: 0 },
  getDocument: () => ({
    promise: pdfMock.password
      ? Promise.reject(Object.assign(new Error('password required'), { name: 'PasswordException' }))
      : Promise.resolve({
          numPages: pdfMock.numPages,
          getPermissions: async () => pdfMock.permissions,
          getPage: async (pageNumber: number) => ({
            getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
            getTextContent: async () => ({ items: [] }),
            render: () => {
              pdfMock.rendered.push(pageNumber)
              return { promise: Promise.resolve(), cancel: () => undefined }
            },
            cleanup: () => undefined,
          }),
          destroy: async () => undefined,
        }),
    destroy: async () => undefined,
  }),
}))

import { readAttachment } from '../src/shared/lib/attachments'

function fakePdf(): File {
  const bytes = new TextEncoder().encode('%PDF-test')
  return {
    name: 'scan.pdf',
    type: 'application/pdf',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => '',
  } as File
}

test('scanned PDFs render only the available first pages and disclose what was not sent', async () => {
  const oldCreateElement = document.createElement.bind(document)
  const oldBitmap = globalThis.createImageBitmap
  pdfMock.numPages = 6
  pdfMock.permissions = [16]
  pdfMock.password = false
  pdfMock.rendered = []
  try {
    globalThis.createImageBitmap = (async () => ({ width: 600, height: 800, close: () => undefined }) as ImageBitmap)
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      if (tagName.toLowerCase() !== 'canvas') return oldCreateElement(tagName, options)
      return {
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
        toBlob: (callback: BlobCallback, type?: string) => callback(new Blob(['rendered pixels'], { type: type || 'image/jpeg' })),
      } as unknown as HTMLCanvasElement
    }) as typeof document.createElement

    const pages = await readAttachment(fakePdf(), { verified: true, vision: true, thinking: false }, { maxPdfPages: 2 })
    assert.ok(Array.isArray(pages))
    assert.equal(pages.length, 2)
    assert.deepEqual(pdfMock.rendered, [1, 2])
    assert.match(pages[0]?.sourceNote ?? '', /Pages 1–2 of 6.*remaining pages were not sent/)
    assert.equal(pages[0]?.mime, 'image/jpeg')
    assert.equal(pages[0]?.kind, 'image')
  } finally {
    document.createElement = oldCreateElement
    globalThis.createImageBitmap = oldBitmap
  }
})

test('a PDF password or copy-protection refusal never falls through to image rendering', async () => {
  pdfMock.password = true
  pdfMock.rendered = []
  await assert.rejects(
    readAttachment(fakePdf(), { verified: true, vision: true, thinking: false }),
    /password-protected.*nothing was read or sent/i,
  )
  assert.deepEqual(pdfMock.rendered, [])

  pdfMock.password = false
  pdfMock.permissions = [8]
  await assert.rejects(
    readAttachment(fakePdf(), { verified: true, vision: true, thinking: false }),
    /does not permit text extraction.*Nothing was read or sent/,
  )
  assert.deepEqual(pdfMock.rendered, [])
})
