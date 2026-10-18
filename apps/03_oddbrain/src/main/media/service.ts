import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { DEFAULT_MEDIA, normalizeMedia, validateMediaInput, MAX_MEDIA_TEXT, type MediaInput, type MediaResult, type MediaPreferences } from '../../shared/lib/mediaProcessing'
import { extractIsolated } from './isolated'

export function createMediaService(options: {
  file: string; cache: string
  provider(input: MediaInput, signal: AbortSignal): Promise<{text:string;source:string;notes:string[]}>
  models(): Promise<{models:{name:string;label:string}[];problems:string[]}>
  local?: typeof extractIsolated
}) {
  let preferences = { ...DEFAULT_MEDIA }
  try { if (existsSync(options.file)) preferences = normalizeMedia(JSON.parse(readFileSync(options.file, 'utf8'))) } catch { /* retain safe defaults without overwriting damaged data */ }
  let revision=randomUUID()
  const active = new Map<string, AbortController>()
  const cancel = (owner: string, id: string): void => { active.get(`${owner}:${id}`)?.abort() }
  const cancelOwner = (owner: string): void => { for (const [id, task] of active) if (id.startsWith(`${owner}:`)) task.abort() }
  const cancelAll = (): void => { for (const task of active.values()) task.abort() }
  return {
    read: (): MediaPreferences => ({ ...preferences,revision }),
    update(value: unknown) {
      try {
        const clean = normalizeMedia(value)
        mkdirSync(dirname(options.file), { recursive:true })
        writeFileSync(options.file + '.tmp', JSON.stringify(clean, null, 2), { mode:0o600 })
        renameSync(options.file + '.tmp', options.file)
        cancelAll(); revision=randomUUID(); preferences = clean
        return { ok:true, preferences:{...preferences,revision} }
      } catch { return { ok:false, error:'Media preferences could not be saved. The previous choices remain active.' } }
    },
    models: options.models, cancel, cancelOwner, cancelAll,
    invalidate(){revision=randomUUID();cancelAll()},
    async process(value: unknown, owner: string): Promise<MediaResult> {
      let id = '', registered = false
      try {
        const input = validateMediaInput(value); if(input.remote&&input.revision!==revision)throw Error('Media settings or access changed after confirmation. Confirm the current destination before processing.'); id = `${owner}:${input.id}`
        if (active.has(id)) throw Error('That media request is already running.')
        if (active.size >= 2) throw Error('Two media requests are already running. Wait or cancel one before adding another.')
        const controller = new AbortController(); active.set(id, controller); registered = true
        const timer = setTimeout(()=>controller.abort(Error('Media processing timed out after three minutes.')),180_000)
        try {
          const result = input.remote
            ? await options.provider(input, controller.signal)
            : { ...await (options.local || extractIsolated)(input, { ocr:preferences.ocr, cache:options.cache, signal:controller.signal }), source:'On-device decoder' }
          controller.signal.throwIfAborted()
          if (!result.text.trim() || result.text.length > MAX_MEDIA_TEXT) throw Error('The file has no readable text or exceeds the 180,000-character limit. No text was silently truncated.')
          return { ok:true, ...result }
        } finally { clearTimeout(timer) }
      } catch (error) { return { ok:false, error:error instanceof Error ? error.message : 'Media processing failed. No substitute provider was used.' } }
      finally { if (registered) active.delete(id) }
    },
  }
}
