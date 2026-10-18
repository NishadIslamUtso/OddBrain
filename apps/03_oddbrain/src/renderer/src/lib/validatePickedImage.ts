import { imageSize } from 'image-size'

/** Header limits precede native decoding, so a tiny compressed upload cannot
 * allocate an unbounded bitmap. Decode errors never become successful uploads. */
export async function validatePickedImage(file: File, signal: AbortSignal): Promise<void> {
  if (file.size > 2 * 1024 ** 2) throw Error(`${file.name}: maximum native image size is 2 MB. Use the explicit media processing route instead.`)
  signal.throwIfAborted()
  const dimensions = imageSize(new Uint8Array(await file.arrayBuffer()))
  if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 32_000_000) throw Error(`${file.name}: image exceeds the 32-megapixel limit or has unreadable dimensions.`)
  if (typeof createImageBitmap !== 'function') throw Error('This runtime cannot verify native image decoding. Use the selected media decoder instead.')
  const bitmap = await createImageBitmap(file)
  try {
    signal.throwIfAborted()
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 32_000_000) throw Error('Decoded image exceeds the 32-megapixel limit.')
  } finally { bitmap.close() }
}
