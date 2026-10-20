import type { EngineEvent, EngineId } from './engine'
import type { Chat } from '../types'
import { ENGINE_IMAGE_MIMES, MAX_ENGINE_ATTACHMENTS, MAX_ENGINE_IMAGE_BYTES } from './media'

/** The identifier shape the main process uses for both the text record and its media folder. */
export const TRANSCRIPT_ID = /^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

/** One picture's bytes, described before dispatch. The digest is of the exact decoded bytes. */
export type TranscriptMediaFile = { index: number; mime: typeof ENGINE_IMAGE_MIMES[number]; bytes: number; sha256: string }
export type TranscriptMedia = { files: TranscriptMediaFile[]; bytes: number }

/** A stored attachment manifest: ordered, bounded and digest-addressed. Unknown shapes are refused. */
export function validTranscriptMedia(value: unknown): value is TranscriptMedia {
  const media = value as TranscriptMedia
  if (!media || typeof media !== 'object' || !Array.isArray(media.files) || !Number.isSafeInteger(media.bytes) || media.bytes < 0) return false
  if (!media.files.length || media.files.length > MAX_ENGINE_ATTACHMENTS) return false
  let total = 0
  for (const [position, file] of media.files.entries()) {
    if (!file || typeof file !== 'object' || file.index !== position || !ENGINE_IMAGE_MIMES.includes(file.mime) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_ENGINE_IMAGE_BYTES || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) return false
    total += file.bytes
  }
  return total === media.bytes
}

export type TranscriptHeader = { chatId?: string; context?: import('./nativeConversation').ContextReceipt; id: string; at: string; engine: EngineId; model: string; workspace: string; title: string; pictures: number; media?: TranscriptMedia }
export type Transcript = { userPrompt?: string; header: TranscriptHeader; prompt: string; events: EngineEvent[]; state: 'running' | 'done' | 'error' | 'interrupted'; incomplete: boolean }
export type TranscriptPage = { entries: TranscriptHeader[]; next: string; notice: string }
export type TranscriptResult<T> = { ok: true; value: T } | { ok: false; error: string }
export type TranscriptBridge = {
  raw?(id: string): Promise<TranscriptResult<{ content: string; bytes: number; format: 'ndjson' }>>
  /** One preserved picture, verified against the record's own size and digest before it is returned. */
  media?(id: string, index: number): Promise<TranscriptResult<{ base64: string; mime: string; name: string; bytes: number; sha256: string }>>
  /** Newest first; `chatId` narrows it to one conversation's recorded turns. */
  list(before?: string, chatId?: string): Promise<TranscriptResult<TranscriptPage>>
  read(id: string): Promise<TranscriptResult<Transcript>>
}

/** Export exactly what was recorded; status/tool/thinking output is not a model answer. */
export function transcriptMarkdown(turn: Transcript): string {
  const h = turn.header
  const lines = [`# ${h.title}`, '', `Recorded: ${h.at}`, `Engine: ${h.engine}`, `Model: ${h.model || 'Engine default'}`, `State: ${turn.state}`, '', '## You', '', turn.prompt, '']
  if (h.media?.files.length) {
    lines.push(`Attachment notice: ${h.media.files.length} picture(s) accompanied this request. The exact bytes (${h.media.bytes} in total) are preserved in app storage, not in this text transcript:`, '')
    for (const file of h.media.files) lines.push(`- Picture ${file.index + 1}: ${file.mime}, ${file.bytes} bytes, sha256 ${file.sha256}`, '')
  } else if (h.pictures) lines.push(`Attachment notice: ${h.pictures} image(s) accompanied this request. See the result for acceptance or refusal. Their bytes were not saved with this record.`, '')
  let text = ''
  const flush = () => { if (text) { lines.push('## Engine', '', text, ''); text = '' } }
  for (const e of turn.events) {
    if (e.kind === 'delta') { text += e.text; continue }
    if (e.kind === 'text') { flush(); text = e.text; continue }
    if (e.kind === 'done') { if (e.text && !e.alreadyDisplayed && e.text !== text) { flush(); text = e.text }; flush(); continue }
    flush()
    if (e.kind === 'thinking') lines.push('## Engine-supplied thinking', '', e.text, '')
    else if (e.kind === 'tool') lines.push(`## Tool: ${e.name}`, '', e.summary, '')
    else if (e.kind === 'permission') lines.push(`## Approval requested: ${e.tool}`, '', e.summary, e.detail || '', '')
    else if (e.kind === 'error' || e.kind === 'status') lines.push(`## ${e.kind === 'error' ? 'Error' : 'Activity'}`, '', e.text, '')
    else if (e.kind === 'session') lines.push(`Native session: ${e.id}`, '')
  }
  flush()
  if (turn.incomplete || turn.state === 'interrupted') lines.push('Recording notice: this record has no confirmed complete ending or has an incomplete final entry. It must not be treated as a successful task.', '')
  lines.push('This is an app-recorded text transcript, not a native-session import or proof that a tool succeeded. It can contain private prompts, paths and tool output.')
  return lines.join('\n')
}

export function chatMarkdown(chat: Chat): string {
  const lines = [`# ${chat.title}`, '', 'Saved OddBrain chat. Full stored message text; attachment binaries are not embedded.', '']
  for (const m of chat.messages) {
    lines.push(`## ${m.role === 'user' ? 'You' : 'Assistant'}`, '')
    if (m.timestamp || m.at) lines.push(`Time: ${m.timestamp || m.at}`, '')
    if (m.model) lines.push(`Model: ${m.model}`, '')
    if (m.status && m.status !== 'complete') lines.push(`Status: ${m.status}`, '')
    lines.push(m.content, '')
    if (m.thinking) lines.push('### Engine-supplied thinking', '', m.thinking, '')
    if (m.context) lines.push('### Attached context', '', m.context, '')
    for (const c of m.citations || []) lines.push(`Citation ${c.id}: ${c.label} — ${c.url}`, '')
    if (m.bridge) lines.push('### Image interpretation', '', `Model: ${m.bridge.model}`, m.bridge.description, m.bridge.truncated ? 'Only part of this interpretation was passed to the answering model.' : '', '')
    if (m.error) lines.push('### Error', '', m.error, '')
    for (const a of m.attachments || []) lines.push(`### Attachment: ${a.name}`, '', a.extraction || '', a.text || '(binary content is not embedded)', '')
    for (const a of m.artifacts || []) for (const [i, v] of a.versions.entries()) {
      let fenceLength = 3
      for (const match of v.content.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1)
      const fence = '`'.repeat(fenceLength)
      lines.push(`### Artifact: ${a.title} — version ${i + 1}`, '', `${fence}${a.type}`, v.content, fence, '')
    }
  }
  return lines.join('\n')
}
