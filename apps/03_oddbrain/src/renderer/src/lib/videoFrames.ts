/**
 * Video, as the engine can read it: evenly spaced still frames.
 *
 * No engine takes a video file on its wire; every engine reads pictures.
 * So a clip is decoded by the window's own player onto a canvas and sent as
 * its story in stills. The seek points are pure (`framePoints` in shared
 * media) and tested; this piece is the browser work around them.
 */
import { framePoints } from '../../../shared/lib/media'

export async function extractFrames(file: File, count = 4): Promise<File[]> {
  if (file.size > 64 * 1024 ** 2) throw Error(`${file.name}: video limit is 64 MB.`)
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'metadata'
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error(`${file.name}: video metadata timed out.`)), 10000)
      video.onloadedmetadata = () => { clearTimeout(timer); resolve() }
      video.onerror = () => { clearTimeout(timer); reject(new Error(`${file.name}: this window could not open the video.`)) }
      video.src = url
    })
    const points = framePoints(video.duration, count)
    if (!points.length) throw new Error(`${file.name}: the video has no readable length.`)
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1536 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const pen = canvas.getContext('2d')
    if (!pen) throw Error(`${file.name}: frame decoding is unavailable.`)
    const shots: File[] = []
    for (let index = 0; index < points.length; index += 1) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`${file.name}: frame decoding timed out.`)), 10000)
        video.onseeked = () => { clearTimeout(timer); resolve() }
        video.onerror = () => { clearTimeout(timer); reject(Error(`${file.name}: unreadable video frame.`)) }
        video.currentTime = points[index]
      })
      pen?.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (blob) {
        shots.push(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-frame-${index + 1}-at-${points[index].toFixed(2)}s.png`, { type: 'image/png' }))
      }
    }
    if (!shots.length) throw new Error(`${file.name}: no frame could be read from it.`)
    return shots
  } finally {
    URL.revokeObjectURL(url)
  }
}
