/**
 * Bounded, inert extraction for user-picked documents.
 *
 * Nothing from these files is executed. Office archives are streamed and only
 * their text-bearing XML parts are opened; PDFs are parsed for selectable text
 * with PDF.js' evaluator disabled. Compressed inputs, entry counts, page counts,
 * and extracted text all have ceilings so a corrupt or hostile file cannot turn
 * the picker into an unbounded decompression job.
 */
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
export const MAX_DOCUMENT_TEXT = 12_000
export const MAX_PDF_PAGES = 24
const MAX_ZIP_ENTRIES = 128
const MAX_XML_ENTRY_BYTES = 2 * 1024 * 1024
const MAX_SELECTED_XML_BYTES = 8 * 1024 * 1024
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
const PDF_MAGIC = '%PDF-'

const EXTENSION = /\.([^.]+)$/
const OFFICE_EXTENSIONS = new Set(['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods'])
const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  ...OFFICE_EXTENSIONS,
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'log', 'xml', 'yaml', 'yml', 'toml',
  'html', 'htm', 'rtf', 'js', 'jsx', 'ts', 'tsx', 'css', 'py', 'sql', 'sh', 'bat', 'c', 'cpp', 'h', 'java', 'rs',
])

export function extensionOf(name: string): string {
  return name.match(EXTENSION)?.[1]?.toLowerCase() ?? ''
}

export function isDocumentFile(file: Pick<File, 'name' | 'type'>): boolean {
  return DOCUMENT_EXTENSIONS.has(extensionOf(file.name)) || /^text\//i.test(file.type)
}

function bytesStartWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

function decodeUtf8(bytes: Uint8Array, name: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    throw new Error(`${name}: the text part could not be decoded. It may be encrypted or corrupt. Nothing was sent.`)
  }
}

function assertTextBudget(text: string, name: string): string {
  const clean = text.replace(/\r\n?/g, '\n').trim()
  if (clean.length > MAX_DOCUMENT_TEXT) {
    throw new Error(
      `${name}: extraction produced more than ${MAX_DOCUMENT_TEXT.toLocaleString()} characters. Nothing was truncated or sent; split the document or select a model with a suitable context.`
    )
  }
  return clean
}

/** Extract only what is needed from an Office ZIP; unrelated media and macros are never opened. */
async function readZipTextParts(
  data: Uint8Array,
  name: string,
  selected: (entryName: string) => boolean
): Promise<Map<string, string>> {
  if (!bytesStartWith(data, ZIP_MAGIC)) {
    throw new Error(
      `${name}: this is not a readable Office ZIP. It may be an encrypted, legacy, corrupt, or DRM-protected file. Nothing was sent.`
    )
  }

  return await new Promise<Map<string, string>>((resolve, reject) => {
    const parts = new Map<string, string>()
    let entries = 0
    let selectedBytes = 0
    let pending = 0
    let archiveEnded = false
    let settled = false

    const fail = (reason: string): void => {
      if (settled) return
      settled = true
      reject(new Error(`${name}: ${reason} Nothing was sent.`))
    }
    const finishIfReady = (): void => {
      if (settled || !archiveEnded || pending !== 0) return
      settled = true
      if (entries === 0) {
        reject(new Error(`${name}: the archive is empty, encrypted, or corrupt. Nothing was sent.`))
        return
      }
      resolve(parts)
    }

    const unzip = new Unzip(file => {
      if (settled) return
      entries += 1
      if (entries > MAX_ZIP_ENTRIES) {
        fail(`the archive contains more than ${MAX_ZIP_ENTRIES} entries.`)
        return
      }
      const path = file.name.replace(/\\/g, '/')
      if (!selected(path)) return
      if (file.compression !== 0 && file.compression !== 8) {
        fail('the document uses an unsupported compression method.')
        return
      }
      if ((file.originalSize ?? 0) > MAX_XML_ENTRY_BYTES) {
        fail('an Office text part is larger than the safe extraction limit.')
        return
      }

      pending += 1
      const chunks: Uint8Array[] = []
      let actualSize = 0
      file.ondata = (error, chunk, final) => {
        if (settled) return
        if (error) {
          void file.terminate()
          fail('the document could not be decompressed. It may be encrypted or corrupt.')
          return
        }
        actualSize += chunk.byteLength
        selectedBytes += chunk.byteLength
        if (actualSize > MAX_XML_ENTRY_BYTES || selectedBytes > MAX_SELECTED_XML_BYTES) {
          void file.terminate()
          fail('the document expands beyond the safe extraction limit.')
          return
        }
        chunks.push(chunk)
        if (!final) return
        try {
          const merged = new Uint8Array(actualSize)
          let offset = 0
          for (const part of chunks) {
            merged.set(part, offset)
            offset += part.byteLength
          }
          parts.set(path, decodeUtf8(merged, name))
          pending -= 1
          finishIfReady()
        } catch (failure) {
          fail((failure as Error).message || 'the document text could not be decoded.')
        }
      }
      try {
        file.start()
      } catch {
        pending -= 1
        fail('the document could not be opened. It may be encrypted, corrupt, or DRM-protected.')
      }
    })
    unzip.register(UnzipInflate)
    unzip.register(UnzipPassThrough)
    try {
      unzip.push(data, true)
      archiveEnded = true
      finishIfReady()
    } catch {
      fail('the archive could not be read. It may be encrypted, corrupt, or DRM-protected.')
    }
  })
}

