/**
 * The honest file reader.
 *
 * Anything the owner drops on the composer comes here if the window cannot
 * read it natively. Every outcome is one of two truths: real text that was
 * really extracted, or the REAL reason it could not be (no decoder, corrupt
 * structure, password, DRM, oversize). Nothing is ever guessed, and nothing
 * that was not read is ever claimed as read.
 *
 * Pure module: bytes in, sentence out. No electron imports, so the tests
 * drive it directly.
 */
import { inflateSync, inflateRawSync, gunzipSync } from 'node:zlib'
import { iterZipEntries, ZipRefusal, type ZipEntry, type ZipLimits } from './zipEntries'

export type DecodeOutcome = { ok: true; text: string } | { ok: false; reason: string }

/** Raw input the reader accepts at all (decoded OUTPUT is capped below). */
export const MAX_INGEST_BYTES = 64 * 1024 * 1024
/**
 * The same rule the composer's text path lives by (shared/lib/attachments
 * MAX_TEXT_LENGTH): the local context holds 12,000 characters, so a bigger
 * decode is refused with its exact number — never silently truncated.
 * tests/ingest-decode.test.ts pins the two constants equal.
 */
export const DECODED_TEXT_CAP = 12_000

/** Document zips: enough for real office files, short of a memory eater. */
const DOC_ZIP_LIMITS: ZipLimits = { files: 512, perFile: 32 * 1024 * 1024, totalUncompressed: 160 * 1024 * 1024 }

const fail = (reason: string): DecodeOutcome => ({ ok: false, reason })
const text = (value: string): DecodeOutcome => ({ ok: true, text: value })

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function extOf(name: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}

function withCap(decoded: string, name: string): DecodeOutcome {
  const trimmed = decoded.replace(/\n{3,}/g, '\n\n').trim()
  if (!trimmed) return fail(`${name}: the structure read fine, but there is no readable text inside (it may be images only).`)
  if (trimmed.length > DECODED_TEXT_CAP) {
    return fail(
      `${name}: decoded ${trimmed.length.toLocaleString('en-US')} characters — the local context holds ${DECODED_TEXT_CAP.toLocaleString('en-US')}. No content was cut silently; split the document and attach the part you need.`
    )
  }
  return text(trimmed)
}

// ---------------------------------------------------------------------------
// XML → text (OOXML, ODF, EPUB all reduce to this)
// ---------------------------------------------------------------------------

function decodeEntities(xml: string): string {
  return xml
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}

function stripXml(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<[^>]+>/g, (tag) => {
        if (/^<\/?(?:w:p|p|div|tr|h[1-6]|li|br)\b/i.test(tag)) return '\n'
        if (/^<w:tab\b/i.test(tag)) return '\t'
        return ''
      })
  )
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const PDF_TEXT_TOKEN = /\((?:\\[\s\S]|[^\\()])*\)\s*Tj|\[(?:\\[\s\S]|[^[\]])*\]\s*TJ|<[0-9A-Fa-f\s]+>\s*Tj|(?<![A-Za-z])(?:Td|TD|T\*|ET)(?![A-Za-z])/g
const PDF_INNER_STRING = /\((?:\\[\s\S]|[^\\()])*\)/g

function unescapePdfString(raw: string): string {
  const body = raw.slice(1, -1)
  return body.replace(/\\(\d{1,3}|.)/g, (_all, esc: string) => {
    if (/^\d/.test(esc)) {
      const code = Number.parseInt(esc, 8)
      return String.fromCharCode(code & 0xff)
    }
    const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
    return map[esc] ?? esc
  })
}

function hexToString(hex: string): string {
  const clean = hex.replace(/\s+/g, '')
  const bytes = new Uint8Array(Math.floor(clean.length / 2))
  for (let i = 0; i + 1 < clean.length; i += 2) bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16)
  // UTF-16BE (the common ToUnicode/CID form): mostly NUL in the odd spots.
  if (bytes.length >= 8 && bytes.length % 2 === 0) {
    let nul = 0
    for (let i = 1; i < bytes.length; i += 2) if (bytes[i] === 0) nul += 1
    if (nul > bytes.length / 4) return new TextDecoder('utf-16be').decode(bytes)
  }
  return new TextDecoder('latin1').decode(bytes)
}

