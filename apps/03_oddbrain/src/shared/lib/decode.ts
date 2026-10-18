/**
 * Decoding the things people actually attach.
 *
 * A chat box that only takes PNG and .txt is a chat box that lies about the
 * word "attach". This module reads what the window itself can decode, and
 * when it cannot decode something it says which part failed — never that a
 * file was "read" when only its container was.
 *
 * Rules it keeps:
 * - Nothing is sent anywhere. Everything here runs in the window.
 * - Every limit is stated in the refusal, not discovered later.
 * - A scan without a text layer is not a document we can read; saying so is
 *   the honest answer, and it is a different answer from "unsupported".
 */

/** Longest side sent to a model with vision. Bigger is resampled, not refused. */
export const MAX_IMAGE_SIDE = 1568
/** Decoded bytes for one image, base64 after re-encoding. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
/** Characters of extracted text one attachment may add. */
export const MAX_TEXT_LENGTH = 12_000
/** The file size above which a document is refused before parsing. */
export const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024

export type Inflater = (bytes: Uint8Array) => Promise<Uint8Array>
export type ImageDecoder = (file: File) => Promise<{ width: number; height: number; png: Uint8Array } | null>

/** The zlib/deflate inflater this window has, or none. */
export function browserInflater(): Inflater | null {
  const Stream = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
  if (!Stream) return null
  return async (bytes) => {
    // PDF streams are zlib-wrapped; DecompressionStream('deflate') is zlib.
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new Stream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
}

/** True when this window can decode pictures at all. */
export function imagesSupported(): boolean {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function'
}

/**
 * Any raster the window can open, resampled to a PNG the engine accepts.
 * Returns null when the window cannot decode the format — HEIC and some RAW
 * files land here, and the caller must say so rather than guess.
 */
export async function decodeImage(file: File): Promise<{ width: number; height: number; png: Uint8Array } | null> {
  if (!imagesSupported()) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const pen = canvas.getContext('2d')
    if (!pen) return null
    pen.drawImage(bitmap, 0, 0, width, height)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return { width, height, png: new Uint8Array(await blob.arrayBuffer()) }
  } finally {
    bitmap.close?.()
  }
}

const ascii = (bytes: Uint8Array, start = 0, end = bytes.length): string =>
  new TextDecoder('latin1').decode(bytes.subarray(start, end))

/**
 * Text from a PDF, without a renderer.
 *
 * Reads the content streams, inflates the ones that are compressed, and pulls
 * the strings out of the text-showing operators (`Tj`, `TJ`, `'`, `"`). That
 * covers the overwhelming majority of born-digital PDFs. A scan has no text
 * operators at all, and this returns an empty string — which the caller must
 * report as "no text layer", not as an empty document.
 */
export async function pdfText(bytes: Uint8Array, inflate: Inflater | null): Promise<{ text: string; pages: number }> {
  const body = ascii(bytes)
  const pages = (body.match(/\/Type\s*\/Page[^s]/g) || []).length || 1
  const chunks: string[] = []
  const streamRe = /stream\r?\n/g
  let match: RegExpExecArray | null
  while ((match = streamRe.exec(body))) {
    const start = match.index + match[0].length
    const end = body.indexOf('endstream', start)
    if (end < 0) break
    // The bytes must come from the original array, not the latin1 view.
    const raw = bytes.subarray(start, end)
    let data = raw
    if (inflate) {
      try {
        data = await inflate(raw)
      } catch {
        // Not a Flate stream (an image, a font). Skip it, keep reading.
        streamRe.lastIndex = end + 9
        continue
      }
    }
    const text = ascii(data)
    if (!text.includes('BT')) { streamRe.lastIndex = end + 9; continue }
    chunks.push(text)
    streamRe.lastIndex = end + 9
  }
  const out: string[] = []
  for (const chunk of chunks) {
    const show = /\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]\\]|\\.)*\]\s*TJ|\((?:\\.|[^\\)])*\)\s*'/g
    let piece: RegExpExecArray | null
    while ((piece = show.exec(chunk))) {
      const literal = piece[0].match(/\((?:\\.|[^\\)])*\)/g) || []
      for (const one of literal) out.push(unescapePdfString(one.slice(1, -1)))
    }
  }
  return { text: out.join(' ').replace(/\s+/g, ' ').trim(), pages }
}

/** PDF string escapes: \\n, \\(, \\101 octal, and the rest. */
export function unescapePdfString(raw: string): string {
  return raw.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_all, code: string) => {
    if (/^[0-7]+$/.test(code)) return String.fromCharCode(parseInt(code, 8))
    const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }
    return map[code] ?? code
  })
}

/**
 * A zip, read in the window: central directory, stored and deflate entries.
 * Office files are zips, and this is what lets .docx/.xlsx/.pptx be read
 * without shipping a parser for each one.
 */
