/**
 * Citation extraction — source chips under a reply.
 * Only links that actually appear in the answer text are shown; nothing is
 * invented and no search is performed.
 */
const LINK = /\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/g

export function extractCitations(text = '') {
  const seen = new Set()
  const out = []
  for (const [, label, url] of String(text).matchAll(LINK)) {
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ id: `${out.length}-${url}`, url, label: label.trim() })
  }
  return out.slice(0, 8)
}
