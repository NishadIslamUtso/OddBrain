/** Read a Fetch response without ever buffering more than the caller allows. */
export async function boundedResponse(
  response: Response,
  max = 2_000_000,
  message = 'Response exceeds the size limit.',
): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => undefined)
    throw Error(message)
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > max) throw Error(message)
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    try { reader.releaseLock() } catch { /* already released/closed */ }
  }
  return Buffer.concat(chunks).toString('utf8')
}
