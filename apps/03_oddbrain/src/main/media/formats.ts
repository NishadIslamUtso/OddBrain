/** Signature checks prevent playlists or HTML disguised as media reaching a decoder/provider. */
export function mediaKind(bytes: Uint8Array): { kind: 'image' | 'audio' | 'video' | 'document'; mime: string } {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (start: number, length: number): string => b.subarray(start, start + length).toString('ascii')
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { kind: 'image', mime: 'image/png' }
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return { kind: 'image', mime: 'image/jpeg' }
  if (/GIF8[79]a/.test(ascii(0, 6))) return { kind: 'image', mime: 'image/gif' }
  if (ascii(0, 2) === 'BM') return { kind: 'image', mime: 'image/bmp' }
  if (b.subarray(0, 4).equals(Buffer.from([73,73,42,0])) || b.subarray(0, 4).equals(Buffer.from([77,77,0,42]))) return { kind: 'image', mime: 'image/tiff' }
  if (ascii(0, 4) === 'RIFF') {
    if (ascii(8, 4) === 'WEBP') return { kind: 'image', mime: 'image/webp' }
    if (ascii(8, 4) === 'WAVE') return { kind: 'audio', mime: 'audio/wav' }
    if (ascii(8, 4) === 'AVI ') return { kind: 'video', mime: 'video/x-msvideo' }
  }
  if (ascii(4, 4) === 'ftyp') return /avif|avis|heic|heix|mif1/.test(ascii(8, 24)) ? { kind: 'image', mime: /avif|avis/.test(ascii(8, 24)) ? 'image/avif' : 'image/heic' } : { kind: 'video', mime: 'video/mp4' }
  if (b.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) return { kind: 'video', mime: 'video/webm' }
  if (ascii(0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg' }
  if (ascii(0, 4) === 'fLaC') return { kind: 'audio', mime: 'audio/flac' }
  if (ascii(0, 3) === 'ID3' || b[0] === 255 && (b[1] & 0xe0) === 0xe0) return { kind: 'audio', mime: (b[1] & 0xf6) === 0xf0 ? 'audio/aac' : 'audio/mpeg' }
  return { kind: 'document', mime: ascii(0, 5) === '%PDF-' ? 'application/pdf' : 'application/octet-stream' }
}