function pdfContentText(content: string): string {
  let out = ''
  let match: RegExpExecArray | null
  PDF_TEXT_TOKEN.lastIndex = 0
  while ((match = PDF_TEXT_TOKEN.exec(content)) !== null) {
    const token = match[0]
    if (token.endsWith('Tj') && token.startsWith('(')) {
      out += unescapePdfString(token.slice(0, token.lastIndexOf(')') + 1))
    } else if (token.startsWith('<')) {
      out += hexToString(token.slice(0, token.indexOf('>')))
    } else if (token.startsWith('[')) {
      let inner: RegExpExecArray | null
      PDF_INNER_STRING.lastIndex = 0
      while ((inner = PDF_INNER_STRING.exec(token)) !== null) out += unescapePdfString(inner[0])
    } else {
      // A line move or block end: text operators break here, so the text does.
      if (out && !out.endsWith('\n')) out += '\n'
    }
  }
  return out
}

function decodePdf(bytes: Uint8Array, name: string): DecodeOutcome {
  const source = new TextDecoder('latin1').decode(bytes)
  if (!source.startsWith('%PDF-')) return fail(`${name}: the extension says PDF but the file does not start like one — it is corrupt or not a PDF.`)
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(source)) {
    return fail(`${name}: password-protected — this app does not decrypt PDFs. Open it with the password and export a copy without one.`)
  }
  let readable = 0
  let undecodable = 0
  let streamAt = 0
  const pieces: string[] = []
  for (;;) {
    const start = source.indexOf('stream', streamAt)
    if (start < 0) break
    let dataStart = start + 'stream'.length
    if (source[dataStart] === '\r') dataStart += 1
    if (source[dataStart] === '\n') dataStart += 1
    const end = source.indexOf('endstream', dataStart)
    if (end < 0) break
    const dict = source.slice(Math.max(0, start - 512), start)
    streamAt = end + 'endstream'.length
    if (/\/Subtype\s*\/Image/.test(dict)) continue
    if (/\/Font/.test(dict) && !/\/Contents/.test(dict)) continue
    const slice = bytes.subarray(dataStart, end)
    let decoded: string | null = null
    if (/\/FlateDecode/.test(dict)) {
      try { decoded = inflateSync(Buffer.from(slice), { maxOutputLength: 64 * 1024 * 1024 }).toString('latin1') } catch {
        try { decoded = inflateRawSync(Buffer.from(slice), { maxOutputLength: 64 * 1024 * 1024 }).toString('latin1') } catch { undecodable += 1 }
      }
    } else if (!/\/Filter/.test(dict)) {
      decoded = new TextDecoder('latin1').decode(slice)
    } else {
      continue // an image/audio filter stream: not text, not corruption
    }
    if (decoded !== null) {
      const chunk = pdfContentText(decoded)
      if (chunk.trim()) { pieces.push(chunk); readable += chunk.trim().length }
    }
  }
  const joined = pieces.join('\n')
  if (readable === 0) {
    if (undecodable > 0) return fail(`${name}: the PDF's compressed pages could not be inflated — the file is corrupt.`)
    return fail(`${name}: no readable text layer — it is likely a scan or pictures of text. Nothing was read, so nothing is claimed.`)
  }
  // Glyph-encoded pages extract as control-character soup; say so instead of
  // passing junk off as words.
  let controls = 0
  for (const char of joined) { const code = char.charCodeAt(0); if (code < 32 && char !== '\n' && char !== '\t' && char !== '\r') controls += 1 }
  if (controls / joined.length > 0.2) {
    return fail(`${name}: the text layer is glyph-encoded and cannot be turned into words honestly. Nothing was read, so nothing is claimed.`)
  }
  return withCap(joined, name)
}

// ---------------------------------------------------------------------------
// Office / ODF / EPUB (one zip, dispatched by what is inside)
// ---------------------------------------------------------------------------

