import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export type DownloadReply = { ok: boolean; status?: number; headers?: { get(name: string): string | null }; arrayBuffer?: () => Promise<ArrayBuffer>; body?: unknown }

/** Network bodies stream to disk. The buffer fallback exists for injected test transports. */
export async function downloadToFile(reply: DownloadReply, target: string, cap: number, onProgress: (got: number, total: number | null) => void): Promise<{ bytes: number; sha256: string }> {
  const declared = Number(reply.headers?.get('content-length') || 0)
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > cap) throw Error('The download exceeds the size cap or has an invalid length.')
  const hash = createHash('sha256')
  let got = 0, lastTick = 0
  try {
    const body = reply.body as AsyncIterable<Uint8Array> | undefined
    const source = body && typeof body[Symbol.asyncIterator] === 'function'
      ? Readable.from(body)
      : Readable.from([new Uint8Array(await reply.arrayBuffer?.() || new ArrayBuffer(0))])
    const check = new Transform({ transform(chunk: Buffer, _encoding, done) {
      got += chunk.length
      if (got > cap) { done(Error('The download exceeded the size cap. Nothing was installed.')); return }
      hash.update(chunk)
      if (Date.now() - lastTick > 100) { lastTick = Date.now(); onProgress(got, declared || null) }
      done(null, chunk)
    } })
    await pipeline(source, check, createWriteStream(target, { flags: 'wx' }))
    if (!got) throw Error('The endpoint sent nothing. Nothing was installed.')
    if (declared && got !== declared) throw Error('The download is incomplete. Nothing was installed.')
    onProgress(got, declared || got)
    return { bytes: got, sha256: hash.digest('hex') }
  } catch (error) {
    await rm(target, { force: true }).catch(() => undefined)
    throw error
  }
}
