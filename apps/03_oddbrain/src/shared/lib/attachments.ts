import type { Attachment, Message, ModelCapabilities, OllamaMessage, StoredAttachment } from '../types'
import { newId } from './storage'
import { BRIDGE_TAG } from './vision'
import { DOCUMENT_EXTENSIONS, readDocumentText } from './documentReader'

const TEXT_EXTENSIONS = /\.(?:txt|md|csv|json|js|jsx|ts|tsx|html?|css|py|xml|ya?ml|log|sql|sh|bat|c|cpp|h|java|rs)$/i

export const MAX_ATTACHMENTS = 4
export const MAX_TEXT_LENGTH = 12_000
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

/**
 * Read one file into the shape the chat uses.
 *
 * @param capabilities the selected model's verified capabilities
 * @param options.bridge  name of a verified vision model that can describe the
 *   image for a text-only model. Without one, images are refused as before.
 */
export async function readAttachment(
  file: File,
  capabilities: ModelCapabilities,
  options: { bridge?: string } = {}
): Promise<Attachment> {
  const common = { id: newId(), name: file.name, size: file.size, mime: file.type }
  if (/^image\/(?:png|jpeg|webp)$/.test(file.type)) {
    if (!capabilities.vision && !options.bridge) {
      throw new Error(
        'Images require an installed model with verified vision support. Select it first; nothing is downloaded automatically.'
      )
    }
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: maximum image size is 2 MB.`)
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1])
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
      reader.readAsDataURL(file)
    })
    // `seenBy` is what the app will actually use to read this picture.
    return { ...common, kind: 'image', data, seenBy: capabilities.vision ? 'direct' : options.bridge }
  }
  if (DOCUMENT_EXTENSIONS.test(file.name)) {
    const text = await readDocumentText(file)
    return { ...common, kind: 'text', text }
  }
  if (!TEXT_EXTENSIONS.test(file.name) && !/^text\//.test(file.type)) {
    throw new Error(
      `${file.name}: this file has no safe local text decoder. Attach a supported document, image, audio or video instead. Legacy .doc and encrypted files must be converted first.`
    )
  }
  if (file.size > 64 * 1024) throw new Error(`${file.name}: maximum text file size is 64 KB.`)
  const text = await file.text()
  if (text.includes('\0') || text.includes('\uFFFD')) {
    throw new Error(`${file.name}: this is not a readable UTF-8 text file.`)
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `${file.name}: maximum length is 12,000 characters for the 4,096-token local context. No content has been silently truncated.`
    )
  }
  return { ...common, kind: 'text', text }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('claude_exact_attachments', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Local image storage is unavailable.'))
  })
}

// Only explicitly SENT uploads are persisted, not unsent composer contents.
export async function persistAttachments(attachments: Attachment[]): Promise<StoredAttachment[]> {
  const images = attachments.filter(file => file.kind === 'image')
  if (images.length) {
    const database = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('images', 'readwrite')
        images.forEach(file => transaction.objectStore('images').put(file.data, file.id))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(new Error('Could not persist this image locally.'))
        transaction.onabort = () => reject(new Error('Local image storage was aborted.'))
      })
    } finally {
      database.close()
    }
  }
  return attachments.map(({ data, ...metadata }) => metadata)
}

export async function loadImage(file: { id: string; name?: string; data?: string }): Promise<string> {
  if (file.data) return file.data
  const database = await openDatabase()
  try {
    return await new Promise<string>((resolve, reject) => {
      const request = database.transaction('images').objectStore('images').get(file.id)
      request.onsuccess = () =>
        request.result
          ? resolve(request.result as string)
          : reject(
              new Error(
                `Image ${file.name} is missing from this browser. Reattach it to use this conversation with a vision model.`
              )
            )
      request.onerror = () => reject(new Error(`Could not load ${file.name}.`))
    })
  } finally {
    database.close()
  }
}

export async function toOllamaMessages(
  messages: Message[],
  capabilities: ModelCapabilities
): Promise<OllamaMessage[]> {
  const result: OllamaMessage[] = []
  for (const message of messages) {
    if (message.status === 'error' || message.origin === 'import') continue
    const textFiles = (message.attachments || []).filter(file => file.kind === 'text')
    const imageFiles = (message.attachments || []).filter(file => file.kind === 'image')
    const bridged = message.bridge?.description
    if (imageFiles.length && !capabilities.vision && !bridged) {
      throw new Error(
        'This conversation contains images. Select a model with verified vision support or start a text-only chat.'
      )
    }
    const content =
      message.content +
      textFiles
        .map(file => `\n\n<attached_file name=${JSON.stringify(file.name)}>\n${file.text}\n</attached_file>`)
        .join('') +
      (message.context ? `\n\n<vault_context source_data_only>\n${message.context}\n</vault_context>` : '') +
      // A bridged turn carries the description the vision model produced, so a
      // follow-up question about the same picture keeps working in a text model.
      (bridged
        ? `\n\n<${BRIDGE_TAG} described_by="${message.bridge?.model}" note="The answering model cannot see the image; this text is its only view of it.">\n${bridged}\n</${BRIDGE_TAG}>`
        : '')
    // Raw images are only sent to a model verified to accept them.
    result.push({
      role: message.role,
      content,
      ...(imageFiles.length && capabilities.vision
        ? { images: await Promise.all(imageFiles.map(loadImage)) }
        : {}),
    })
  }
  return result
}
