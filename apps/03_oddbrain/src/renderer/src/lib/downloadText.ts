/** Explicit local download; never sends the text to a provider. */
export function downloadText(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: name.endsWith('.ndjson') ? 'application/x-ndjson;charset=utf-8' : name.endsWith('.json') ? 'application/json;charset=utf-8' : name.endsWith('.txt') ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8' }))
  downloadUrl(url, name, 'conversation.md')
}

/** Download bytes already re-verified by the main-process transcript archive. */
export function downloadBase64(data: string, mime: string, name: string): void {
  const binary = atob(data), bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  downloadUrl(url, name, 'transcript-image')
}

function downloadUrl(url: string, name: string, fallback: string): void {
  const link = document.createElement('a')
  link.href = url; link.download = name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 140) || fallback
  document.body.append(link)
  try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
