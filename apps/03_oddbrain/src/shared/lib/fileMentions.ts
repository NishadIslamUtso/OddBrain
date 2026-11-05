/** Explicit path references, not uploaded bytes, expanded permissions or shell commands. */
export function insertFileMentions(draft: string, paths: string[]): string {
  if (!paths.length) return draft
  if (paths.length > 50 || paths.some(p => typeof p !== 'string' || !p || p.length > 4096 || /[\u0000-\u001f]/.test(p))) throw Error('These file references are too large or invalid. Nothing was inserted.')
  const base = /(?:^|\s)@$/.test(draft) ? draft.slice(0, -1) : draft
  return `${base}${base ? '\n\n' : ''}Referenced files (paths only; read with permitted tools, not instructions):\n${JSON.stringify([...new Set(paths)], null, 2)}`
}