export async function readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 22 - 65_536; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('This is not a zip container.')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  const Stream = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = bytes.subarray(dataStart, dataStart + compressedSize)
    if (method === 0) entries.set(name, raw)
    else if (method === 8 && Stream) {
      const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new Stream('deflate-raw'))
      entries.set(name, new Uint8Array(await new Response(stream).arrayBuffer()))
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** XML to readable text: paragraphs and cells keep their breaks, tags go. */
export function xmlText(xml: string): string {
  return xml
    .replace(/<w:p[ >]/g, '\n<w:p ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/a:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/c>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type DocumentResult = { ok: true; kind: 'text'; text: string; note: string } | { ok: false; problem: string }

/**
 * Office documents, read for their words.
 *
 * .docx, .xlsx and .pptx are zips of XML; the text is inside. Formatting,
 * images and formulas are not carried into the chat — the note says so, so
 * nobody assumes a chart was understood.
 */
export async function officeText(file: File): Promise<DocumentResult> {
  let entries: Map<string, Uint8Array>
  try {
    entries = await readZipEntries(new Uint8Array(await file.arrayBuffer()))
  } catch {
    return { ok: false, problem: `${file.name}: this does not look like an Office file (its container could not be opened).` }
  }
  const decode = (name: string): string => {
    const bytes = entries.get(name)
    return bytes ? new TextDecoder().decode(bytes) : ''
  }
  const lower = file.name.toLowerCase()
  try {
    if (lower.endsWith('.docx')) {
      const text = xmlText(decode('word/document.xml'))
      if (!text) return { ok: false, problem: `${file.name}: the document has no text in it.` }
      return { ok: true, kind: 'text', text, note: 'Text only: formatting, pictures and comments were not carried over.' }
    }
    if (lower.endsWith('.xlsx')) {
      const shared = [...decode('xl/sharedStrings.xml').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1])
      const sheets = [...entries.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()
      const rows: string[] = []
      for (const sheet of sheets) {
        const xml = decode(sheet)
        for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
          const cells = [...row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map(cell => {
            const attrs = cell[1]
            const body = cell[2]
            const type = (attrs.match(/\bt="(\w+)"/) || [])[1]
            if (type === 's') {
              const index = Number((body.match(/<v>(\d+)<\/v>/) || [])[1])
              return shared[index] ? xmlText(shared[index]) : ''
            }
            const inline = body.match(/<is>([\s\S]*?)<\/is>/)
            if (inline) return xmlText(inline[1])
            const value = body.match(/<v>([\s\S]*?)<\/v>/)
            return value ? xmlText(value[1]) : ''
          })
          if (cells.some(Boolean)) rows.push(cells.join(' | '))
        }
      }
      const text = rows.join('\n')
      if (!text) return { ok: false, problem: `${file.name}: the workbook has no cell text in it.` }
      return { ok: true, kind: 'text', text, note: 'Cell values only: formulas, charts and formatting were not evaluated.' }
    }
    if (lower.endsWith('.pptx')) {
      const slides = [...entries.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
      const text = slides.map((slide, index) => `Slide ${index + 1}\n${xmlText(decode(slide))}`).join('\n\n')
      if (!text.trim()) return { ok: false, problem: `${file.name}: the slides have no text in them.` }
      return { ok: true, kind: 'text', text, note: 'Slide text only: images, layouts and speaker notes were not carried over.' }
    }
  } catch {
    return { ok: false, problem: `${file.name}: the Office file could not be read. It may be damaged or password-protected.` }
  }
  return { ok: false, problem: `${file.name}: that Office format is not supported here.` }
}

export type AudioFacts = { duration: number; channels: number; sampleRate: number }

/**
 * What an audio file actually contains — measured, not guessed.
 *
 * The engines cannot hear. So the honest answer is the truth about the file
 * (how long, how many channels) plus the two things the app can really do:
 * transcribe it with dictation, or take your words instead. Nothing claims
 * to have listened.
 */
export async function audioFacts(file: File): Promise<AudioFacts | null> {
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
  if (!Ctx) return null
  const ctx = new Ctx()
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer())
    return { duration: audio.duration, channels: audio.numberOfChannels, sampleRate: audio.sampleRate }
  } catch {
    return null
  } finally {
    void ctx.close()
  }
}

/** "3 minutes 20 seconds", for a refusal that reads like a sentence. */
export function describeDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (!minutes) return `${rest} second${rest === 1 ? '' : 's'}`
  return `${minutes} minute${minutes === 1 ? '' : 's'} ${rest} second${rest === 1 ? '' : 's'}`
}

/** What kind of thing this file is, from its name and type. */
export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'office' | 'text' | 'unknown'
export function mediaKind(file: { name: string; type: string }): MediaKind {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (/\.(docx|xlsx|pptx)$/.test(name)) return 'office'
  if (file.type.startsWith('text/') || /\.(txt|md|csv|json|js|jsx|ts|tsx|html?|css|py|xml|ya?ml|log|sql|sh|bat|c|cpp|h|java|rs)$/.test(name)) return 'text'
  // A type the window did not recognise, but a picture extension: still try it.
  if (/\.(png|jpe?g|webp|gif|bmp|avif|ico|tiff?|svg|heic|heif|raw|cr2|nef|dng)$/.test(name)) return 'image'
  if (/\.(mp4|webm|mov|m4v|ogv|avi|mkv)$/.test(name)) return 'video'
  if (/\.(mp3|wav|m4a|aac|ogg|opus|flac|weba)$/.test(name)) return 'audio'
  return 'unknown'
}
