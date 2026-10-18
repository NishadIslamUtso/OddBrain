/**
 * Video, as the selected engine can read it: evenly spaced still frames.
 *
 * Video codecs and audio tracks vary between engines. The app decodes a bounded
 * clip in its sandboxed renderer and sends only selected stills; it does not
 * execute embedded scripts or silently move the file to another provider.
 */
import { framePoints } from '../../../shared/lib/media'

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_VIDEO_DURATION_SECONDS = 10 * 60
export const MAX_VIDEO_DIMENSION = 4096
export const MAX_FRAME_WIDTH = 1280
export const MAX_FRAME_HEIGHT = 720
const DECODE_TIMEOUT_MS = 8_000

function waitFor<T>(operation: Promise<T>, milliseconds: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    operation,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${name}: video decoding took too long. Nothing was sent.`)), milliseconds)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export async function extractFrames(file: File, count = 4): Promise<File[]> {
  if (!/^video\/(?:mp4|webm)$/i.test(file.type)) {
    throw new Error(`${file.name}: only MP4 and WebM video are supported. Nothing was sent.`)
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(`${file.name}: videos are limited to 100 MB for safe local decoding. Nothing was sent.`)
  }
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  video.src = url
  try {
    await waitFor(
      new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(
          new Error(`${file.name}: this clip could not be decoded. It may be corrupt, use an unsupported codec, or be DRM-protected. Nothing was sent.`)
        )
      }),
      DECODE_TIMEOUT_MS,
      file.name,
    )

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error(`${file.name}: the clip has no readable duration. Nothing was sent.`)
    }
    if (video.duration > MAX_VIDEO_DURATION_SECONDS) {
      throw new Error(`${file.name}: videos are limited to 10 minutes for safe local decoding. Nothing was sent.`)
    }
    if (!video.videoWidth || !video.videoHeight || video.videoWidth > MAX_VIDEO_DIMENSION || video.videoHeight > MAX_VIDEO_DIMENSION) {
      throw new Error(`${file.name}: the clip has invalid or unusually large frame dimensions. Nothing was sent.`)
    }
    const points = framePoints(video.duration, Math.min(Math.max(count, 1), 4))
    if (!points.length) throw new Error(`${file.name}: the video has no readable frames. Nothing was sent.`)

    const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth, MAX_FRAME_HEIGHT / video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const pen = canvas.getContext('2d', { alpha: false })
    if (!pen) throw new Error(`${file.name}: this window cannot decode video frames. Nothing was sent.`)

    const shots: File[] = []
    for (let index = 0; index < points.length; index += 1) {
      const seek = new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve()
        video.onerror = () => reject(new Error(`${file.name}: a frame could not be decoded. The clip may be corrupt or DRM-protected. Nothing was sent.`))
        video.currentTime = points[index]
      })
      await waitFor(seek, DECODE_TIMEOUT_MS, file.name)
      try {
        pen.drawImage(video, 0, 0, canvas.width, canvas.height)
      } catch {
        throw new Error(`${file.name}: a frame could not be decoded. The clip may be corrupt or DRM-protected. Nothing was sent.`)
      }
      const blob = await waitFor(
        new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(result => result ? resolve(result) : reject(new Error(`${file.name}: a frame could not be encoded. Nothing was sent.`)), 'image/jpeg', 0.82)
        }),
        DECODE_TIMEOUT_MS,
        file.name,
      )
      if (blob.size > 2 * 1024 * 1024) {
        throw new Error(`${file.name}: a sampled frame is larger than the 2 MB image limit. Nothing was sent.`)
      }
      shots.push(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-frame-${index + 1}.jpg`, { type: 'image/jpeg' }))
    }
    if (!shots.length) throw new Error(`${file.name}: no frame could be read from it. Nothing was sent.`)
    return shots
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
