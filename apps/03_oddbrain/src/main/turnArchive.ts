import { validContextReceipt } from '../shared/lib/nativeConversation'
import { validNativeArtifacts } from '../shared/lib/nativeArtifacts'
import { appendFileSync, closeSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { EngineEvent, EngineId } from '../shared/lib/engine'
import type { EngineImage } from '../shared/lib/media'
import { TRANSCRIPT_ID as ID, validTranscriptMedia, type Transcript, type TranscriptHeader, type TranscriptPage } from '../shared/lib/transcripts'
import { noLinkedPath } from './engine/configTransaction'
import { createTurnMedia } from './turnMedia'

const headerValid = (h: any, id: string): h is TranscriptHeader => h?.id === id && (h.chatId === undefined || (typeof h.chatId === 'string' && /^[a-zA-Z0-9_.:-]{1,256}$/.test(h.chatId))) && (h.context === undefined || validContextReceipt(h.context)) && (h.media === undefined || (validTranscriptMedia(h.media) && h.media.files.length === h.pictures)) && ['claude-code', 'agy'].includes(h.engine) && ['at', 'model', 'workspace', 'title'].every(k => typeof h[k] === 'string') && Number.isSafeInteger(h.pictures) && h.pictures >= 0
const eventValid = (e: any): e is EngineEvent => e && (e.kind === 'closed' || (['delta', 'text', 'status', 'thinking', 'done', 'error'].includes(e.kind) && typeof e.text === 'string' && (e.kind !== 'done' || e.alreadyDisplayed === undefined || typeof e.alreadyDisplayed === 'boolean')) || (e.kind === 'session' && typeof e.id === 'string') || (e.kind === 'tool' && typeof e.name === 'string' && typeof e.summary === 'string') || (e.kind === 'permission' && typeof e.requestId === 'string' && typeof e.tool === 'string' && typeof e.summary === 'string' && (e.detail === undefined || typeof e.detail === 'string') && (e.file === undefined || typeof e.file === 'string')))
export const TRANSCRIPT_LIMIT = 32_000_000
/** Append-only per-turn records. Never trims old turns, overwrites a damaged file,
 * executes imported text, or invents successful recovery after a process crash. */
export function createTurnArchive(root: string, limit = TRANSCRIPT_LIMIT, mediaRoot = join(root, 'media')) {
  const active = new Map<string, number>()
  const media = createTurnMedia(mediaRoot)
  const path = (id: string) => {
    if (!ID.test(id)) throw Error('Invalid transcript identifier.')
    const file = join(root, id + '.ndjson'); noLinkedPath(file); return file
  }
  const line = (value: unknown) => JSON.stringify(value) + '\n'
  return {
    begin(input: { userPrompt?: string; chatId?: string; context?: import('../shared/lib/nativeConversation').ContextReceipt; prompt: string; engine: EngineId; model: string; workspace: string; pictures: number; images?: EngineImage[] }): string {
      noLinkedPath(root); mkdirSync(root, { recursive: true, mode: 0o700 })
      const id = `${Date.now()}-${randomUUID()}`
      if (input.images && input.images.length !== input.pictures) throw Error('The recorded picture count does not match the pictures supplied. Nothing was sent.')
      // Pictures are written before the text header and before any dispatch, so a
      // turn that is recorded as carrying pictures either has their exact bytes or
      // refuses to start. A failure removes only this attempt's own folder.
      const stored = input.images?.length ? media.save(id, input.images) : undefined
      const header: TranscriptHeader = { id, at: new Date().toISOString(), engine: input.engine, model: input.model, workspace: input.workspace, title: input.prompt.replace(/\s+/g, ' ').slice(0, 120), pictures: input.pictures, ...(input.chatId ? { chatId: input.chatId } : {}), ...(input.context ? { context: input.context } : {}), ...(stored ? { media: stored } : {}) }
      const bytes = line({ header }) + line({ prompt: input.prompt, ...(input.userPrompt !== undefined ? { userPrompt: input.userPrompt } : {}) })
      try {
        const size = Buffer.byteLength(bytes)
        if (size > limit) throw Error('The transcript exceeds the storage limit. Nothing was sent.')
        writeFileSync(path(id), bytes, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        active.set(id, size); return id
      } catch (error) {
        // Only this attempt's own media folder can be removed here.
        if (stored) { try { media.discard(id) } catch { /* the original failure is what is reported */ } }
        throw error
      }
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
    /** The preserved pictures for this archive. Reads are checked against the record's manifest. */
    media,
  }
}