function parseXml(xml: string, name: string): XMLDocument {
  // Office documents do not need DTDs or entity declarations. Refuse them
  // rather than asking the browser's XML parser to expand attacker-controlled
  // entities or resolve an external reference.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new Error(`${name}: this document uses XML declarations that are not read. Nothing was sent.`)
  }
  if (typeof DOMParser === 'undefined') {
    throw new Error(`${name}: this window has no safe XML parser. Nothing was sent.`)
  }
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) {
    throw new Error(`${name}: an Office text part is corrupt, encrypted, or incomplete. Nothing was sent.`)
  }
  return document
}

function descendantsByLocalName(root: ParentNode, localName: string): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(element => element.localName === localName)
}

function joinedText(root: ParentNode, tagName: string): string {
  return descendantsByLocalName(root, tagName).map(node => node.textContent ?? '').join('')
}

function paragraphText(xml: string, name: string, paragraphNames: readonly string[] = ['p', 'h']): string[] {
  const document = parseXml(xml, name)
  return Array.from(document.getElementsByTagName('*'))
    .filter(element => paragraphNames.includes(element.localName))
    .map(paragraph => joinedText(paragraph, 't').trim())
    .filter(Boolean)
}

function sheetText(xml: string, sharedStrings: string[], sheetName: string, fileName: string): string[] {
  const document = parseXml(xml, fileName)
  const rows = Array.from(document.getElementsByTagName('*')).filter(element => element.localName === 'row')
  const lines: string[] = []
  for (const row of rows) {
    const cells = Array.from(row.getElementsByTagName('*')).filter(element => element.localName === 'c')
    const values = cells.flatMap(cell => {
      const address = cell.getAttribute('r') || ''
      const type = cell.getAttribute('t') || ''
      let value = ''
      if (type === 'inlineStr') {
        value = joinedText(cell, 't')
      } else {
        const raw = descendantsByLocalName(cell, 'v')[0]?.textContent ?? ''
        if (type === 's') {
          const index = Number(raw)
          value = Number.isInteger(index) ? sharedStrings[index] ?? '' : ''
        } else {
          value = raw
        }
      }
      return value ? [`${address ? `${address}=` : ''}${value}`] : []
    })
    if (values.length) lines.push(values.join(' | '))
  }
  return lines.length ? [`[${sheetName}]`, ...lines] : []
}

