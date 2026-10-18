/**
 * The front door for anything the person drops on the app.
 *
 * The owner's rule for this: the app should take and decode audio, video,
 * pictures and files in any format — and when the chosen provider cannot
 * actually use something, say so BEFORE sending, rather than quietly dropping
 * it or quietly switching to a different provider that could.
 *
 * So this module does two jobs. It widens what can be read locally, using only
 * what the runtime already has: any picture Chromium can decode is re-encoded
 * to PNG on a canvas, which turns gif, bmp, svg, avif and ico into something
 * the engine's wire accepts, with no new dependency and nothing sent anywhere.
 * And for everything it cannot use, it produces one honest sentence that names
 * the format, says what is missing, and gives the way through.
 *
 * What it never does is guess. No capability is claimed that was not verified,
 * no format is reported as read when only its name was recognised, and no
 * provider is substituted for the one the person chose.
 */

/** What the chosen engine can actually be asked to do with a file. */
export type IntakeCapabilities = {
  /** The chosen provider reads pictures itself. */
  vision: boolean
  /** A verified vision model is installed that can describe a picture instead. */
  bridge?: string
}

/** How a file will reach the engine, when it can. */
export type IntakeRoute = 'image' | 'video-frames' | 'text'

export type IntakeVerdict =
  | { ok: true; route: IntakeRoute; family: FileFamily; note?: string }
  | { ok: false; family: FileFamily; reason: string }

export type FileFamily =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'office'
  | 'archive'
  | 'text'
  | 'unknown'

/** The engine's wire carries these three and nothing else. */
export const ENGINE_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const

/**
 * Pictures Chromium can decode but the wire cannot carry. These are worth
 * naming separately because they are CONVERTIBLE: re-encoding to PNG is local,
 * lossless enough for reading, and needs no dependency.
 */
const CONVERTIBLE_IMAGE = /\.(gif|bmp|svg|avif|ico)$/i

/** Pictures nothing here can decode. Said plainly rather than attempted. */
const UNREADABLE_IMAGE = /\.(heic|heif|tif|tiff|raw|psd)$/i

const VIDEO_FRAMES = /\.(mp4|webm)$/i
const VIDEO_OTHER = /\.(mov|mkv|avi|wmv|flv|m4v|mpg|mpeg|3gp)$/i
const AUDIO = /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|wma|aiff?|weba)$/i
const PDF = /\.pdf$/i
const OFFICE = /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf|pages|numbers|key)$/i
const ARCHIVE = /\.(zip|rar|7z|tar|gz|bz2|xz)$/i

/**
 * What family a file belongs to. The MIME type is asked first because it is
 * what the operating system reported, and the name is the fallback — a file
 * with no extension is still a picture if the system says so, and a file named
 * `.pdf` that is really text should not be called a PDF.
 */
export function fileFamily(name: string, mime = ''): FileFamily {
  const type = mime.toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('text/')) return 'text'
  if (
    type.includes('wordprocessingml') ||
    type.includes('spreadsheetml') ||
    type.includes('presentationml') ||
    type.includes('msword') ||
    type.includes('ms-excel') ||
    type.includes('ms-powerpoint')
  ) {
    return 'office'
  }
  if (type.includes('zip') || type.includes('compressed') || type.includes('x-tar')) return 'archive'

  if (PDF.test(name)) return 'pdf'
  if (OFFICE.test(name)) return 'office'
  if (AUDIO.test(name)) return 'audio'
  if (VIDEO_FRAMES.test(name) || VIDEO_OTHER.test(name)) return 'video'
  if (UNREADABLE_IMAGE.test(name) || CONVERTIBLE_IMAGE.test(name)) return 'image'
  if (ARCHIVE.test(name)) return 'archive'
  return 'unknown'
}

/**
 * The honest verdict on one dropped file, before anything is read or sent.
 *
 * `name` and `mime` are all this needs: the decision is about what the app can
 * do with the FORMAT, and reading the bytes first would spend work on a file
 * that was always going to be refused.
 */
export function intakeVerdict(
  name: string,
  mime: string,
  capabilities: IntakeCapabilities,
): IntakeVerdict {
  const family = fileFamily(name, mime)

  switch (family) {
    case 'image': {
      if (ENGINE_IMAGE_MIME.includes(mime as (typeof ENGINE_IMAGE_MIME)[number])) {
        return { ok: true, route: 'image', family }
      }
      if (UNREADABLE_IMAGE.test(name) || /^(image\/(?:heic|heif|tiff?|x-photoshop))/.test(mime)) {
        return {
          ok: false,
          family,
          reason:
            `${name} is in a format nothing on this machine can open. Convert it to PNG or JPEG in whatever made it, then drop it again.`,
        }
      }
      // Chromium can decode it, so it can be re-encoded to PNG locally. That
      // still needs somewhere to send the picture.
      if (!capabilities.vision && !capabilities.bridge) {
        return {
          ok: false,
          family,
          reason:
            `${name} can be read as a picture, but the provider you chose cannot see, and no verified vision model is installed to describe it for it. Choose a model that can see; nothing is downloaded automatically.`,
        }
      }
      return {
        ok: true,
        route: 'image',
        family,
        note: `${name} will be re-encoded to PNG on this machine so the engine's wire can carry it.`,
      }
    }

    case 'video': {
      if (!VIDEO_FRAMES.test(name) && !/^video\/(?:mp4|webm)$/.test(mime)) {
        return {
          ok: false,
          family,
          reason:
            `${name} is a video this machine cannot decode. MP4 and WebM are read here as evenly spaced still frames; export to one of those, or send the frames yourself as pictures.`,
        }
      }
      if (!capabilities.vision && !capabilities.bridge) {
        return {
          ok: false,
          family,
          reason:
            `${name} would be read as still frames, but the provider you chose cannot see and no verified vision model is installed to describe them. Choose a model that can see.`,
        }
      }
      return { ok: true, route: 'video-frames', family }
    }

    case 'audio':
      // No provider is claimed to listen, and no local transcription model is
      // installed or invented. The honest answer names what is missing rather
      // than pretending the file was heard.
      return {
        ok: false,
        family,
        reason:
          `${name} is audio. Nothing on this machine transcribes it, and the provider you chose was not verified to listen — so it was not sent, and no part of it was read. Dictation (the microphone in the composer) writes your own words as text instead.`,
      }

    case 'pdf':
      return {
        ok: false,
        family,
        reason:
          `${name} is a PDF. Its text is not parsed here, and guessing at it would mean inventing contents — so nothing was read. Export it as text or Markdown, or paste the part you mean.`,
      }

    case 'office':
      return {
        ok: false,
        family,
        reason:
          `${name} is an Office document. Its contents are compressed inside the file, so reading the raw bytes would produce noise, not your words — nothing was read. Export it as text, CSV or Markdown, or paste the part you mean.`,
      }

    case 'archive':
      return {
        ok: false,
        family,
        reason:
          `${name} is an archive. Unpacking it would run whatever is inside, so it is not opened. Unpack it yourself and drop the file you mean.`,
      }

    case 'text':
      return { ok: true, route: 'text', family }

    default:
      return {
        ok: false,
        family,
        reason:
          `${name} is not a format this app can read. Text, code, pictures and MP4/WebM video are; if this holds words, export them as text and drop that.`,
      }
  }
}