function docxText(members: Map<string, Uint8Array>, name: string): DecodeOutcome {
  const order = [...members.keys()].filter(n =>
    n === 'word/document.xml' || n === 'word/footnotes.xml' || n === 'word/endnotes.xml' ||
    /^word\/header\d*\.xml$/.test(n) || /^word\/footer\d*\.xml$/.test(n)
  ).sort((a, b) => {
    const rank = (n: string): number => (n === 'word/document.xml' ? 0 : n === 'word/footnotes.xml' ? 1 : n === 'word/endnotes.xml' ? 2 : 3)
    return rank(a) - rank(b) || a.localeCompare(b)
  })
  if (!order.length) return fail(`${name}: the document.xml is missing — the file is corrupt or not a real DOCX.`)
  const body = order.map(n => stripXml(new TextDecoder('utf-8').decode(members.get(n) as Uint8Array))).join('\n')
  return withCap(body, name)
}

function pptxText(members: Map<string, Uint8Array>, name: string): DecodeOutcome {
  const slides = [...members.keys()].filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/slide(\d+)\.xml/.exec(a)?.[1] ?? 0) - Number(/slide(\d+)\.xml/.exec(b)?.[1] ?? 0))
  if (!slides.length) return fail(`${name}: no slides inside — the file is corrupt or not a real PPTX.`)
  const body = slides
    .map((n, i) => `Slide ${i + 1}\n${stripXml(new TextDecoder('utf-8').decode(members.get(n) as Uint8Array))}`)
    .join('\n\n')
  return withCap(body, name)
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  let index = 0
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

function xlsxText(members: Map<string, Uint8Array>, name: string): DecodeOutcome {
  const shared: string[] = []
  const sharedXml = members.get('xl/sharedStrings.xml')
  if (sharedXml) {
    for (const si of new TextDecoder('utf-8').decode(sharedXml).split(/<\/si>/)) {
      let value = ''
      for (const t of si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) value += decodeEntities(t[1])
      shared.push(value)
    }
  }
  const sheets = [...members.keys()].filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(/sheet(\d+)\.xml/.exec(a)?.[1] ?? 0) - Number(/sheet(\d+)\.xml/.exec(b)?.[1] ?? 0))
  if (!sheets.length && !shared.length) return fail(`${name}: no sheet data inside — the file is corrupt or not a real XLSX.`)
  const blocks: string[] = []
  if (!sheets.length) {
    blocks.push(shared.join('\n'))
  }
  sheets.forEach((n, sheetIndex) => {
    const lines: string[] = [`Sheet ${sheetIndex + 1}`]
    const xml = new TextDecoder('utf-8').decode(members.get(n) as Uint8Array)
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const cell of row[1].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1]
        const inner = cell[2] ?? ''
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
        const type = /t="(\w+)"/.exec(attrs)?.[1]
        let value = ''
        if (type === 's') {
          const v = /<v>(\d+)<\/v>/.exec(inner)?.[1]
          value = v !== undefined ? (shared[Number(v)] ?? '') : ''
        } else if (type === 'inlineStr') {
          for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) value += decodeEntities(t[1])
        } else {
          value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ''
        }
        if (value) {
          const at = ref ? columnIndex(ref) : cells.length
          while (cells.length < at) cells.push('')
          cells[at] = value
        }
      }
      if (cells.some(Boolean)) lines.push(cells.join(' | '))
    }
    if (lines.length > 1) blocks.push(lines.join('\n'))
  })
  return withCap(blocks.join('\n\n'), name)
}

function odfText(members: Map<string, Uint8Array>, name: string): DecodeOutcome {
  const content = members.get('content.xml')
  if (!content) return fail(`${name}: content.xml is missing — the file is corrupt or not a real OpenDocument file.`)
  return withCap(stripXml(new TextDecoder('utf-8').decode(content)), name)
}

function epubText(members: Map<string, Uint8Array>, name: string): DecodeOutcome {
  const chapters = [...members.keys()].filter(n => /\.(xhtml|html)$/.test(n)).sort()
  if (!chapters.length) return fail(`${name}: no chapters inside — the file is corrupt or not a real EPUB.`)
  const body = chapters.map(n => stripXml(new TextDecoder('utf-8').decode(members.get(n) as Uint8Array))).join('\n\n')
  return withCap(body, name)
}

function zipListing(entries: ZipEntry[], name: string): DecodeOutcome {
  const names = entries.map(e => e.name).filter(n => !n.endsWith('/')).sort()
  const shown = names.slice(0, 40).map(n => `- ${n}`).join('\n')
  const more = names.length > 40 ? `\n… ${names.length - 40} more` : ''
  return withCap(`Archive read: ${names.length} file(s).\n${shown}${more}`, name)
}

