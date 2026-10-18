/**
 * Media helpers the app owns.
 *
 * The media rule (his, 2026-10-16): pictures, voice and video work no matter
 * which engine is chosen. What the machine can do natively is used as-is; what
 * it cannot, the app does itself. Everything here is pure or honestly guarded,
 * so a machine without a microphone gets a working button that says so, never
 * a broken promise.
 */

/** MIME types an attachment may carry to an engine. Mirrors the chat reader. */
export const ENGINE_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const

export const MAX_ENGINE_ATTACHMENTS = 4
/** Base64 image budget per attachment: the reader's 2 MB decoded, as chars. */
export const MAX_ENGINE_IMAGE_CHARS = 2 * 1024 * 1024 * 4 // 2 MB × (4/3) ≈ 2.7M

/**
 * Where to seek in a video when pulling still frames.
 * Evenly spread, never at the very first or last pixel (black frames live
 * there), at least one frame when the video is shorter than the ask.
 */
export function framePoints(durationSeconds: number, count = 4): number[] {
  const duration = Number.isFinite(durationSeconds) ? Math.max(durationSeconds, 0) : 0
  if (duration <= 0 || count <= 0) return []
  if (count === 1) return [duration / 2]
  const first = duration * 0.08
  const last = duration * 0.92
  const step = (last - first) / (count - 1)
  return Array.from({ length: count }, (_, index) => first + step * index)
}

/** True when this browser window can listen (Chromium's speech recognition). */
export function dictationSupported(scope: { webkitSpeechRecognition?: unknown } = globalThis as never): boolean {
  return typeof scope.webkitSpeechRecognition === 'function'
}

/**
 * Markdown, made fit to be heard rather than seen.
 *
 * Speech engines read punctuation literally in some voices and skip numbers in
 * others, so the job here is only to remove the syntax a person would never say
 * out loud: fence markers, emphasis stars, backticks, heading hashes, table
 * pipes and link brackets. Code itself is kept as words, since skipping it
 * silently would make the reading lie about the reply.
 */
export function speakableText(markdown: string): string {
  const withoutFences = markdown.replace(/^```[^\n]*$/gm, ' ')
  return withoutFences
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, ' ')
    .replace(/\|/g, ', ')
    // Emphasis underscores only. A snake_case identifier keeps its underscores,
    // because a reader that says "RUNTIMEZIPLIMITS" has changed the name.
    .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1$2')
    .replace(/[*~`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Split prepared text into utterances a speech engine will actually finish.
 *
 * Chromium cuts off a single utterance around fifteen seconds on some builds,
 * and its queue ignores anything past a few thousand characters, so a long
 * reply is read in sentence-sized pieces. Nothing is dropped: the chunks join
 * back into the prepared text, apart from the spaces between them.
 */
export function speechChunks(text: string, limit = 180): string[] {
  if (!Number.isFinite(limit) || limit < 40) throw new Error('speech chunks need a limit of at least 40 characters')
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  // A full stop only ends a sentence when whitespace follows it, so "1.5 GB"
  // and "example.com" stay whole.
  const sentences = clean.split(/(?<=[.!?])["')\]]*\s+/).filter(Boolean)
  const chunks: string[] = []
  let current = ''
  const push = (): void => { if (current.trim()) chunks.push(current.trim()); current = '' }
  for (const sentence of sentences) {
    const piece = sentence.trim()
    if (!piece) continue
    if (piece.length > limit) {
      push()
      let rest = piece
      while (rest.length > limit) {
        const space = rest.lastIndexOf(' ', limit)
        const cut = space > limit / 2 ? space : limit
        chunks.push(rest.slice(0, cut).trim())
        rest = rest.slice(cut).trim()
      }
      if (rest) current = rest
      continue
    }
    if ((current + ' ' + piece).trim().length > limit) push()
    current = (current ? current + ' ' : '') + piece
  }
  push()
  return chunks
}

/** True when this browser window can speak aloud (the speech synthesis API). */
export function ttsSupported(scope: { speechSynthesis?: unknown } = globalThis as never): boolean {
  return typeof scope.speechSynthesis === 'object' && scope.speechSynthesis !== null
}