/**
 * Base64 bytes back into a File, so a re-encoded picture can travel the exact
 * same path as one the person dropped — including the size checks that apply to
 * every other picture. A second, looser path for converted files would be a
 * place for the caps to be quietly skipped.
 */
export function base64ToFile(base64: string, name: string, mime = 'image/png'): File {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], name, { type: mime })
}

/** True when a picture is worth re-encoding rather than refusing. */
export function isConvertibleImage(name: string, mime: string): boolean {
  if (ENGINE_IMAGE_MIME.includes(mime as (typeof ENGINE_IMAGE_MIME)[number])) return false
  return fileFamily(name, mime) === 'image' && !UNREADABLE_IMAGE.test(name)
}

/**
 * Re-encode a picture Chromium can decode into PNG, on this machine.
 *
 * This is the whole reason gif, bmp, svg, avif and ico can be accepted at all:
 * the engine's wire carries png, jpeg and webp, and a canvas is already here.
 * Nothing is uploaded to do it.
 *
 * The returned base64 has no `data:` prefix, matching how the rest of the app
 * stores picture bytes.
 */
export async function reencodeToPng(
  file: File,
  scope: {
    createImageBitmap?: (source: Blob) => Promise<{ width: number; height: number; close?: () => void }>
    OffscreenCanvas?: new (width: number, height: number) => {
      getContext(type: '2d'): { drawImage(image: unknown, x: number, y: number): void } | null
      convertToBlob?(options?: { type?: string }): Promise<Blob>
    }
    document?: { createElement(tag: 'img'): HTMLImageElement }
  } = globalThis as never,
): Promise<string> {
  const bytes = await file.arrayBuffer()

  // The modern path: decode off the main thread, draw, take the PNG.
  if (typeof scope.createImageBitmap === 'function' && scope.OffscreenCanvas) {
    const bitmap = await scope.createImageBitmap(new Blob([bytes], { type: file.type || 'image/png' }))
    try {
      const canvas = new scope.OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no drawing surface')
      context.drawImage(bitmap, 0, 0)
      const blob = canvas.convertToBlob
        ? await canvas.convertToBlob({ type: 'image/png' })
        : new Blob([bytes], { type: 'image/png' })
      return await blobToBase64(blob)
    } finally {
      bitmap.close?.()
    }
  }

  // The fallback, for a renderer with no OffscreenCanvas: a real <img> element.
  const url = URL.createObjectURL(new Blob([bytes], { type: file.type || 'image/png' }))
  try {
    const image = await loadIntoImage(url, scope)
    return await drawImageToPng(image)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Blob bytes as base64, with no `data:` prefix.
 *
 * `arrayBuffer()` rather than FileReader: it exists in the renderer and in Node
 * alike, so this module is testable without a DOM standing in for one. The
 * chunked join is the same reason a large download is assembled with
 * Buffer.concat rather than a spread — spreading a big buffer blows the stack.
 */
const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const CHUNK = 0x8000
  let binary = ''
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  }
  return btoa(binary)
}

const loadIntoImage = (
  url: string,
  scope: { document?: { createElement(tag: 'img'): HTMLImageElement } },
): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    // Both shapes are narrowed to the one signature this needs: createElement
    // on a real document returns HTMLElement for a string tag, and the
    // injected scope already promises an HTMLImageElement.
    const owner: { createElement(tag: 'img'): HTMLImageElement } | undefined =
      scope.document ??
      (globalThis.document
        ? { createElement: (tag: 'img') => globalThis.document.createElement(tag) as HTMLImageElement }
        : undefined)
    if (!owner) {
      reject(new Error('This window cannot decode pictures.'))
      return
    }
    const image = owner.createElement('img')
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('This picture could not be decoded on this machine.'))
    image.src = url
  })

const drawImageToPng = async (image: HTMLImageElement): Promise<string> => {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This window has no drawing surface for pictures.')
  context.drawImage(image, 0, 0)
  return await blobToBase64(await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The picture could not be re-encoded.'))), 'image/png')
  }))
}
