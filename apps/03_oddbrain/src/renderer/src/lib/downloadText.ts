/** Explicit local download; never sends the text to a provider. */
export function downloadText(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100) || 'conversation.md'
  document.body.append(link)
  try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
