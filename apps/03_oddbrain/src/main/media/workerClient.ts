import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { MediaRange, MediaResult } from '../../shared/lib/mediaBridge'
export function decodeInWorker(name: string, bytes: Uint8Array, signal: AbortSignal, range?: MediaRange): Promise<MediaResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(Error('Cancelled.')); return }
    const worker = new Worker(join(__dirname, 'media-worker.js'), { workerData: { name, bytes, range }, resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 } })
    let settled = false
    const finish = (error?: Error, result?: MediaResult): void => {
      if (settled) return; settled = true
      clearTimeout(timer); signal.removeEventListener('abort', cancel); void worker.terminate()
      if (error) reject(error); else resolve(result!)
    }
    const cancel = (): void => finish(Error('Cancelled.'))
    const timer = setTimeout(() => finish(Error('Document decoding exceeded 30 seconds; no content was sent to a provider.')), 30_000)
    signal.addEventListener('abort', cancel, { once: true })
    worker.once('message', result => finish(undefined, result))
    worker.once('error', error => finish(error))
    worker.once('exit', code => { if (!settled) finish(Error(`Document decoder exited (${code}). The file may be corrupt or exceed decoder limits.`)) })
  })
}
