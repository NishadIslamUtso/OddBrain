import { framePoints, MAX_ENGINE_IMAGE_BYTES, MAX_MEDIA_VIDEO_BYTES } from '@shared/lib/media'

/** A clip is not sent raw to an engine that has no video wire. These are
 * time-stamped visual samples, never a claim to have heard its soundtrack. */
export async function extractFrames(file: File, count = 4): Promise<File[]> {
  if (file.size > MAX_MEDIA_VIDEO_BYTES) throw new Error(`${file.name}: video is limited to 80 MB. Nothing was read.`)
  if (count < 1 || count > 4) throw new Error('A clip needs room for one to four frames. Remove another attachment first.')
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  const waitFor = (event: 'loadedmetadata' | 'seeked', timeout = 10000): Promise<void> => new Promise((resolve, reject) => {
    const end = (): void => { video.removeEventListener(event, done); video.removeEventListener('error', failed); clearTimeout(timer) }
    const done = (): void => { end(); resolve() }
    const failed = (): void => { end(); reject(new Error(`${file.name}: the video decoder refused this file. No frames were attached.`)) }
    const timer = setTimeout(() => { end(); reject(new Error(`${file.name}: decoding timed out. No frames were attached.`)) }, timeout)
    video.addEventListener(event, done, { once: true })
    video.addEventListener('error', failed, { once: true })
  })
  try {
    const metadata = waitFor('loadedmetadata')
    video.src = url
    video.load()
    await metadata
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 600) {
      throw new Error(`${file.name}: only clips with a readable duration up to ten minutes can be sampled. Nothing was attached.`)
    }
    if (!video.videoWidth || !video.videoHeight || video.videoWidth * video.videoHeight > 25_000_000) {
      throw new Error(`${file.name}: video dimensions are unreadable or too large. Nothing was attached.`)
    }
    const points = framePoints(video.duration, count)
    const canvas = document.createElement('canvas')
    const scale = Math.min(960 / Math.max(video.videoWidth, video.videoHeight), 1)
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const pen = canvas.getContext('2d')
    if (!pen) throw new Error('This window has no video canvas available.')
    const shots: File[] = []
    for (let index = 0; index < points.length; index++) {
      const seek = waitFor('seeked')
      video.currentTime = points[index]
      await seek
      pen.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.78))
      if (!blob || !blob.size || blob.size > MAX_ENGINE_IMAGE_BYTES) {
        throw new Error(`${file.name}: a frame could not be encoded under 2 MB. No frames were attached.`)
      }
      shots.push(new File([blob], `${file.name} [frame ${index + 1}/${points.length} at ${points[index].toFixed(1)}s].jpg`, { type: 'image/jpeg' }))
    }
    return shots
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
