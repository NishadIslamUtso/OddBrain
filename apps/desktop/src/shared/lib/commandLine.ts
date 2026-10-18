/**
 * A command array as a human types it. The pieces are spawned without a
 * shell (the array IS the safety rule), but the card shows the command and
 * copies it for the owner's own terminal — and a path with spaces in it,
 * unquoted, is a trap: the real machine's username is three words, and the
 * copied line broke on it. Quote any piece that carries whitespace.
 */
export function displayCommandLine(command: readonly string[]): string {
  return command
    .map((piece) =>
      /[\s"]/.test(piece) ? `"${piece.replace(/"/g, '')}"` : piece,
    )
    .join(' ')
}
