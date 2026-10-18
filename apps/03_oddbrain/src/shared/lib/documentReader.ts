import { Inflate, strFromU8 } from 'fflate'

/** Local text extraction only. Never execute document macros, scripts or links. */
export const DOCUMENT_EXTENSIONS = /\.(?:pdf|docx|pptx|xlsx|odt|ods|odp|epub)$/i
export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024
export const MAX_DOCUMENT_TEXT = 12_000
/** A PDF page with no extractable text cannot be silently omitted. The app
 * may offer to render all pages as pictures instead, with explicit consent. */
export class PdfNeedsVisionError extends Error {
  constructor(readonly unreadablePages: number[], readonly totalPages: number) {
    super(`PDF page${unreadablePages.length === 1 ? '' : 's'} ${unreadablePages.slice(0, 8).join(', ')}${unreadablePages.length > 8 ? ' and others' : ''} ${unreadablePages.length === 1 ? 'has' : 'have'} no extractable text. Scans need vision or OCR; no pages were silently skipped.`)
  }
}
const MAX_ARCHIVE_ENTRIES = 256
const MAX_ARCHIVE_OUTPUT = 32 * 1024 * 1024
const MAX_ARCHIVE_ENTRY = 8 * 1024 * 1024

type ZipEntry = { name: string; method: number; size: number; compressed: number; crc: number; offset: number }
const viewOf = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = viewOf(bytes)
  let end = -1
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 22 - 65535); p--) {
    if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break }
  }
  if (end < 0) throw new Error('The document has no complete ZIP directory. It may be damaged or encrypted.')
  const count = view.getUint16(end + 10, true)
  const directorySize = view.getUint32(end + 12, true)
  const start = view.getUint32(end + 16, true)
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 ||
      view.getUint16(end + 8, true) !== count || count > MAX_ARCHIVE_ENTRIES ||
      count === 0xffff || start === 0xffffffff || directorySize === 0xffffffff ||
      start + directorySize > end) throw new Error('This document archive is too large or uses an unsupported ZIP variant.')
  const entries: ZipEntry[] = []
  let p = start, total = 0
  for (let n = 0; n < count; n++) {
    if (p + 46 > end || view.getUint32(p, true) !== 0x02014b50) throw new Error('The document ZIP directory is damaged.')
    const flags = view.getUint16(p + 8, true), method = view.getUint16(p + 10, true)
    const crc = view.getUint32(p + 16, true), compressed = view.getUint32(p + 20, true)
    const size = view.getUint32(p + 24, true), nameSize = view.getUint16(p + 28, true)
    const offset = view.getUint32(p + 42, true)
    const next = p + 46 + nameSize + view.getUint16(p + 30, true) + view.getUint16(p + 32, true)
    if (next > end || flags & 1 || ![0, 8].includes(method) || size > MAX_ARCHIVE_ENTRY ||
        compressed > bytes.length || offset === 0xffffffff || size === 0xffffffff) {
      throw new Error('The document contains an encrypted, unsupported or oversized ZIP entry.')
    }
    const name = strFromU8(bytes.subarray(p + 46, p + 46 + nameSize))
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || name.includes('\0')) {
      throw new Error('The document has an unsafe entry path.')
    }
    total += size
    if (total > MAX_ARCHIVE_OUTPUT) throw new Error('The document expands beyond the 32 MB safety limit.')
    entries.push({ name, method, size, compressed, crc, offset })
    p = next
  }
  if (p !== start + directorySize) throw new Error('The document ZIP directory size does not match its entries.')
  return entries
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const value of bytes) {
    crc ^= value
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipPart(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const view = viewOf(bytes), p = entry.offset
  if (p + 30 > bytes.length || view.getUint32(p, true) !== 0x04034b50 ||
      view.getUint16(p + 8, true) !== entry.method || view.getUint16(p + 6, true) & 1) {
    throw new Error('The document contains a damaged or encrypted ZIP entry.')
  }
  const nameSize = view.getUint16(p + 26, true)
  const start = p + 30 + nameSize + view.getUint16(p + 28, true)
  if (start + entry.compressed > bytes.length ||
      strFromU8(bytes.subarray(p + 30, p + 30 + nameSize)) !== entry.name) {
    throw new Error('The document ZIP entry does not match its directory.')
  }
  const compressed = bytes.subarray(start, start + entry.compressed)
  let output: Uint8Array
  if (entry.method === 0) {
    output = compressed
  } else {
    const chunks: Uint8Array[] = []
    let length = 0
    const decoder = new Inflate((chunk) => {
      length += chunk.length
      if (length > entry.size || length > MAX_ARCHIVE_ENTRY) throw new Error('The document expands beyond its declared size.')
      chunks.push(chunk)
    })
    for (let i = 0; i < compressed.length; i += 16 * 1024) {
      decoder.push(compressed.subarray(i, i + 16 * 1024), i + 16 * 1024 >= compressed.length)
    }
    output = new Uint8Array(length)
    let at = 0
    for (const chunk of chunks) { output.set(chunk, at); at += chunk.length }
  }
  if (output.length !== entry.size || crc32(output) !== entry.crc) throw new Error('The document entry failed its size or checksum check.')
  return output
}

function xmlDocument(bytes: Uint8Array): Document {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) throw new Error('Document XML with external entities is not read.')
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  if (parsed.getElementsByTagName('parsererror').length) throw new Error('The document XML is damaged.')
  return parsed
}

