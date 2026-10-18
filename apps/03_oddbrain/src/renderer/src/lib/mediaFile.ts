import { MAX_MEDIA_AUDIO_BYTES } from '@shared/lib/media'

/** Encode only after a person chooses a provider. File bytes stay in the
 * renderer until that click; no base64 copy is held in persistent state. */
export async function audioForUpload(file: File): Promise<string> {
  if (!file.size || file.size > MAX_MEDIA_AUDIO_BYTES) {
    throw new Error(`${file.name}: transcription accepts files up to 20 MB. No content was uploaded.`)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 16 * 1024) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16 * 1024)))
  }
  return btoa(chunks.join(''))
}
