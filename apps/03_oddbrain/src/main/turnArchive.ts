import { validContextReceipt } from '../shared/lib/nativeConversation'
import { validNativeArtifacts } from '../shared/lib/nativeArtifacts'
import { appendFileSync, closeSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { EngineEvent, EngineId } from '../shared/lib/engine'
import type { EngineImage, EngineSourceFile } from '../shared/lib/media'
import { validTranscriptAttachments, validTranscriptImages, type Transcript, type TranscriptAttachment, type TranscriptAttachmentDownload, type TranscriptHeader, type TranscriptImage, type TranscriptImageDownload, type TranscriptPage, type TranscriptRecoveryPage } from '../shared/lib/transcripts'
import { noLinkedPath } from './engine/configTransaction'

const headerValid = (h: any, id: string): h is TranscriptHeader => h?.id === id && (h.chatId === undefined || (typeof h.chatId === 'string' && /^[a-zA-Z0-9_.:-]{1,256}$/.test(h.chatId))) && (h.context === undefined || validContextReceipt(h.context)) && ['claude-code', 'agy'].includes(h.engine) && ['at', 'model', 'workspace', 'title'].every(k => typeof h[k] === 'string') && Number.isSafeInteger(h.pictures) && h.pictures >= 0 && validTranscriptImages(h.images, h.pictures) && validTranscriptAttachments(h.attachments)
const eventValid = (e: any): e is EngineEvent => e && (e.kind === 'closed' || (['delta', 'text', 'status', 'thinking', 'done', 'error'].includes(e.kind) && typeof e.text === 'string' && (e.kind !== 'done' || e.alreadyDisplayed === undefined || typeof e.alreadyDisplayed === 'boolean')) || (e.kind === 'session' && typeof e.id === 'string') || (e.kind === 'tool' && typeof e.name === 'string' && typeof e.summary === 'string') || (e.kind === 'permission' && typeof e.requestId === 'string' && typeof e.tool === 'string' && typeof e.summary === 'string' && (e.detail === undefined || typeof e.detail === 'string') && (e.file === undefined || typeof e.file === 'string') && (e.risk === undefined || typeof e.risk === 'string')))
const ID = /^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const IMAGE_ID = /^image-[1-4]$/
const ATTACHMENT_ID = /^attachment-[1-8]$/
const imageExtension = (mime: TranscriptImage['mime']) => mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '.webp'
const imageMatchesMime = (bytes: Buffer, mime: TranscriptImage['mime']): boolean => mime === 'image/png'
  ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  : mime === 'image/jpeg'
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
export const TRANSCRIPT_LIMIT = 32_000_000
/** Append-only per-turn records. Never trims old turns, overwrites a damaged file,
 * executes imported text, or invents successful recovery after a process crash. */
export function createTurnArchive(root: string, limit = TRANSCRIPT_LIMIT) {
  const active = new Map<string, number>()
  const path = (id: string) => {
    if (!ID.test(id)) throw Error('Invalid transcript identifier.')
    const file = join(root, id + '.ndjson'); noLinkedPath(file); return file
  }
  const imageDir = (id: string) => { if (!ID.test(id)) throw Error('Invalid transcript identifier.'); const folder = join(root, id + '.images'); noLinkedPath(folder); return folder }
  const imagePath = (id: string, image: TranscriptImage) => {
    if (!IMAGE_ID.test(image.id)) throw Error('Invalid transcript image identifier.')
    const file = join(imageDir(id), image.id + imageExtension(image.mime)); noLinkedPath(file); return file
  }
  const attachmentDir = (id: string) => { if (!ID.test(id)) throw Error('Invalid transcript identifier.'); const folder = join(root, id + '.attachments'); noLinkedPath(folder); return folder }
  const attachmentPath = (id: string, attachment: TranscriptAttachment) => {
    if (!ATTACHMENT_ID.test(attachment.id)) throw Error('Invalid transcript attachment identifier.')
    const file = join(attachmentDir(id), attachment.id + '.bin'); noLinkedPath(file); return file
  }
  const line = (value: unknown) => JSON.stringify(value) + '\n'
  return {
    begin(input: { userPrompt?: string; chatId?: string; context?: import('../shared/lib/nativeConversation').ContextReceipt; prompt: string; engine: EngineId; model: string; workspace: string; pictures: number; /** Exact validated bytes about to be dispatched. Undefined preserves compatibility with count-only legacy records. */ images?: EngineImage[]; attachments?: EngineSourceFile[] }): string {
      noLinkedPath(root); mkdirSync(root, { recursive: true, mode: 0o700 })
      const id = `${Date.now()}-${randomUUID()}`
      if (input.images !== undefined && input.images.length !== input.pictures) throw Error('The retained image count does not match the dispatch. Nothing was sent.')
      const descriptors: TranscriptImage[] | undefined = input.images?.map((image, index) => {
        const decoded = Buffer.from(image.data, 'base64')
        if (!decoded.length || decoded.length > 2 * 1024 * 1024 || !imageMatchesMime(decoded, image.mime)) throw Error(`Image ${index + 1} does not match its declared format. Nothing was sent.`)
        return { id: `image-${index + 1}`, mime: image.mime, bytes: decoded.length, sha256: createHash('sha256').update(decoded).digest('hex') }
      })
      let attachmentBytes = 0
      const attachmentDescriptors: TranscriptAttachment[] | undefined = input.attachments?.map((file, index) => {
        if (!(file.data instanceof Uint8Array) || !file.data.byteLength || file.data.byteLength > 50 * 1024 * 1024 || typeof file.name !== 'string' || !file.name || file.name.length > 255 || /[\x00-\x1f]/.test(file.name) || typeof file.mime !== 'string' || file.mime.length > 200 || /[\x00-\x1f]/.test(file.mime)) throw Error(`Original attachment ${index + 1} is invalid. Nothing was sent.`)
        attachmentBytes += file.data.byteLength
        if (index >= 8 || attachmentBytes > 64 * 1024 * 1024) throw Error('Original attachments exceed the per-turn retention limit. Nothing was sent or shortened.')
        return { id: `attachment-${index + 1}`, name: file.name, mime: file.mime, bytes: file.data.byteLength, sha256: createHash('sha256').update(file.data).digest('hex') }
      })
      const header: TranscriptHeader = { id, at: new Date().toISOString(), engine: input.engine, model: input.model, workspace: input.workspace, title: (input.userPrompt ?? input.prompt).replace(/\s+/g, ' ').slice(0, 120), pictures: input.pictures, ...(descriptors !== undefined ? { images: descriptors } : {}), ...(attachmentDescriptors !== undefined ? { attachments: attachmentDescriptors } : {}), ...(input.chatId ? { chatId: input.chatId } : {}), ...(input.context ? { context: input.context } : {}) }
      const record = line({ header }) + line({ prompt: input.prompt, ...(input.userPrompt !== undefined ? { userPrompt: input.userPrompt } : {}) })
      if (Buffer.byteLength(record) > limit) throw Error('The transcript exceeds the storage limit. Nothing was sent.')
      let keptImages = false, keptAttachments = false
      try {
        if (descriptors?.length) {
          const folder = imageDir(id); mkdirSync(folder, { recursive: false, mode: 0o700 }); keptImages = true
          for (const [index, descriptor] of descriptors.entries()) {
            const decoded = Buffer.from(input.images![index].data, 'base64')
            writeFileSync(imagePath(id, descriptor), decoded, { flag: 'wx', mode: 0o600 })
            const saved = readFileSync(imagePath(id, descriptor))
            if (saved.length !== descriptor.bytes || createHash('sha256').update(saved).digest('hex') !== descriptor.sha256) throw Error(`Image ${index + 1} could not be verified before dispatch.`)
          }
        }
        if (attachmentDescriptors?.length) {
          const folder = attachmentDir(id); mkdirSync(folder, { recursive: false, mode: 0o700 }); keptAttachments = true
          for (const [index, descriptor] of attachmentDescriptors.entries()) {
            writeFileSync(attachmentPath(id, descriptor), input.attachments![index].data, { flag: 'wx', mode: 0o600 })
            const saved = readFileSync(attachmentPath(id, descriptor))
            if (saved.length !== descriptor.bytes || createHash('sha256').update(saved).digest('hex') !== descriptor.sha256) throw Error(`Original attachment ${index + 1} could not be verified before dispatch.`)
          }
        }
        writeFileSync(path(id), record, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      } catch (error) {
        if (keptImages) { try { rmSync(imageDir(id), { recursive: true, force: true }) } catch { /* orphaned private bytes remain unreferenced rather than dispatching */ } }
        if (keptAttachments) { try { rmSync(attachmentDir(id), { recursive: true, force: true }) } catch { /* orphaned private bytes remain unreferenced rather than dispatching */ } }
        throw error
      }
      active.set(id, Buffer.byteLength(record)); return id
    },
    append(id: string, event: EngineEvent): void {
      const size = active.get(id)
      if (size === undefined) return
      const bytes = line({ event }), next = size + Buffer.byteLength(bytes)
      if (next > limit) { active.delete(id); throw Error('Transcript size limit reached. Engine stop requested; the recorded prefix is retained, not marked complete.') }
      try { appendFileSync(path(id), bytes, 'utf8') } catch { active.delete(id); throw Error('The transcript could not be saved. Engine stop requested; keep the visible response before closing.') }
      if (['done', 'error', 'closed'].includes(event.kind)) active.delete(id)
      else active.set(id, next)
    },
    list(before = ''): TranscriptPage {
      noLinkedPath(root)
      if (before && !ID.test(before)) throw Error('Invalid transcript page.')
      let files: string[]
      try { files = readdirSync(root).filter(f => f.endsWith('.ndjson') && ID.test(f.slice(0, -7))).map(f => f.slice(0, -7)).sort().reverse().filter(id => !before || id < before) }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], next: '', notice: '' }; throw e }
      const entries: TranscriptHeader[] = []; let damaged = false
      for (const id of files.slice(0, 50)) {
        let fd: number | undefined
        try {
          const file = path(id); if (!lstatSync(file).isFile()) throw Error()
          fd = openSync(file, 'r'); const buffer = Buffer.alloc(128_000), n = readSync(fd, buffer, 0, buffer.length, 0)
          const raw = buffer.subarray(0, n).toString('utf8'); const end = raw.indexOf('\n'); if (end < 0) throw Error()
          const header = JSON.parse(raw.slice(0, end)).header as TranscriptHeader
          if (!headerValid(header, id)) throw Error()
          entries.push(header)
        } catch { damaged = true } finally { if (fd !== undefined) closeSync(fd) }
      }
      return { entries, next: files.length > 50 ? files[49] : '', notice: damaged ? 'Some records could not be read. Their original files have not been changed.' : '' }
    },
    /** Coordinator-only raw export endpoint. Includes damaged trailing entries, without repair.
     * Invalid UTF-8 is refused instead of replaced. Never expose a general file path reader. */
    raw(id: string): { content: string; bytes: number; format: 'ndjson' } {
      const file = path(id), info = lstatSync(file)
      if (!info.isFile() || info.size > limit) throw Error('Raw record exceeds the export limit or is not a regular file. Original unchanged.')
      const bytes = readFileSync(file)
      return { content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes: bytes.length, format: 'ndjson' }
    },
    /** Return only an indexed image after its size, format and dispatch-time digest still match. */
    image(id: string, wanted: string): TranscriptImageDownload {
      if (!IMAGE_ID.test(wanted)) throw Error('Invalid transcript image identifier.')
      const transcriptFile = path(id), transcriptInfo = lstatSync(transcriptFile)
      if (!transcriptInfo.isFile() || transcriptInfo.size > limit) throw Error('The transcript is not a readable bounded record. Its original is unchanged.')
      const descriptorBytes = readFileSync(transcriptFile)
      const firstLine = descriptorBytes.subarray(0, descriptorBytes.indexOf(10) >= 0 ? descriptorBytes.indexOf(10) : descriptorBytes.length).toString('utf8')
      const header = JSON.parse(firstLine || '{}').header as TranscriptHeader
      if (!headerValid(header, id)) throw Error('The transcript header is damaged. Its original is unchanged.')
      if (header.images === undefined) throw Error('This older record did not retain its image bytes.')
      const descriptor = header.images.find(image => image.id === wanted)
      if (!descriptor) throw Error('That image is not indexed by this transcript.')
      const file = imagePath(id, descriptor), info = lstatSync(file)
      if (!info.isFile() || info.isSymbolicLink() || info.size !== descriptor.bytes) throw Error('The retained image no longer matches its recorded size. Download refused.')
      const bytes = readFileSync(file), digest = createHash('sha256').update(bytes).digest('hex')
      if (digest !== descriptor.sha256 || !imageMatchesMime(bytes, descriptor.mime)) throw Error('The retained image failed its dispatch-time integrity check. Download refused.')
      return { ...descriptor, data: bytes.toString('base64'), name: `turn-${id}-${descriptor.id}${imageExtension(descriptor.mime)}`, verified: true }
    },
    /** Return only an indexed original after its size and dispatch-time digest still match. */
    attachment(id: string, wanted: string): TranscriptAttachmentDownload {
      if (!ATTACHMENT_ID.test(wanted)) throw Error('Invalid transcript attachment identifier.')
      const transcriptFile = path(id), transcriptInfo = lstatSync(transcriptFile)
      if (!transcriptInfo.isFile() || transcriptInfo.size > limit) throw Error('The transcript is not a readable bounded record. Its original is unchanged.')
      const descriptorBytes = readFileSync(transcriptFile)
      const firstLine = descriptorBytes.subarray(0, descriptorBytes.indexOf(10) >= 0 ? descriptorBytes.indexOf(10) : descriptorBytes.length).toString('utf8')
      const header = JSON.parse(firstLine || '{}').header as TranscriptHeader
      if (!headerValid(header, id)) throw Error('The transcript header is damaged. Its original is unchanged.')
      const descriptor = header.attachments?.find(file => file.id === wanted)
      if (!descriptor) throw Error('That original file is not indexed by this transcript.')
      const file = attachmentPath(id, descriptor), info = lstatSync(file)
      if (!info.isFile() || info.isSymbolicLink() || info.size !== descriptor.bytes) throw Error('The retained original no longer matches its recorded size. Download refused.')
      const bytes = readFileSync(file), digest = createHash('sha256').update(bytes).digest('hex')
      if (digest !== descriptor.sha256) throw Error('The retained original failed its dispatch-time integrity check. Download refused.')
      return { ...descriptor, data: bytes.toString('base64'), verified: true }
    },
    read(id: string): Transcript {
      const file = path(id), stat = lstatSync(file)
      if (!stat.isFile() || stat.size > limit) throw Error('The transcript is not a readable bounded record. Its original is unchanged.')
      const bytes = readFileSync(file), completeAt = bytes.lastIndexOf(10) + 1
      let incomplete = completeAt !== bytes.length
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, completeAt)), lines = raw.split('\n')
      lines.pop() // Empty trailing field, or the incomplete final write.
      const header = JSON.parse(lines.shift() || '{}').header as TranscriptHeader
      const request = JSON.parse(lines.shift() || '{}'), prompt = request.prompt
      if (!headerValid(header, id) || typeof prompt !== 'string' || (request.userPrompt !== undefined && typeof request.userPrompt !== 'string')) throw Error('The transcript header is damaged. Its original is unchanged.')
      const events: EngineEvent[] = []
      for (const line of lines) {
        try { const e = JSON.parse(line).event; if (!eventValid(e) || (e.transcriptId !== undefined && e.transcriptId !== id) || (e.chatId !== undefined && e.chatId !== header.chatId) || (e.context !== undefined && !validContextReceipt(e.context)) || (e.artifacts !== undefined && !validNativeArtifacts(e.artifacts))) throw Error(); events.push(e) }
        catch { incomplete = true; break }
      }
      const last = events.at(-1)
      const state = incomplete ? 'interrupted' : last?.kind === 'done' ? 'done' : last?.kind === 'error' ? 'error' : active.has(id) ? 'running' : 'interrupted'
      return { header, prompt, events, state, incomplete, ...(typeof request.userPrompt === 'string' ? { userPrompt: request.userPrompt } : {}) }
    },
    /** Bounded startup reconciliation for existing app chats. It reads records only;
     * the renderer separately commits exact copies and never resumes native work. */
    recover(this: { list(before?: string): TranscriptPage; read(id: string): Transcript }, chatIds: string[], knownTranscriptIds: string[], before = ''): TranscriptRecoveryPage {
      if (!Array.isArray(chatIds) || chatIds.length > 2_000 || chatIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,256}$/.test(id))) throw Error('Invalid chat recovery scope.')
      if (!Array.isArray(knownTranscriptIds) || knownTranscriptIds.length > 10_000 || knownTranscriptIds.some(id => typeof id !== 'string' || !ID.test(id))) throw Error('Invalid transcript recovery scope.')
      const wanted = new Set(chatIds), known = new Set(knownTranscriptIds), page = this.list(before), records: Transcript[] = [], notices = new Set<string>()
      if (page.notice) notices.add(page.notice)
      let bytes = 0
      for (const header of page.entries) {
        if (!header.chatId || !wanted.has(header.chatId) || known.has(header.id)) continue
        try {
          const size = lstatSync(path(header.id)).size
          if (size > 8_000_000 || bytes + size > 16_000_000) { notices.add('Some matching turns exceeded the 8 MB per-record or 16 MB recovery-page limit. They remain available in Full transcripts and were not shortened.'); continue }
          const record = this.read(header.id)
          if (record.state === 'running') { notices.add('An active turn was not copied during recovery. It remains in Full transcripts.'); continue }
          records.push(record); bytes += size
        } catch { notices.add('Some matching turns could not be reconciled. Their original transcript files were not changed.') }
      }
      return { records, next: page.next, notice: [...notices].join(' ') }
    },
  }
}
