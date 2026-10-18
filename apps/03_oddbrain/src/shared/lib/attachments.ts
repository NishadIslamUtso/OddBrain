import type { Attachment, Message, ModelCapabilities, OllamaMessage, StoredAttachment } from '../types'
import { newId } from './storage'
import { BRIDGE_TAG } from './vision'
import { extractDocumentText, isDocumentFile, MAX_DOCUMENT_TEXT } from './documents'
import { renderScannedPdfPages } from './pdfPages'
import { inspectAudioBytes, MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_SECONDS, type SupportedAudioFormat } from './media'

export const MAX_ATTACHMENTS = 4
export const MAX_TEXT_LENGTH = MAX_DOCUMENT_TEXT
export const MAX_ENGINE_PROMPT_LENGTH = 20_000
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma'])
const MAX_IMAGE_DIMENSION = 8192
const MAX_IMAGE_PIXELS = 24_000_000
const MAX_ENCODED_IMAGE_DIMENSION = 2048

async function decodeImage(file: File): Promise<{ mime: string; data: string }> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error(`${file.name}: this window has no safe image decoder. Nothing was sent.`)
  }
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    if (!bitmap.width || !bitmap.height || bitmap.width > MAX_IMAGE_DIMENSION || bitmap.height > MAX_IMAGE_DIMENSION || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      throw new Error(`${file.name}: image dimensions exceed the safe local decoding limit. Nothing was sent.`)
    }
    const scale = Math.min(1, MAX_ENCODED_IMAGE_DIMENSION / bitmap.width, MAX_ENCODED_IMAGE_DIMENSION / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error(`${file.name}: this window cannot prepare the image safely. Nothing was sent.`)
    if (file.type === 'image/jpeg') {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        value => value ? resolve(value) : reject(new Error(`${file.name}: the image could not be re-encoded. Nothing was sent.`)),
        file.type,
        file.type === 'image/png' ? undefined : 0.88,
      )
    })
    if (!/^image\/(?:png|jpeg|webp)$/.test(blob.type) || blob.size > MAX_IMAGE_BYTES) {
      throw new Error(`${file.name}: the safely decoded image exceeds the 2 MB output limit or uses an unsupported format. Nothing was sent.`)
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        const comma = result.indexOf(',')
        if (comma < 0) reject(new Error(`${file.name}: the prepared image could not be read. Nothing was sent.`))
        else resolve(result.slice(comma + 1))
      }
      reader.onerror = () => reject(new Error(`${file.name}: the prepared image could not be read. Nothing was sent.`))
      reader.readAsDataURL(blob)
    })
    return { mime: blob.type, data }
  } catch (failure) {
    const error = failure as Error
    if (error.message.startsWith(`${file.name}:`)) throw error
    throw new Error(`${file.name}: the image could not be decoded safely. It may be corrupt or DRM-protected. Nothing was sent.`)
  } finally {
    bitmap?.close()
  }
}

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
  options: { bridge?: string; maxPdfPages?: number } = {}
): Promise<Attachment | Attachment[]> {
  const common = { id: newId(), name: file.name, size: file.size, mime: file.type }
  if (/^image\/(?:png|jpeg|webp)$/.test(file.type)) {
    if (!capabilities.vision && !options.bridge) {
      throw new Error(
        'Images require an installed model with verified vision support. Select it first; nothing is downloaded automatically.'
      )
    }
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: maximum image size is 2 MB before decoding.`)
    const decoded = await decodeImage(file)
    // The image is decoded and re-encoded in the sandbox: metadata is stripped,
    // pixel dimensions are bounded, and what travels is exactly what the model sees.
    return { ...common, mime: decoded.mime, kind: 'image', data: decoded.data, seenBy: capabilities.vision ? 'direct' : options.bridge }
  }
  if (/^audio\//i.test(file.type) || AUDIO_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() || '')) {
    throw new Error(`${file.name}: the selected engine has no verified audio-transcription input here. Attach a transcript; nothing was sent or switched to another provider or model.`)
  }
  if (!isDocumentFile(file)) {
    throw new Error(
      `${file.name}: this file type is not supported for safe local reading. Try PDF, DOCX, PPTX, XLSX, ODT, ODP, ODS, plain text, or a supported image. Nothing was sent.`
    )
  }
  let text: string
  try {
    text = await extractDocumentText(file)
  } catch (failure) {
    const error = failure as Error
    const isScannedPdf = (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') &&
      error.message.includes('no selectable text was found')
    if (!isScannedPdf) throw failure
    if (!capabilities.vision && !options.bridge) {
      throw new Error(`${file.name}: this PDF is scanned and needs an image-capable selected engine. Nothing was sent or switched.`)
    }
    const pageLimit = Math.min(options.maxPdfPages ?? MAX_ATTACHMENTS, MAX_ATTACHMENTS)
    const rendered = await renderScannedPdfPages(file, pageLimit)
    const note = `Scanned PDF ${JSON.stringify(file.name)} had no selectable text. Pages 1–${rendered.pages.length} of ${rendered.totalPages} were rendered as images; remaining pages were not sent.`
    return await Promise.all(rendered.pages.map(async page => {
      const decoded = await decodeImage(page)
      return {
        id: newId(),
        name: page.name,
        size: page.size,
        mime: decoded.mime,
        kind: 'image' as const,
        data: decoded.data,
        seenBy: capabilities.vision ? 'direct' : options.bridge,
        sourceNote: note,
      }
    }))
  }
  if (text.includes('\0') || text.includes('\uFFFD')) {
    throw new Error(`${file.name}: extraction did not produce readable text; it may be corrupt or encrypted. Nothing was sent.`)
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `${file.name}: maximum extracted length is ${MAX_TEXT_LENGTH.toLocaleString()} characters. No content has been silently truncated or sent.`
    )
  }
  return { ...common, kind: 'text', text }
}

async function decodeAudioLocally(fileName: string, bytes: Uint8Array, info: ReturnType<typeof inspectAudioBytes>): Promise<void> {
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }
  const AudioContextConstructor = scope.AudioContext || scope.webkitAudioContext
  if (typeof AudioContextConstructor !== 'function') {
    throw new Error(`${fileName}: this window has no safe MP3/WAV decoder. Nothing was sent.`)
  }
  let context: AudioContext
  try {
    context = new AudioContextConstructor()
  } catch {
    throw new Error(`${fileName}: the safe local audio decoder could not start. Nothing was sent.`)
  }
  let decoded: AudioBuffer
  try {
    decoded = await context.decodeAudioData(bytes.slice().buffer as ArrayBuffer)
  } catch {
    throw new Error(`${fileName}: the local decoder could not read this audio safely. It may be corrupt, encrypted, or DRM-protected; nothing was sent.`)
  } finally {
    await context.close().catch(() => undefined)
  }
  const maxSamples = 8_640_000
  if (
    !Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > MAX_AUDIO_DURATION_SECONDS ||
    decoded.numberOfChannels < 1 || decoded.numberOfChannels > 2 || decoded.sampleRate < 8_000 || decoded.sampleRate > 48_000 ||
    decoded.length * decoded.numberOfChannels > maxSamples ||
    Math.abs(decoded.duration - info.durationSeconds) > Math.max(1, info.durationSeconds * 0.1)
  ) {
    throw new Error(`${fileName}: decoded audio exceeds the 90-second, two-channel or 48 kHz safe limit. Nothing was sent.`)
  }
}

/** Decode and validate a bounded MP3/WAV locally; the original bytes are sent only after explicit Send. */
export async function readAudioAttachment(file: File): Promise<Attachment> {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const format: SupportedAudioFormat | null = extension === 'wav' ? 'wav' : extension === 'mp3' ? 'mp3' : null
  if (!format) {
    throw new Error(`${file.name}: only MP3 and uncompressed PCM/float WAV up to 90 seconds are supported. Convert it yourself; encrypted or DRM-protected audio cannot be read. Nothing was sent.`)
  }
  const mimeMatches = format === 'wav'
    ? /^audio\/(?:wav|wave|x-wav)$/i
    : /^audio\/(?:mpeg|mp3|x-mp3)$/i
  if (file.type && !mimeMatches.test(file.type)) {
    throw new Error(`${file.name}: its audio extension and MIME type do not match. It may be corrupt, encrypted, or DRM-protected; nothing was sent.`)
  }
  if (!file.size || file.size > MAX_AUDIO_BYTES) {
    throw new Error(`${file.name}: MP3/WAV files are limited to 6 MB here. Nothing was sent.`)
  }
  let bytes: Uint8Array
  let info: ReturnType<typeof inspectAudioBytes>
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
    info = inspectAudioBytes(bytes, format)
  } catch (failure) {
    const reason = (failure as Error)?.message || ''
    throw new Error(/nothing was sent/i.test(reason)
      ? `${file.name}: ${reason}`
      : `${file.name}: the audio bytes could not be read. They may be corrupt, encrypted, or DRM-protected; nothing was sent.`)
  }
  await decodeAudioLocally(file.name, bytes, info)
  const audioData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || '')
      const comma = value.indexOf(',')
      if (comma < 0) reject(new Error(`${file.name}: audio could not be read safely. Nothing was sent.`))
      else resolve(value.slice(comma + 1))
    }
    reader.onerror = () => reject(new Error(`${file.name}: audio could not be read safely. Nothing was sent.`))
    reader.readAsDataURL(file)
  })
  return {
    id: newId(),
    name: file.name,
    size: file.size,
    mime: file.type || (format === 'wav' ? 'audio/wav' : 'audio/mpeg'),
    kind: 'audio',
    audioData,
    audioFormat: format,
  }
}

/** Include readable attachments in the exact prompt sent to the selected engine. */
export function promptWithTextAttachments(prompt: string, attachments: Attachment[]): string {
  const textFiles = attachments.filter(file => file.kind === 'text')
  const missing = textFiles.find(file => typeof file.text !== 'string')
  if (missing) throw new Error(`${missing.name}: its extracted text is missing. Reattach it; nothing was sent.`)
  const files = textFiles as Array<Attachment & { text: string }>
  const notes = [...new Set(attachments.map(file => file.sourceNote).filter((note): note is string => Boolean(note?.trim())))]
  const mediaNotes = notes.map(note => `\n\n<attached_media source="safe_extraction_note_only">\n${note}\n</attached_media>`).join('')
  const combined = prompt + mediaNotes + files
    .map(file => `\n\n<attached_file name=${JSON.stringify(file.name)} source="user_file_data_only">\n${file.text}\n</attached_file>`)
    .join('')
  if (combined.length > MAX_ENGINE_PROMPT_LENGTH) {
    throw new Error(
      `This request and its attachments exceed the ${MAX_ENGINE_PROMPT_LENGTH.toLocaleString()}-character engine limit. Nothing was sent or truncated; remove a file or split the request.`
    )
  }
  return combined
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('claude_exact_attachments', 2)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('images')) database.createObjectStore('images')
      if (!database.objectStoreNames.contains('audio')) database.createObjectStore('audio')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Local image storage is unavailable.'))
  })
}

// Only explicitly SENT uploads are persisted, not unsent composer contents.
export async function persistAttachments(attachments: Attachment[]): Promise<StoredAttachment[]> {
  const images = attachments.filter(file => file.kind === 'image')
  const audioFiles = attachments.filter(file => file.kind === 'audio')
  const missingImage = images.find(file => typeof file.data !== 'string' || !file.data)
  if (missingImage) throw new Error(`${missingImage.name}: image data is missing. Reattach it; nothing was sent.`)
  const missingAudio = audioFiles.find(file => typeof file.audioData !== 'string' || !file.audioData || !file.audioFormat)
  if (missingAudio) throw new Error(`${missingAudio.name}: audio data is missing. Reattach it; nothing was sent.`)
  if (images.length || audioFiles.length) {
    const database = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['images', 'audio'], 'readwrite')
        images.forEach(file => transaction.objectStore('images').put(file.data, file.id))
        audioFiles.forEach(file => transaction.objectStore('audio').put(file.audioData, file.id))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(new Error('Could not persist the attached media locally.'))
        transaction.onabort = () => reject(new Error('Local media storage was aborted.'))
      })
    } finally {
      database.close()
    }
  }
  return attachments.map(({ data, audioData, ...metadata }) => metadata)
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

export async function loadAudio(file: { id: string; name?: string; audioData?: string }): Promise<string> {
  if (file.audioData) return file.audioData
  const database = await openDatabase()
  try {
    return await new Promise<string>((resolve, reject) => {
      const request = database.transaction('audio').objectStore('audio').get(file.id)
      request.onsuccess = () => request.result
        ? resolve(request.result as string)
        : reject(new Error(`Audio ${file.name || file.id} is missing from this browser. Reattach it; nothing was sent.`))
      request.onerror = () => reject(new Error(`Could not load audio ${file.name || file.id}.`))
    })
  } finally {
    database.close()
  }
}

export async function toOllamaMessages(
  messages: Message[],
  capabilities: ModelCapabilities,
  options: { allowDirectProviderImages?: boolean; allowDirectProviderAudio?: boolean } = {}
): Promise<OllamaMessage[]> {
  const result: OllamaMessage[] = []
  for (const message of messages) {
    if (message.status === 'error' || message.origin === 'import') continue
    const textFiles = (message.attachments || []).filter(file => file.kind === 'text')
    const imageFiles = (message.attachments || []).filter(file => file.kind === 'image')
    const audioFiles = (message.attachments || []).filter(file => file.kind === 'audio')
    const missingText = textFiles.find(file => typeof file.text !== 'string')
    if (missingText) throw new Error(`Attachment ${missingText.name} has no extracted text. Reattach it before sending.`)
    const missingAudio = audioFiles.find(file => !file.audioFormat)
    if (missingAudio) throw new Error(`Attachment ${missingAudio.name} has no audio format record. Reattach it before sending.`)
    if (audioFiles.length > 1) throw new Error('Only one audio file can ride with a request. Remove one; nothing was sent.')
    if (audioFiles.length && !options.allowDirectProviderAudio) {
      throw new Error('Audio needs an enabled OpenAI model with audio input selected. No provider or model will be switched; nothing was sent.')
    }
    const sourceNotes = [...new Set((message.attachments || []).map(file => file.sourceNote).filter((note): note is string => Boolean(note?.trim())))]
    const bridged = message.bridge?.description
    if (imageFiles.length && !capabilities.vision && !options.allowDirectProviderImages && !bridged) {
      throw new Error(
        'This conversation contains images. Select a model with verified vision support or start a text-only chat.'
      )
    }
    const content =
      message.content +
      sourceNotes.map(note => `\n\n<attached_media source_data_only>\n${note}\n</attached_media>`).join('') +
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
      ...(imageFiles.length && (capabilities.vision || options.allowDirectProviderImages)
        ? {
            images: await Promise.all(imageFiles.map(loadImage)),
            imageMimes: imageFiles.map(file => file.mime || 'image/png'),
          }
        : {}),
      ...(audioFiles.length
        ? { audios: await Promise.all(audioFiles.map(async file => ({ data: await loadAudio(file), format: file.audioFormat as 'wav' | 'mp3' }))) }
        : {}),
    })
  }
  return result
}