function extractOfficeText(parts: Map<string, string>, ext: string, name: string): string {
  const lines: string[] = []
  if (ext === 'docx') {
    const main = parts.get('word/document.xml')
    if (!main) throw new Error(`${name}: the Word document body is missing or unreadable. Nothing was sent.`)
    lines.push(...paragraphText(main, name, ['p']))
    for (const [path, xml] of parts) {
      if (/^word\/(?:header|footer|footnotes|endnotes)\d*\.xml$/i.test(path)) {
        lines.push(...paragraphText(xml, name, ['p']))
      }
    }
  } else if (ext === 'pptx') {
    const slides = [...parts.entries()]
      .filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort(([a], [b]) => Number(a.match(/slide(\d+)/i)?.[1]) - Number(b.match(/slide(\d+)/i)?.[1]))
    if (!slides.length) throw new Error(`${name}: no readable presentation slides were found. Nothing was sent.`)
    for (const [path, xml] of slides) {
      const slide = Number(path.match(/slide(\d+)/i)?.[1] ?? 0)
      lines.push(`[Slide ${slide}]`, ...paragraphText(xml, name, ['p']))
    }
  } else if (ext === 'xlsx') {
    const sharedXml = parts.get('xl/sharedStrings.xml')
    const shared = sharedXml
      ? Array.from(parseXml(sharedXml, name).getElementsByTagName('*'))
          .filter(element => element.localName === 'si')
          .map(item => joinedText(item, 't'))
      : []
    const sheets = [...parts.entries()]
      .filter(([path]) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
      .sort(([a], [b]) => Number(a.match(/sheet(\d+)/i)?.[1]) - Number(b.match(/sheet(\d+)/i)?.[1]))
    if (!sheets.length) throw new Error(`${name}: no readable workbook sheets were found. Nothing was sent.`)
    for (const [path, xml] of sheets) {
      const number = Number(path.match(/sheet(\d+)/i)?.[1] ?? 0)
      lines.push(...sheetText(xml, shared, `Sheet ${number}`, name))
    }
  } else {
    const content = parts.get('content.xml')
    if (!content) throw new Error(`${name}: the document text part is missing or unreadable. Nothing was sent.`)
    lines.push(...paragraphText(content, name, ['p', 'h']))
  }
  return assertTextBudget(lines.join('\n'), name)
}

async function extractOffice(file: File, ext: string): Promise<string> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`${file.name}: Office documents are limited to ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB for safe local extraction. Nothing was sent.`)
  }
  const data = new Uint8Array(await file.arrayBuffer())
  const partIsWanted = (path: string): boolean => {
    if (ext === 'docx') {
      return path === 'word/document.xml' || /^word\/(?:header|footer|footnotes|endnotes)\d*\.xml$/i.test(path)
    }
    if (ext === 'pptx') return /^ppt\/slides\/slide\d+\.xml$/i.test(path)
    if (ext === 'xlsx') return path === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)
    return path === 'content.xml'
  }
  const parts = await readZipTextParts(data, file.name, partIsWanted)
  if (ext === 'pptx' && [...parts.keys()].filter(path => /^ppt\/slides\/slide\d+\.xml$/i.test(path)).length > 24) {
    throw new Error(`${file.name}: presentations are limited to 24 slides for safe local extraction. Nothing was sent.`)
  }
  if (ext === 'xlsx' && [...parts.keys()].filter(path => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)).length > 24) {
    throw new Error(`${file.name}: workbooks are limited to 24 sheets for safe local extraction. Nothing was sent.`)
  }
  return extractOfficeText(parts, ext, file.name)
}

