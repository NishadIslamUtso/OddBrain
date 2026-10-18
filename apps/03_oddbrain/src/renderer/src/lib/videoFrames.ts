import { framePoints } from '../../../shared/lib/media'
/** Browser-preview fallback. Still frames only; no claim to have heard audio. */
export async function extractFrames(file: File, count = 3): Promise<File[]> {
  if (file.size > 50 * 1024 * 1024) throw Error(`${file.name}: video exceeds the 50 MB limit.`)
  const url = URL.createObjectURL(file), video = document.createElement('video')
  const wait = (event: 'loadedmetadata' | 'seeked', begin: () => void): Promise<void> => new Promise((resolve, reject) => {
    const clean = (): void => { clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener('error', fail) }
    const done = (): void => { clean(); resolve() }
    const fail = (): void => { clean(); reject(Error(`${file.name}: decoding failed; the format may be unsupported, encrypted or corrupt.`)) }
    const timer = setTimeout(() => { clean(); reject(Error(`${file.name}: video ${event === 'seeked' ? 'seek' : 'decode'} timed out.`)) }, 10_000)
    video.addEventListener(event, done, { once: true }); video.addEventListener('error', fail, { once: true }); begin()
  })
  try {
    video.muted = true; video.preload = 'metadata'
    await wait('loadedmetadata', () => { video.src = url })
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.videoWidth * video.videoHeight > 40_000_000) throw Error(`${file.name}: invalid length or video larger than 40 megapixels.`)
    const points = framePoints(video.duration, Math.max(1, Math.min(3, count)))
    const ratio = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(video.videoWidth * ratio)); canvas.height = Math.max(1, Math.round(video.videoHeight * ratio))
    const pen = canvas.getContext('2d'); if (!pen) throw Error('Canvas video decoding is unavailable.')
    const shots: File[] = []
    for (let index = 0; index < points.length; index++) {
      await wait('seeked', () => { video.currentTime = points[index] })
      pen.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85))
      if (!blob || blob.size > 2 * 1024 * 1024) throw Error('A video frame could not be encoded within the image limit.')
      shots.push(new File([blob], `${file.name}-at-${points[index].toFixed(1)}s.jpg`, { type: 'image/jpeg' }))
    }
    return shots
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
}
