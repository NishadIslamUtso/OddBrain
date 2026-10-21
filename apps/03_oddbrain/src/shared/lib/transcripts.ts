import type { EngineEvent, EngineId } from './engine'
import type { Chat } from '../types'
import { scanTextHazards } from './textHazards'

export type TranscriptImage = {
  /** Stable identifier inside one transcript; never a general file path. */
  id: string
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  bytes: number
  sha256: string
}
export type TranscriptAttachment = { id: string; name: string; mime: string; bytes: number; sha256: string }
export type TranscriptHeader = { chatId?: string; context?: import('./nativeConversation').ContextReceipt; id: string; at: string; engine: EngineId; model: string; workspace: string; title: string; pictures: number; /** Undefined means an older record that kept only the count. */ images?: TranscriptImage[]; /** Exact original source files retained separately before dispatch. */ attachments?: TranscriptAttachment[] }
export type Transcript = { userPrompt?: string; header: TranscriptHeader; prompt: string; events: EngineEvent[]; state: 'running' | 'done' | 'error' | 'interrupted'; incomplete: boolean }
export type TranscriptPage = { entries: TranscriptHeader[]; next: string; notice: string }
export type TranscriptRecoveryPage = { records: Transcript[]; next: string; notice: string }
export type TranscriptResult<T> = { ok: true; value: T } | { ok: false; error: string }
export type TranscriptImageDownload = TranscriptImage & { data: string; name: string; verified: true }
export type TranscriptAttachmentDownload = TranscriptAttachment & { data: string; verified: true }
export type TranscriptBridge = {
  raw?(id: string): Promise<TranscriptResult<{ content: string; bytes: number; format: 'ndjson' }>>
  recover?(chatIds: string[], knownTranscriptIds: string[], before?: string): Promise<TranscriptResult<TranscriptRecoveryPage>>
  image?(id: string, imageId: string): Promise<TranscriptResult<TranscriptImageDownload>>
  attachment?(id: string, attachmentId: string): Promise<TranscriptResult<TranscriptAttachmentDownload>>
  saveAttachment?(id: string, attachmentId: string): Promise<{ ok: boolean; answer: string }>
  list(before?: string): Promise<TranscriptResult<TranscriptPage>>
  read(id: string): Promise<TranscriptResult<Transcript>>
}

export function validTranscriptAttachments(value: unknown): value is TranscriptAttachment[] | undefined {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > 8) return false
  let total = 0
  return value.every((file, index) => {
    if (!file || typeof file !== 'object' || file.id !== `attachment-${index + 1}` || typeof file.name !== 'string' || !file.name || file.name.length > 255 || /[\x00-\x1f]/.test(file.name) || typeof file.mime !== 'string' || file.mime.length > 200 || /[\x00-\x1f]/.test(file.mime) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) return false
    total += file.bytes
    return Number.isSafeInteger(total)
  })
}

export function validTranscriptImages(value: unknown, pictures: number): value is TranscriptImage[] | undefined {
  if (value === undefined) return true // Legacy count-only record.
  if (!Array.isArray(value) || value.length !== pictures || value.length > 4) return false
  return value.every((image, index) => image && typeof image === 'object' && image.id === `image-${index + 1}` && ['image/png', 'image/jpeg', 'image/webp'].includes(image.mime) && Number.isSafeInteger(image.bytes) && image.bytes > 0 && image.bytes <= 2 * 1024 * 1024 && typeof image.sha256 === 'string' && /^[a-f0-9]{64}$/.test(image.sha256))
}

function addHazardAppendix(lines: string[]): void {
  const report = scanTextHazards(lines.join('\n'))
  if (!report.total) return
  lines.push('', '## Invisible-text review (labelled derivative)', '', report.notice, 'The exact export text above was not rewritten. These labelled excerpts are additional review aids.', '')
  for (const finding of report.findings) {
    lines.push(`- ${finding.label}: ${finding.count}; ${finding.codePoints.join(', ')}; UTF-16 positions ${finding.positions.join(', ')}`)
    for (const example of finding.excerpts) lines.push(`  - ${example}`)
  }
}