function decodeZip(bytes: Uint8Array, name: string): DecodeOutcome {
  let members: ZipEntry[]
  const kept = new Map<string, Uint8Array>()
  try {
    members = [...iterZipEntries(bytes, DOC_ZIP_LIMITS)]
  } catch (failure) {
    if (failure instanceof ZipRefusal) {
      if (failure.answer === 'password-protected archive') {
        return fail(`${name}: password-protected — open it with the password and attach a copy without one.`)
      }
      return fail(`${name}: the archive will not unpack honestly: ${failure.answer}.`)
    }
    throw failure
  }
  for (const entry of members) if (!entry.name.endsWith('/')) kept.set(entry.name, entry.content)
  const names = [...kept.keys()]
  if (names.includes('word/document.xml')) return docxText(kept, name)
  if (names.some(n => n.startsWith('ppt/slides/'))) return pptxText(kept, name)
  if (names.some(n => n.startsWith('xl/worksheets/') || n === 'xl/sharedStrings.xml')) return xlsxText(kept, name)
  if (names.includes('content.xml')) return odfText(kept, name)
  if (names.some(n => n.startsWith('OEBPS/') || n.startsWith('EPUB/') || n === 'mimetype')) return epubText(kept, name)
  return zipListing(members, name)
}

// ---------------------------------------------------------------------------
// Audio and video containers: structure read, DRM and corruption named
// ---------------------------------------------------------------------------

function durationLabel(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function wavDuration(bytes: Uint8Array): string | null {
  if (bytes.length < 44) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 12
  let byteRate = 0
  let dataSize = 0
  while (at + 8 <= bytes.length) {
    const id = new TextDecoder('latin1').decode(bytes.subarray(at, at + 4))
    const size = view.getUint32(at + 4, true)
    if (id === 'fmt ') byteRate = view.getUint32(at + 8 + 8, true)
    if (id === 'data') { dataSize = size === 0xffffffff ? bytes.length - (at + 8) : size; break }
    at += 8 + size + (size % 2)
  }
  if (!byteRate) return null
  return durationLabel(dataSize / byteRate)
}

function flacDuration(bytes: Uint8Array): string | null {
  if (bytes.length < 46) return null
  const si = bytes.subarray(12, 12 + 34) // STREAMINFO after magic + block header
  const rate = (si[10] << 12) | (si[11] << 4) | (si[12] >> 4)
  const total = ((si[12] & 0x0f) * 2 ** 32) + ((si[13] << 24) >>> 0) + (si[14] << 16) + (si[15] << 8) + si[16]
  if (!rate || !total) return null
  return durationLabel(total / rate)
}

function oggDuration(bytes: Uint8Array): string | null {
  const text = new TextDecoder('latin1').decode(bytes)
  let rate = 0
  const head = text.indexOf('OggS')
  if (head >= 0) {
    const vorbis = text.indexOf('vorbis', head)
    if (vorbis > 0 && vorbis + 10 < bytes.length) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      rate = view.getUint32(vorbis + 7, true)
    } else if (text.indexOf('OpusHead', head) >= 0) {
      rate = 48000
    }
  }
  const last = text.lastIndexOf('OggS')
  if (!rate || last < 0) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const granule = Number(view.getBigUint64(last + 6, true))
  return durationLabel(granule / rate)
}

function mp3Duration(bytes: Uint8Array): string | null {
  let at = 0
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
    at = 10 + size
  }
  const ratesV1 = [44100, 48000, 32000]
  const ratesV2 = [22050, 24000, 16000]
  let frames = 0
  let rate = 0
  while (at + 4 <= bytes.length && frames < 2_000_000) {
    if (bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) { at += 1; continue }
    const version = (bytes[at + 1] >> 3) & 0x03
    const layer = (bytes[at + 1] >> 1) & 0x03
    const bitrateIndex = (bytes[at + 2] >> 4) & 0x0f
    const rateIndex = (bytes[at + 2] >> 2) & 0x03
    if (layer !== 1 || bitrateIndex === 0 || bitrateIndex === 0x0f || rateIndex === 3) { at += 1; continue }
    const table = version === 3 ? ratesV1 : version === 2 ? ratesV2 : null
    if (!table) { at += 1; continue }
    rate = table[rateIndex]
    const samples = version === 3 ? 1152 : 576
    frames += samples / rate
    const brV1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    const brV2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    const bitrate = (version === 3 ? brV1 : brV2)[bitrateIndex] * 1000
    at += Math.floor((samples / 8) * bitrate / rate)
  }
  if (frames <= 0) return null
  return durationLabel(frames)
}

