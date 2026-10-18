import { MAX_ENGINE_IMAGE_BYTES } from '@shared/lib/media'

export const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|bmp|avif)$/i
const INPUT_LIMIT = 12 * 1024 * 1024

/** The window's own decoder, never a guessed MIME or an external service.
 * Animated pictures are only their first frame; the caller labels that fact. */
export async function prepareImage(file: File): Promise<{ file: File; note: string }> {
  if (!IMAGE_EXTENSIONS.test(file.name)) throw new Error(`${file.name}: this image format is not supported. SVG and HEIC are not treated as photographs.`)
  if (file.size > INPUT_LIMIT) throw new Error(`${file.name}: pictures must be under 12 MB before decoding.`)
  if (typeof createImageBitmap !== 'function') throw new Error(`${file.name}: this window has no decoder for that picture format.`)
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) }
  catch { throw new Error(`${file.name}: the image could not be decoded here. It may be damaged or unsupported.`) }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 25_000_000) {
      throw new Error(`${file.name}: the image dimensions are too large to decode safely.`)
    }
    if (/^image\/(?:png|jpeg|webp)$/.test(file.type) && file.size <= MAX_ENGINE_IMAGE_BYTES) {
      // The main process independently checks the signature and actual model.
      return { file, note: '' }
    }
    const canvas = document.createElement('canvas')
    const edge = Math.min(1280 / Math.max(bitmap.width, bitmap.height), 1)
    canvas.width = Math.max(1, Math.round(bitmap.width * edge))
    canvas.height = Math.max(1, Math.round(bitmap.height * edge))
    const pen = canvas.getContext('2d')
    if (!pen) throw new Error('The window has no image canvas available.')
    pen.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    let blob: Blob | null = null
    for (const quality of [0.86, 0.72, 0.56]) {
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= MAX_ENGINE_IMAGE_BYTES) break
    }
    if (!blob || !blob.size || blob.size > MAX_ENGINE_IMAGE_BYTES) {
      throw new Error(`${file.name}: the decoded picture is still over 2 MB. Resize it first; nothing was attached.`)
    }
    return {
      file: new File([blob], `${file.name} (converted).jpg`, { type: 'image/jpeg' }),
      note: /\.gif$/i.test(file.name) ? `${file.name}: only the first frame of this animation was attached as a JPEG.`
        : `${file.name}: decoded and resized as a JPEG for the chosen model.`,
    }
  } finally { bitmap.close() }
}
