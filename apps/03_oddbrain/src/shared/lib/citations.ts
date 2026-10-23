/**
 * Citation extraction — source chips under a reply.
 * Only links that actually appear in the answer text are shown; nothing is
 * invented and no search is performed.
 */
import type { Citation } from '../types'

const LINK = /\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/g

export type { Citation }

export function extractCitations(text = ''): Citation[] {
  const seen = new Set<string>()
  const out: Citation[] = []
  for (const [, label, url] of String(text).matchAll(LINK)) {
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ id: `${out.length}-${url}`, url, label: label.trim() })
  }
  return out
}