function scanFor(bytes: Uint8Array, ...needles: string[]): boolean {
  const hay = new TextDecoder('latin1').decode(bytes)
  return needles.some(needle => hay.includes(needle))
}

function decodeMedia(bytes: Uint8Array, name: string, kind: 'audio' | 'video'): DecodeOutcome {
  const label = kind === 'audio' ? 'Audio' : 'Video'
  const ext = extOf(name) || 'bin'
  if (bytes.length < 64) return fail(`${name}: the file is too short to be a real ${kind} — it is corrupt or was cut off.`)

  // MPEG-4 family: the DRM markers live in the boxes, so look before claiming.
  if (bytes.length > 12 && new TextDecoder('latin1').decode(bytes.subarray(4, 8)) === 'ftyp') {
    if (scanFor(bytes, 'sinf', 'encv', 'enca', 'drms', 'piff')) {
      return fail(`${name}: protected by DRM — this copy is encrypted and the app does not decrypt it.`)
    }
    const duration = mp4Duration(bytes)
    return text(
      `${label} container read — MPEG-4 (${ext}), ${humanSize(bytes.length)}.` +
      (duration ? ` Duration ${duration}.` : ' Duration unreadable in this file.') +
      `\nThe SOUND/VISUAL itself was not transcribed: the selected brain cannot hear or watch. What you see here is what was actually read from the container.`
    )
  }

  const ascii16 = new TextDecoder('latin1').decode(bytes.subarray(0, 16))
  if (ascii16.startsWith('RIFF') && bytes.length >= 44 && new TextDecoder('latin1').decode(bytes.subarray(8, 12)) === 'WAVE') {
    const duration = wavDuration(bytes)
    if (duration === null && bytes.length < 64) return fail(`${name}: the WAV header is incomplete — the file is corrupt.`)
    return text(
      `${label} container read — WAV audio, ${humanSize(bytes.length)}.` +
      (duration ? ` Duration ${duration}.` : ' Duration unreadable in this file.') +
      `\nThe sound itself was not transcribed: the selected brain cannot hear. What you see here is what was actually read from the container.`
    )
  }
  if (ascii16.startsWith('fLaC')) {
    const duration = flacDuration(bytes)
    return text(
      `${label} container read — FLAC audio, ${humanSize(bytes.length)}.` +
      (duration ? ` Duration ${duration}.` : ' Duration unreadable in this file.') +
      `\nThe sound itself was not transcribed: the selected brain cannot hear. What you see here is what was actually read from the container.`
    )
  }
  if (ascii16.startsWith('OggS')) {
    const duration = oggDuration(bytes)
    return text(
      `${label} container read — Ogg audio, ${humanSize(bytes.length)}.` +
      (duration ? ` Duration ${duration}.` : ' Duration unreadable in this file.') +
      `\nThe sound itself was not transcribed: the selected brain cannot hear. What you see here is what was actually read from the container.`
    )
  }
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 || (bytes[0] === 0xff && ((bytes[1] & 0xe0) === 0xe0))) {
    const duration = mp3Duration(bytes)
    if (duration === null) return fail(`${name}: no playable MP3 frames found — the file is corrupt.`)
    return text(
      `${label} container read — MP3 audio, ${humanSize(bytes.length)}, duration ${duration}.` +
      `\nThe sound itself was not transcribed: the selected brain cannot hear. What you see here is what was actually read from the container.`
    )
  }
  if (ascii16.startsWith('RIFF') && new TextDecoder('latin1').decode(bytes.subarray(8, 12)) === 'AVI ' && kind === 'video') {
    return text(
      `${label} container read — AVI video, ${humanSize(bytes.length)}.` +
      `\nOnly mp4/webm ride as frames. Convert the clip to mp4 and attach it again — that path really reads it.`
    )
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return text(
      `${label} container read — Matroska (mkv/webm), ${humanSize(bytes.length)}.` +
      (kind === 'video' ? `\nOnly mp4/webm ride as frames. If this is a clip, convert it to mp4/webm and attach it again — that path really reads it.` : `\nThe sound itself was not transcribed: the selected brain cannot hear.`)
    )
  }
  return fail(
    kind === 'audio'
      ? `${name}: no decoder in this app recognizes this audio format (${ext}). Convert it to WAV/MP3/FLAC/Ogg and attach it again.`
      : `${name}: no decoder in this app recognizes this video format (${ext}). mp4/webm ride as frames — convert and attach again.`
  )
}

