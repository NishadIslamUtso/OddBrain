import { isDeepStrictEqual } from 'node:util'
import { configBytes, commitConfigs, preserveConfig } from './configTransaction'
import { normalizeBoard, type SessionsBoard } from '../../shared/lib/sessionsBoard'
/** Strict disk boundary: malformed/unsupported data is not an empty board.
 * Compare-and-save is serialized by this main process, not a cross-process lock. */
export function createSessionBoardStore(file: string) {
  const checked = (value: unknown): SessionsBoard => {
    const board = normalizeBoard(value)
    if (!isDeepStrictEqual(value, board)) throw Error('Unsupported session-board data. Its original has not been changed.')
    return board
  }
  const read = (): SessionsBoard => {
    const bytes = configBytes(file)
    return bytes === null ? { continuing: {}, done: [] } : checked(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  }
  return {
    read,
    save(value: unknown, expected: unknown): void {
      const next = checked(value), previous = checked(expected), current = read()
      if (!isDeepStrictEqual(current, previous)) throw Error('The board changed in another view. Refresh before saving; nothing was replaced.')
      const text = JSON.stringify(next)
      if (Buffer.byteLength(text) > 2_000_000) throw Error('The board exceeds its save limit. Nothing was removed.')
      const original = configBytes(file)
      if (original) preserveConfig(file, original)
      commitConfigs([{ path: file, text }])
    },
  }
}
