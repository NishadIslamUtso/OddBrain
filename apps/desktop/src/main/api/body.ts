import type { IncomingMessage } from 'node:http'

/**
 * Reading a request body with a hard limit.
 *
 * Two servers in this process take writes — the app's own API and the port the
 * browser extension posts to — and "too big" has to behave the same on both:
 * stop storing, answer 413 with a sentence, and never leave a half-read socket
 * behind. One implementation, so there is one behaviour to reason about.
 *
 * Over the limit the text is refused rather than buffered: a request that claims
 * to be enormous must not be able to fill this process's memory before anybody
 * decides what to do with it.
 */
export const BODY_LIMIT = 20 * 1024 * 1024

export function readBody(
  request: IncomingMessage,
  limit: number = BODY_LIMIT,
  message = 'That request is larger than the vault accepts (20 MB).'
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    request.on('data', (chunk: Buffer) => {
      received += chunk.length
      if (received > limit) {
        // Stop storing, and let the refusal be written: destroying the socket
        // here would turn an explainable 413 into a connection reset.
        reject(new Error(message))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}