function mp4Duration(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 2_000_000)))
  const at = text.indexOf('mvhd')
  if (at < 0 || at + 16 > bytes.length) return null
  const version = bytes[at + 4]
  if (version === 1) {
    const timescale = view.getUint32(at + 24, true)
    const duration = Number(view.getBigUint64(at + 28, true))
    if (!timescale) return null
    return durationLabel(duration / timescale)
  }
  const timescale = view.getUint32(at + 16, true)
  const duration = view.getUint32(at + 20, true)
  if (!timescale) return null
  return durationLabel(duration / timescale)
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function looksTextual(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, Math.min(bytes.length, 4096))
  for (const byte of head) if (byte === 0) return false
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    let printable = 0
    const sample = decoded.slice(0, 4096)
    for (const char of sample) {
      const code = char.codePointAt(0) ?? 0
      if (code === 9 || code === 10 || code === 13 || code >= 32) printable += 1
    }
    return sample.length === 0 || printable / sample.length > 0.9
  } catch {
    return false
  }
}

export function decodeAttachment(bytes: Uint8Array, rawName: string, mime: string): DecodeOutcome {
  const name = rawName.trim() || 'attachment'
  if (!bytes.length) return fail(`${name}: the file is empty — nothing to read.`)
  if (bytes.length > MAX_INGEST_BYTES) {
    return fail(`${name}: ${humanSize(bytes.length)} — the reader takes up to ${humanSize(MAX_INGEST_BYTES)}. Nothing was read.`)
  }
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 16))
  const ext = extOf(name)

  if (head.startsWith('%PDF-')) return decodePdf(bytes, name)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
    return decodeZip(bytes, name)
  }
  if (head.startsWith('Rar!')) {
    return fail(`${name}: RAR archives are not unpacked inside this app — extract it and attach the file that is inside.`)
  }
  if (head.startsWith('7z\xbc\xaf\x27\x1c')) {
    return fail(`${name}: 7z archives are not unpacked inside this app — extract it and attach the file that is inside.`)
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      const inner = gunzipSync(Buffer.from(bytes), { maxOutputLength: MAX_INGEST_BYTES })
      const innerName = name.replace(/\.gz$/i, '') || `${name}.unzipped`
      if (inner.length === 0) return fail(`${name}: the gzip stream unpacked to nothing — it is corrupt.`)
      return decodeAttachment(new Uint8Array(inner), innerName, mime)
    } catch {
      return fail(`${name}: the gzip stream could not be inflated — the file is corrupt.`)
    }
  }

  const isAudio = /^audio\//.test(mime) || /\.(mp3|wav|flac|ogg|oga|m4a|aac|opus)$/i.test(name)
  const isVideo = /^video\//.test(mime) || /\.(mp4|m4v|webm|mkv|avi|mov)$/i.test(name)
  if (isAudio || isVideo) return decodeMedia(bytes, name, isAudio ? 'audio' : 'video')

  const isImage = /^image\//.test(mime) || /\.(png|jpe?g|webp|gif|bmp|ico|tiff?|avif|heic|svg)$/i.test(name)
  if (isImage) {
    if (head.startsWith('\x89PNG') || head.startsWith('\xff\xd8\xff')) {
      return fail(`${name}: this is a picture — attach it as a picture; the window reads png/jpeg/webp itself.`)
    }
    return fail(`${name}: this window has no decoder for this image format — convert it to PNG or WebP and attach it again.`)
  }

  if (looksTextual(bytes)) {
    const decoded = new TextDecoder('utf-8').decode(bytes)
    return withCap(decoded, name)
  }
  return fail(
    `${name}: no decoder in this app for ${ext ? `.${ext}` : mime || 'this format'}. Convert it to text, or attach a picture or an mp4/webm video the window can read.`
  )
}
