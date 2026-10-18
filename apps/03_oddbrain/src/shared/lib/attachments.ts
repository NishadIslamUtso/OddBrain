import type { Attachment, Message, ModelCapabilities, OllamaMessage, StoredAttachment } from '../types'
import { newId } from './storage'
import { BRIDGE_TAG } from './vision'
import {
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES as MAX_DECODED_IMAGE_BYTES,
  MAX_TEXT_LENGTH as MAX_DECODED_TEXT,
  audioFacts,
  browserInflater,
  decodeImage,
  describeDuration,
  mediaKind,
  officeText,
  pdfText,
} from './decode'

export const MAX_ATTACHMENTS = 4
export const MAX_TEXT_LENGTH = 12_000

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
  const kind = mediaKind(file)

  if (kind === 'image') {
    // Any picture the window can open, resampled to what the model can take.
    // The old gate refused everything that was not PNG/JPEG/WebP; a screenshot
    // saved as .gif or .avif is not a different idea from a screenshot.
    if (!capabilities.vision && !options.bridge) {
      throw new Error(
        'Pictures need the model you picked to read images. Choose a model with vision, or a verified vision model to describe them first. Nothing is downloaded automatically.'
      )
    }
    const decoded = await decodeImage(file)
    if (!decoded) {
      throw new Error(
        `${file.name}: this build cannot decode that picture format. PNG, JPEG, WebP, GIF, BMP and AVIF work; HEIC and some RAW formats need converting first.`
      )
    }
    if (decoded.png.byteLength > MAX_DECODED_IMAGE_BYTES) {
      throw new Error(
        `${file.name}: after resizing to ${decoded.width}×${decoded.height} it is still over the 2 MB picture limit. Crop it or save a smaller copy.`
      )
    }
    const data = bytesToBase64(decoded.png)
    return {
      ...common,
      kind: 'image',
      data,
      seenBy: capabilities.vision ? 'direct' : options.bridge,
      ...(file.type && !/^image\/(png|jpeg|webp)$/.test(file.type)
        ? { name: `${file.name.replace(/\.[^.]+$/, '')}.png`, mime: 'image/png' }
        : {}),
    }
  }

  if (kind === 'pdf') {
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new Error(`${file.name}: PDFs over ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB are refused. Split it or export the pages you need.`)
    }
    const { text, pages } = await pdfText(new Uint8Array(await file.arrayBuffer()), browserInflater())
    if (!text) {
      throw new Error(
        `${file.name}: this PDF has no text layer — it is a scan or uses an encoding this build cannot read. I did not read it. Paste or dictate the part that matters, or attach screenshots of the pages.`
      )
    }
    return textAttachment(common, text, `${file.name} (${pages} page${pages === 1 ? '' : 's'})`)
  }

  if (kind === 'office') {
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new Error(`${file.name}: documents over ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB are refused.`)
    }
    const result = await officeText(file)
    if (!result.ok) throw new Error(result.problem)
    return textAttachment(common, result.text, `${file.name} — ${result.note}`)
  }

  if (kind === 'audio') {
    // The engines cannot hear. Measure the file, then say what is true.
    const facts = await audioFacts(file)
    const length = facts ? ` It runs ${describeDuration(facts.duration)}${facts.channels > 1 ? ` in ${facts.channels} channels` : ''}.` : ''
    throw new Error(
      `${file.name}: the engine you picked cannot listen to audio, so I have not heard it.${length} Use the Dictate button to speak the words, or attach a transcript.`
    )
  }

  if (kind === 'unknown') {
    throw new Error(
      `${file.name}: this window does not know that file type, and guessing would mean pretending to read it. Text, code, PDF, Word/Excel/PowerPoint, pictures, video and audio are the supported kinds.`
    )
  }

  if (file.size > 64 * 1024) throw new Error(`${file.name}: maximum text file size is 64 KB.`)
  const text = await file.text()
  if (text.includes('\0') || text.includes('\uFFFD')) {
    throw new Error(`${file.name}: this is not a readable UTF-8 text file.`)
  }
  return textAttachment(common, text, file.name)
}

/** Text, capped with an explicit note when the cap bites. */
function textAttachment(common: { id: string; name: string; size: number; mime: string }, text: string, note: string): Attachment {
  if (text.length > MAX_DECODED_TEXT) {
    throw new Error(
      `${common.name}: the extracted text is ${text.length.toLocaleString()} characters; the limit is ${MAX_DECODED_TEXT.toLocaleString()}. Nothing was silently cut. Attach a section, or ask me to read the part you name.`
    )
  }
  if (!text.trim()) throw new Error(`${common.name}: there was no text to read in it.`)
  return { ...common, kind: 'text', text, note } as Attachment
}

/** Base64 without a stack-blowing spread over a 2 MB array. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step))
  }
  return btoa(binary)
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