function xmlParagraphs(doc: Document, paragraphNames: string[], textNames: string[]): string[] {
  const paragraphs = Array.from(doc.getElementsByTagName('*')).filter(node => paragraphNames.includes(node.localName))
  return paragraphs.map(paragraph => Array.from(paragraph.getElementsByTagName('*'))
    .filter(node => textNames.includes(node.localName))
    .map(node => node.localName === 'tab' ? '\t' : node.localName === 'br' ? '\n' : node.textContent || '')
    .join('').trim()).filter(Boolean)
}

function readOfficeZip(bytes: Uint8Array, extension: string): string {
  const entries = zipEntries(bytes)
  const byName = new Map(entries.map(entry => [entry.name, entry]))
  const part = (name: string): Document | null => {
    const entry = byName.get(name)
    return entry ? xmlDocument(zipPart(bytes, entry)) : null
  }
  let paragraphs: string[] = []
  if (extension === 'docx') {
    if (!byName.has('word/document.xml')) throw new Error('This is not a readable Word document; it may be encrypted or damaged.')
    const names = ['word/document.xml', ...entries.map(entry => entry.name).filter(name => /^word\/(?:header|footer|footnotes|endnotes)\d*\.xml$/.test(name))]
    for (const name of names) { const doc = part(name); if (doc) paragraphs.push(...xmlParagraphs(doc, ['p'], ['t', 'tab', 'br'])) }
  } else if (extension === 'pptx') {
    const names = entries.map(entry => entry.name).filter(name => /^ppt\/(?:slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    for (const name of names) { const doc = part(name); if (doc) paragraphs.push(...xmlParagraphs(doc, ['p'], ['t'])) }
  } else if (extension === 'xlsx') {
    const shared = part('xl/sharedStrings.xml')
    const strings = shared ? Array.from(shared.getElementsByTagName('*')).filter(node => node.localName === 'si')
      .map(node => Array.from(node.getElementsByTagName('*')).filter(child => child.localName === 't').map(child => child.textContent || '').join('')) : []
    const names = entries.map(entry => entry.name).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    for (const name of names) {
      const doc = part(name)
      if (!doc) continue
      for (const row of Array.from(doc.getElementsByTagName('*')).filter(node => node.localName === 'row')) {
        const cells = Array.from(row.children).filter(node => node.localName === 'c').map(cell => {
          const value = Array.from(cell.children).find(node => node.localName === 'v')?.textContent || ''
          if (cell.getAttribute('t') === 's') return strings[Number(value)] || ''
          if (cell.getAttribute('t') === 'inlineStr') return Array.from(cell.getElementsByTagName('*')).filter(node => node.localName === 't').map(node => node.textContent || '').join('')
          return value
        })
        if (cells.some(Boolean)) paragraphs.push(cells.join('\t'))
      }
    }
  } else if (['odt', 'ods', 'odp'].includes(extension)) {
    const doc = part('content.xml')
    if (doc) {
      const words = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
        if (node.nodeType !== Node.ELEMENT_NODE) return ''
        const element = node as Element
        if (element.localName === 'tab') return '\t'
        if (element.localName === 'line-break') return '\n'
        if (element.localName === 's') return ' '.repeat(Math.min(20, Number(element.getAttribute('text:c') || 1) || 1))
        return Array.from(node.childNodes).map(words).join('')
      }
      paragraphs = Array.from(doc.getElementsByTagName('*'))
        .filter(node => ['p', 'h'].includes(node.localName)).map(node => words(node).trim()).filter(Boolean)
    }
  } else if (extension === 'epub') {
    const names = entries.map(entry => entry.name).filter(name => /\.(?:xhtml|html)$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    for (const name of names) {
      const entry = byName.get(name)!
      const html = new TextDecoder('utf-8', { fatal: true }).decode(zipPart(bytes, entry))
      const doc = new DOMParser().parseFromString(html, 'text/html')
      doc.querySelectorAll('script, style, noscript, svg').forEach(node => node.remove())
      const text = doc.body?.textContent?.replace(/\s+/g, ' ').trim()
      if (text) paragraphs.push(text)
    }
  }
  const text = paragraphs.join('\n').trim()
  if (!text) throw new Error(`No readable text was found in this ${extension.toUpperCase()} file. Scans, protected files and embedded media are not treated as text.`)
  return text
}

async function pdfTask(bytes: Uint8Array): Promise<import('pdfjs-dist').PDFDocumentLoadingTask> {
  // Imported only on a PDF attachment. Vite packages the worker locally; no
  // CDN, plug-in, background upload or PDF executable is involved.
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  GlobalWorkerOptions.workerSrc = worker.default
  return getDocument({ data: bytes, stopAtErrors: true, maxImageSize: 25_000_000 })
}

async function readPdf(bytes: Uint8Array): Promise<string> {
  const task = await pdfTask(bytes)
  try {
    const pdf = await task.promise
    if (pdf.numPages > 80) throw new Error('This PDF has more than 80 pages. Split it into smaller files; no pages were silently skipped.')
    const pages: string[] = []
    const unreadable: number[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const text = content.items.map(item => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').trim()
      if (text) pages.push(`Page ${i}:\n${text}`)
      else unreadable.push(i)
      if (pages.join('\n\n').length > MAX_DOCUMENT_TEXT) throw new Error('This PDF exceeds 12,000 characters. Split it into smaller files; no content was silently dropped.')
      page.cleanup()
    }
    if (unreadable.length) throw new PdfNeedsVisionError(unreadable, pdf.numPages)
    if (!pages.length) throw new Error('This PDF has no extractable text. Scanned pages need OCR or a vision-capable model; nothing was read.')
    return pages.join('\n\n')
  } catch (error) {
    if ((error as Error).name === 'PasswordException') throw new Error('This PDF is password-protected. Unlock it before attaching; nothing was read.')
    throw error
  } finally {
    await task.destroy()
  }
}

/** When a scanned PDF has no selectable text, render ALL its pages locally
 * as pictures. A vision-capable selected model may see them directly; otherwise
 * the app asks for an explicit provider before any page leaves this window. */
export async function renderPdfPages(file: File, availableSlots: number): Promise<File[]> {
  if (!/\.pdf$/i.test(file.name) || file.size > MAX_DOCUMENT_BYTES || availableSlots < 1) {
    throw new Error(`${file.name}: this PDF cannot be rendered safely within the attachment limit.`)
  }
  const task = await pdfTask(new Uint8Array(await file.arrayBuffer()))
  try {
    const pdf = await task.promise
    if (pdf.numPages > 4 || pdf.numPages > availableSlots) {
      throw new Error(`${file.name}: ${pdf.numPages} pages need ${pdf.numPages} picture slots (maximum four). Split the PDF or remove other attachments; no pages were skipped.`)
    }
    const pictures: File[] = []
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      const original = page.getViewport({ scale: 1 })
      const scale = Math.min(1.5, 960 / Math.max(original.width, original.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(viewport.width))
      canvas.height = Math.max(1, Math.ceil(viewport.height))
      const pen = canvas.getContext('2d', { willReadFrequently: true })
      if (!pen) throw new Error('The window has no PDF page canvas available.')
      pen.fillStyle = '#fff'; pen.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: pen, viewport }).promise
      // PDF.js has an image-size safety ceiling. If it omitted a very large
      // embedded scan, a blank render must not be presented as a read page.
      const pixels = pen.getImageData(0, 0, canvas.width, canvas.height).data
      let ink = false
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) { ink = true; break }
      }
      if (!ink) throw new Error(`${file.name}: page ${index} rendered blank or exceeded the safe image decoder limit. Nothing was attached.`)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.78))
      if (!blob || !blob.size || blob.size > 2 * 1024 * 1024) throw new Error(`${file.name}: page ${index} cannot fit under 2 MB. Nothing was attached.`)
      pictures.push(new File([blob], `${file.name} [page ${index}/${pdf.numPages}].jpg`, { type: 'image/jpeg' }))
      page.cleanup()
    }
    return pictures
  } catch (error) {
    if ((error as Error).name === 'PasswordException') throw new Error('This PDF is password-protected. Unlock it before attaching; nothing was read.')
    throw error
  } finally { await task.destroy() }
}

/** Read a bounded document as actual text, or refuse without pretending. */
export async function readDocumentText(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (!DOCUMENT_EXTENSIONS.test(file.name)) throw new Error(`${file.name}: this document format is not supported locally.`)
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`${file.name}: documents are limited to 12 MB.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let text: string
  if (extension === 'pdf') {
    if (strFromU8(bytes.subarray(0, 5)) !== '%PDF-') throw new Error(`${file.name}: not a valid PDF file.`)
    text = await readPdf(bytes)
  } else {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(`${file.name}: not a readable ZIP-based document; legacy binary or encrypted files need conversion.`)
    try { text = readOfficeZip(bytes, extension) }
    catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new Error(`${file.name}: this document could not be decoded safely.`)
      throw error
    }
  }
  if (text.length > MAX_DOCUMENT_TEXT) throw new Error(`${file.name}: more than 12,000 characters. Split it into smaller files; nothing was silently truncated.`)
  return text
}
