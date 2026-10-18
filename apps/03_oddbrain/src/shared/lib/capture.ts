/**
 * Turning a conversation into a vault capture.
 *
 * Pure on purpose — a chat and a clock in, the payload the vault accepts out —
 * so what the vault is about to be told can be read and tested without a running
 * vault, and without the interface being involved.
 *
 * Two things it deliberately does not do:
 *
 *   - It does not tidy the conversation up. A stopped reply is captured as a
 *     stopped reply, a turn that errored is captured with its error, and the
 *     thinking text is kept beside the answer. A capture is evidence of what
 *     happened, so a version of it that only contains the good parts is worth
 *     less than nothing.
 *   - It does not turn a title into a personal fact. Capturing "gym plan" proves
 *     the words were written, not that anything is true; the vault keeps sources
 *     and entities apart for exactly this reason.
 */
import type { Chat, Message } from '../types'

export type CapturedAttachment =
  | { id: string; name: string; kind: 'image'; mime: string; data: string }
  | { id: string; name: string; kind: 'text'; text: string }

export type CapturedMessage = {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  thinking?: string
  context?: string
  status?: string
  attachments?: CapturedAttachment[]
}

export type ConversationCapture = {
  type: 'conversation'
  provider: string
  conversation_id: string
  title: string
  captured_at: string
  completeness: 'full' | 'partial'
  messages: CapturedMessage[]
}

/** The vault accepts four attachment files per message; captions and text are unlimited. */
const MAX_ATTACHMENT_FILES = 4

export function conversationCapture(
  chat: Chat,
  options: { now?: Date; provider?: string } = {}
): ConversationCapture {
  const captured = (options.now || new Date()).toISOString()
  let leftBehind = 0

  const messages: CapturedMessage[] = chat.messages.map((message: Message) => {
    const files: CapturedAttachment[] = []
    for (const file of message.attachments || []) {
      const isImage = file.kind === 'image' && typeof file.data === 'string' && file.data.length > 0
      const isText = typeof file.text === 'string' && file.text.length > 0
      if (!isImage && !isText) continue
      if (files.length >= MAX_ATTACHMENT_FILES) {
        leftBehind += 1
        continue
      }
      files.push(
        isImage
          ? { id: file.id, name: file.name, kind: 'image', mime: file.mime || 'image/png', data: file.data as string }
          : { id: file.id, name: file.name, kind: 'text', text: file.text as string }
      )
    }
    return {
      role: message.role,
      text: message.content,
      timestamp: message.at || message.timestamp || captured,
      ...(message.thinking ? { thinking: message.thinking } : {}),
      ...(message.context ? { context: message.context } : {}),
      ...(message.status ? { status: message.status } : {}),
      ...(files.length ? { attachments: files } : {}),
    }
  })

  const unfinished = chat.messages.some(
    message => !message.status || message.status === 'streaming' || message.status === 'error' || message.status === 'stopped'
  )

  return {
    type: 'conversation',
    provider: options.provider || 'OddBrain',
    conversation_id: chat.id,
    title: chat.title,
    captured_at: captured,
    // 'partial' is recorded in the file's frontmatter, so a reader of the vault
    // can tell a clean conversation from one that was stopped or that lost
    // attachment files to the four-per-message limit.
    completeness: unfinished || leftBehind ? 'partial' : 'full',
    messages,
  }
}
