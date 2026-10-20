import type { EngineEvent, EngineId } from './engine'
import type { Chat } from '../types'
import { ENGINE_IMAGE_MIMES, MAX_ENGINE_ATTACHMENTS, MAX_ENGINE_IMAGE_BYTES } from './media'

/**
 * One picture kept beside a turn record.
 *
 * The count in the header says a picture rode with the request; these records
 * say the exact bytes were written before dispatch, with the digest needed to
 * prove a download is the same picture. Paths are not exposed: the app resolves
 * its own storage.
 */
export type TranscriptPicture = {
  /** 0-based, in the order the engine received them. */
  index: number
  mime: (typeof ENGINE_IMAGE_MIMES)[number]
  bytes: number
  sha256: string
}

/** A header's picture records must agree with its count and stay in bounds. */
export function validPictureRecords(value: unknown, pictures: number): value is TranscriptPicture[] {
  if (!Array.isArray(value) || value.length !== pictures) return false
  if (value.length > MAX_ENGINE_ATTACHMENTS) return false
  return value.every((entry, index) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry) &&
    (entry as TranscriptPicture).index === index &&
    ENGINE_IMAGE_MIMES.includes((entry as TranscriptPicture).mime) &&
    Number.isSafeInteger((entry as TranscriptPicture).bytes) &&
    (entry as TranscriptPicture).bytes > 0 && (entry as TranscriptPicture).bytes <= MAX_ENGINE_IMAGE_BYTES &&
    typeof (entry as TranscriptPicture).sha256 === 'string' && /^[a-f0-9]{64}$/.test((entry as TranscriptPicture).sha256))
}

/** True when this record kept the exact picture bytes; false for older records. */
export function picturesSaved(header: TranscriptHeader): boolean {
  return Boolean(header.pictureRecords?.length)
}

export type TranscriptHeader = { chatId?: string; context?: import('./nativeConversation').ContextReceipt; id: string; at: string; engine: EngineId; model: string; workspace: string; title: string; pictures: number; pictureRecords?: TranscriptPicture[] }
export type Transcript = { userPrompt?: string; header: TranscriptHeader; prompt: string; events: EngineEvent[]; state: 'running' | 'done' | 'error' | 'interrupted'; incomplete: boolean }
export type TranscriptPage = { entries: TranscriptHeader[]; next: string; notice: string }
export type TranscriptResult<T> = { ok: true; value: T } | { ok: false; error: string }
export type TranscriptBridge = {
  raw?(id: string): Promise<TranscriptResult<{ content: string; bytes: number; format: 'ndjson' }>>
  /** Newest first; `chatId` narrows it to one conversation's recorded turns. */
  list(before?: string, chatId?: string): Promise<TranscriptResult<TranscriptPage>>
  read(id: string): Promise<TranscriptResult<Transcript>>
  /** The exact saved bytes for one picture, re-verified against its digest. */
  picture?(id: string, index: number): Promise<TranscriptResult<{ mime: string; bytes: number; sha256: string; data: string }>>
}

/** Export exactly what was recorded; status/tool/thinking output is not a model answer. */
export function transcriptMarkdown(turn: Transcript): string {
  const h = turn.header
  const lines = [`# ${h.title}`, '', `Recorded: ${h.at}`, `Engine: ${h.engine}`, `Model: ${h.model || 'Engine default'}`, `State: ${turn.state}`, '', '## You', '', turn.prompt, '']
  if (picturesSaved(h) && h.pictureRecords) {
    lines.push(`Attachment notice: ${h.pictures} image(s) accompanied this request. The exact bytes were saved beside this record before it was sent; each one can be downloaded from the app after being checked against its fingerprint.`, '')
    for (const picture of h.pictureRecords) lines.push(`Picture ${picture.index + 1}: ${picture.mime}, ${picture.bytes.toLocaleString()} bytes, sha256 ${picture.sha256}`, '')
  } else if (h.pictures) lines.push(`Attachment notice: ${h.pictures} image(s) accompanied this request. See the result for acceptance or refusal. This earlier record kept only the count; its image bytes were never stored.`, '')
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