/** Export exactly what was recorded; status/tool/thinking output is not a model answer. */
export function transcriptMarkdown(turn: Transcript): string {
  const h = turn.header
  const ownerPrompt = turn.userPrompt ?? turn.prompt
  const lines = [`# ${h.title}`, '', `Recorded: ${h.at}`, `Engine: ${h.engine}`, `Model: ${h.model || 'Engine default'}`, `State: ${turn.state}`, '', '## You', '', ownerPrompt, '']
  if (turn.userPrompt !== undefined) lines.push('## Exact text dispatched to the native engine', '', 'This app envelope can contain OddBrain-authored instructions, owner-selected project preferences, untrusted quoted references or stored conversation text, followed by the current owner request. It is preserved here exactly and is not all attributed to “You”.', '', turn.prompt, '')
  if (h.context) {
    lines.push('## Dispatch provenance receipt', '', `Working folder: ${h.context.workspace}`, `Text dispatch characters: ${h.context.characters}`, `Stored history messages explicitly carried: ${h.context.historyMessages}`, `Receipt SHA-256: ${h.context.revision}`, '')
    if (h.context.session) lines.push(`Native session state: ${h.context.session.state}`, h.context.session.detail, '')
    else lines.push('Native session state: not recorded by this older receipt.', '')
    if (h.context.launch) {
      lines.push('### Native folder activation inventory', '', `Complete within bounds: ${h.context.launch.complete}`, `Configuration files: ${h.context.launch.files} (${h.context.launch.connectorFiles} connector, ${h.context.launch.ruleFiles} rule/instruction, ${h.context.launch.hookFiles} hook/config)`, `Inventory SHA-256: ${h.context.launch.digest}`, ...h.context.launch.warnings.map(item => `Warning: ${item}`), '')
    }
    lines.push('### Context sources', '')
    for (const source of h.context.sources) {
      lines.push(`- ${source.title} [${source.role || 'legacy attribution'}]: ${source.chars} characters; ${source.coverage}${source.digest ? `; SHA-256 ${source.digest}` : ''}`)
      if (source.hazards?.total) {
        lines.push(`  Invisible-text warning: ${source.hazards.notice}`)
        for (const finding of source.hazards.findings) lines.push(`  - ${finding.label}: ${finding.count}; ${finding.codePoints.join(', ')}; UTF-16 positions ${finding.positions.join(', ')}`)
      }
    }
    lines.push('')
  }
  if (h.pictures && h.images === undefined) lines.push(`Attachment notice: ${h.pictures} image(s) accompanied this request, but this older record kept only their count. Their original bytes cannot be recovered or downloaded from this transcript.`, '')
  else if (h.images?.length) {
    lines.push(`Attachment notice: ${h.images.length} image(s) accompanied this request. Their bytes are retained as separate digest-checked transcript files; they are not embedded in this text export.`, '')
    for (const image of h.images) lines.push(`- ${image.id}: ${image.mime}, ${image.bytes} bytes, SHA-256 ${image.sha256}`)
    lines.push('')
  }
  if (h.attachments?.length) {
    lines.push(`Original-file notice: ${h.attachments.length} source file(s) were retained separately before dispatch. Their bytes are not embedded in this text export.`, '')
    for (const file of h.attachments) lines.push(`- ${file.id}: ${file.name}, ${file.mime || 'MIME not reported'}, ${file.bytes} bytes, SHA-256 ${file.sha256}`)
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
    else if (e.kind === 'permission') lines.push(`## Approval requested: ${e.tool}`, '', e.summary, ...(e.risk ? [`Risk: ${e.risk}`] : []), e.detail || '', '')
    else if (e.kind === 'error' || e.kind === 'status') lines.push(`## ${e.kind === 'error' ? 'Error' : 'Activity'}`, '', e.text, '')
    else if (e.kind === 'session') lines.push(`Native session: ${e.id}`, '')
  }
  flush()
  if (turn.incomplete || turn.state === 'interrupted') lines.push('Recording notice: this record has no confirmed complete ending or has an incomplete final entry. It must not be treated as a successful task.', '')
  lines.push('Export exposure notice: this app-recorded transcript can contain the owner’s exact request, OddBrain’s dispatch envelope, project preferences, quoted source/reference text, attachment names and digests, working-folder paths, native session identifiers, engine output, thinking, tool details and approval diffs. It is not a native-session import, a permission grant, or proof that a tool succeeded.')
  addHazardAppendix(lines)
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
    if (m.nativeRecord?.attachments?.length) {
      lines.push('### Retained original source files', '', 'Open the linked original transcript in OddBrain to download the separately stored, digest-checked bytes.', '')
      for (const file of m.nativeRecord.attachments) lines.push(`- ${file.name}: ${file.mime || 'MIME not reported'}, ${file.bytes} bytes, SHA-256 ${file.sha256}`)
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
  addHazardAppendix(lines)
  return lines.join('\n')
}