async function extractPdf(file: File): Promise<string> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`${file.name}: PDFs are limited to ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB for safe local extraction. Nothing was sent.`)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (decodeUtf8(bytes.slice(0, 5), file.name) !== PDF_MAGIC) {
    throw new Error(`${file.name}: the file does not have a valid PDF header. It may be corrupt or mislabeled. Nothing was sent.`)
  }

  type PdfDocument = {
    numPages: number
    getPage: (page: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }>
    getPermissions: () => Promise<number[] | null>
    destroy: () => Promise<void>
  }
  let loadingTask: { promise: Promise<unknown>; destroy: () => Promise<void> } | undefined
  let pdf: PdfDocument | undefined
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    loadingTask = pdfjs.getDocument({
      data: bytes,
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
      stopAtErrors: true,
      useWasm: false,
      maxImageSize: 1_000_000,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    })
    const loadedPdf = (await loadingTask.promise) as PdfDocument
    pdf = loadedPdf
    if (loadedPdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`${file.name}: PDFs are limited to ${MAX_PDF_PAGES} pages for safe local extraction. Nothing was sent.`)
    }
    const permissions = await loadedPdf.getPermissions()
    if (permissions && !permissions.includes(pdfjs.PermissionFlag.COPY)) {
      throw new Error(`${file.name}: this PDF does not permit text extraction (DRM/copy protection). Nothing was read or sent.`)
    }
    const lines: string[] = []
    let size = 0
    for (let pageNumber = 1; pageNumber <= loadedPdf.numPages; pageNumber += 1) {
      const page = await loadedPdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map(item => `${item.str ?? ''}${item.hasEOL ? '\n' : ' '}`)
        .join('')
        .trim()
      if (text) {
        size += text.length + 1
        if (size > MAX_DOCUMENT_TEXT) {
          throw new Error(`${file.name}: extraction produced more than ${MAX_DOCUMENT_TEXT.toLocaleString()} characters. Nothing was truncated or sent.`)
        }
        lines.push(text)
      }
    }
    const extracted = assertTextBudget(lines.join('\n'), file.name)
    if (!extracted) {
      throw new Error(`${file.name}: no selectable text was found. It may be a scan, encrypted, or DRM-protected; nothing was sent.`)
    }
    return extracted
  } catch (failure) {
    const error = failure as Error & { name?: string }
    if (error.message.startsWith(`${file.name}:`)) throw error
    if (error.name === 'PasswordException') {
      throw new Error(`${file.name}: this PDF is password-protected. Unlock it yourself before attaching; nothing was read or sent.`)
    }
    throw new Error(`${file.name}: the PDF could not be read. It may be corrupt, encrypted, or DRM-protected. Nothing was sent.`)
  } finally {
    try {
      await pdf?.destroy()
      await loadingTask?.destroy()
    } catch {
      // Cleanup only; an extraction refusal is already reported above.
    }
  }
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, value: string) => {
    if (value[0] !== '#') return named[value.toLowerCase()] ?? entity
    const codePoint = value[1]?.toLowerCase() === 'x' ? Number.parseInt(value.slice(2), 16) : Number.parseInt(value.slice(1), 10)
    try {
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\uFFFD'
    } catch {
      return '\uFFFD'
    }
  })
}

function extractHtmlText(source: string, name: string): string {
  // Never parse an uploaded HTML document into a DOM: even an inert document
  // may fetch referenced images or frames. This bounded string-only pass does
  // not create elements, resolve URLs, or run scripts.
  const text = source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*(script|style|noscript|template|iframe|object|embed|svg|math|head|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*(script|style|noscript|template|iframe|object|embed|svg|math|head|form)\b[^>]*\/?\s*>/gi, ' ')
    .replace(/<\s*br\b[^>]*>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|h[1-6]|tr|section|article)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
  const readable = decodeHtmlEntities(text).replace(/[ \t]+/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n')
  return assertTextBudget(readable, name)
}

/** Extract readable text from supported file types; binary types return a clear refusal. */
export async function extractDocumentText(file: File): Promise<string> {
  const ext = extensionOf(file.name)
  if (ext === 'pdf' || file.type === 'application/pdf') return extractPdf(file)
  if (OFFICE_EXTENSIONS.has(ext)) return extractOffice(file, ext)

  if (ext === 'html' || ext === 'htm' || file.type === 'text/html') {
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`${file.name}: HTML files are limited to 8 MB for safe local extraction. Nothing was sent.`)
    const source = await file.text()
    return extractHtmlText(source, file.name)
  }

  if (ext === 'rtf' || file.type === 'application/rtf') {
    if (file.size > 64 * 1024) throw new Error(`${file.name}: RTF files are limited to 64 KB. Nothing was sent.`)
    const source = await file.text()
    const plain = source
      .replace(/\\'[0-9a-f]{2}/gi, ' ')
      .replace(/\\(?:par|line)\b ?/gi, '\n')
      .replace(/\\tab\b ?/gi, '\t')
      .replace(/\\u(-?\d+)\??/gi, (_match, code: string) => String.fromCharCode(Number(code) < 0 ? Number(code) + 65536 : Number(code)))
      .replace(/\\[a-z]+-?\d* ?/gi, '')
      .replace(/[{}]/g, '')
    return assertTextBudget(plain, file.name)
  }

  if (file.size > 64 * 1024) throw new Error(`${file.name}: text files are limited to 64 KB. Nothing was sent.`)
  const source = await file.text()
  if (source.includes('\0') || source.includes('\uFFFD')) {
    throw new Error(`${file.name}: this is not readable UTF-8 text. It may be corrupt or encrypted. Nothing was sent.`)
  }
  return assertTextBudget(source, file.name)
}
