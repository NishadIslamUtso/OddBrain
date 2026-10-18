/**
 * Pictures the chat can carry are png/jpeg/webp. Everything else the window
 * itself knows how to decode (gif, bmp, ico, svg, avif…) is re-encoded to
 * png on the spot. What this window cannot decode fails with the format
 * named — never a silent drop, never a fake attachment.
 */
export async function coerceImage(file: File): Promise<File> {
  if (/^image\/(?:png|jpeg|webp)$/.test(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no 2d context')
      context.drawImage(bitmap, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('png encode refused')
      const base = file.name.replace(/\.[^.]+$/, '') || file.name
      return new File([blob], `${base}.png`, { type: 'image/png' })
    } finally {
      bitmap.close()
    }
  } catch {
    const ext = /\.([A-Za-z0-9]+)$/.exec(file.name)?.[1] ?? (/^image\//.test(file.type) ? file.type.slice(6) : '')
    throw new Error(
      `${file.name}: this window has no decoder for ${ext ? `.${ext}` : 'this image format'}. Convert it to PNG or WebP and attach it again.`
    )
  }
}
