import type { EngineEvent, EngineId } from './engine'
import type { Chat } from '../types'

export type TranscriptImage = {
  /** Stable identifier inside one transcript; never a general file path. */
  id: string
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  bytes: number
  sha256: string
}
export type TranscriptHeader = { chatId?: string; context?: import('./nativeConversation').ContextReceipt; id: string; at: string; engine: EngineId; model: string; workspace: string; title: string; pictures: number; /** Undefined means an older record that kept only the count. */ images?: TranscriptImage[] }
export type Transcript = { userPrompt?: string; header: TranscriptHeader; prompt: string; events: EngineEvent[]; state: 'running' | 'done' | 'error' | 'interrupted'; incomplete: boolean }
export type TranscriptPage = { entries: TranscriptHeader[]; next: string; notice: string }
export type TranscriptResult<T> = { ok: true; value: T } | { ok: false; error: string }
export type TranscriptImageDownload = TranscriptImage & { data: string; name: string; verified: true }
export type TranscriptBridge = {
  raw?(id: string): Promise<TranscriptResult<{ content: string; bytes: number; format: 'ndjson' }>>
  image?(id: string, imageId: string): Promise<TranscriptResult<TranscriptImageDownload>>
  list(before?: string): Promise<TranscriptResult<TranscriptPage>>
  read(id: string): Promise<TranscriptResult<Transcript>>
}

export function validTranscriptImages(value: unknown, pictures: number): value is TranscriptImage[] | undefined {
  if (value === undefined) return true // Legacy count-only record.
  if (!Array.isArray(value) || value.length !== pictures || value.length > 4) return false
  return value.every((image, index) => image && typeof image === 'object' && image.id === `image-${index + 1}` && ['image/png', 'image/jpeg', 'image/webp'].includes(image.mime) && Number.isSafeInteger(image.bytes) && image.bytes > 0 && image.bytes <= 2 * 1024 * 1024 && typeof image.sha256 === 'string' && /^[a-f0-9]{64}$/.test(image.sha256))
}

/** Export exactly what was recorded; status/tool/thinking output is not a model answer. */
export function transcriptMarkdown(turn: Transcript): string {
  const h = turn.header
  const lines = [`# ${h.title}`, '', `Recorded: ${h.at}`, `Engine: ${h.engine}`, `Model: ${h.model || 'Engine default'}`, `State: ${turn.state}`, '', '## You', '', turn.prompt, '']
  if (h.pictures && h.images === undefined) lines.push(`Attachment notice: ${h.pictures} image(s) accompanied this request, but this older record kept only their count. Their original bytes cannot be recovered or downloaded from this transcript.`, '')
  else if (h.images?.length) {
    lines.push(`Attachment notice: ${h.images.length} image(s) accompanied this request. Their bytes are retained as separate digest-checked transcript files; they are not embedded in this text export.`, '')
    for (const image of h.images) lines.push(`- ${image.id}: ${image.mime}, ${image.bytes} bytes, SHA-256 ${image.sha256}`)
    lines.push('')
  }
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
    if (m.nativeRecord?.pictures && m.nativeRecord.images === undefined) lines.push('### Native image attachments', '', `${m.nativeRecord.pictures} image(s) were sent, but this older record retained only their count. Original bytes are unavailable.`, '')
    else if (m.nativeRecord?.images?.length) {
      lines.push('### Retained native image attachments', '', 'Open the linked original transcript in OddBrain to download the separately stored, digest-checked bytes.', '')
      for (const image of m.nativeRecord.images) lines.push(`- ${image.id}: ${image.mime}, ${image.bytes} bytes, SHA-256 ${image.sha256}`)
      lines.push('')
    }
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
