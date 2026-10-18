/**
 * A minimal ZIP writer, so an artifact can be exported as something you can
 * actually deploy. No dependencies: Node's zlib does the deflating and the
 * container is written by hand.
 *
 * Deliberately small and strict: entries are deflated, names are normalised and
 * rejected if they try to escape the archive, and the whole thing is built in
 * memory — an export never touches the disk.
 *
 * The renderer has its own copy of this writer for the download button (it
 * cannot call into the main process for bytes); this is the copy the vault's
 * /export-zip route uses.
 */
import { deflateRawSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

export function crc32(buffer: Uint8Array): number {
  let crc = -1
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

/** MS-DOS date/time, the only timestamp format the ZIP container understands. */
function dosStamp(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31)
  const day = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
  return { time, date: day }
}

/**
 * Reject anything that is not a plain relative path inside the archive:
 * `../`, absolute paths, drive letters, backslashes and control characters are
 * refused rather than silently rewritten.
 */
export function safeEntryName(name: unknown): string {
  const value = String(name ?? '')
  if (!value || value.length > 240) throw new Error('Invalid archive entry name.')
  if (/[\\]/.test(value) || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) {
    throw new Error('Archive entry names must use forward slashes and be relative.')
  }
  if (/[\u0000-\u001f]/.test(value)) throw new Error('Archive entry names must not contain control characters.')
  const segments = value.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Archive entry names must not contain empty or relative segments.')
  }
  return segments.join('/')
}

export function createZip(files: { name: string; content: string }[], when: Date = new Date()): Buffer {
  if (!Array.isArray(files) || !files.length) throw new Error('Nothing to archive.')
  if (files.length > 200) throw new Error('A maximum of 200 files can be archived at once.')
  const { time, date } = dosStamp(when)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(safeEntryName(file.name), 'utf8')
    const raw = Buffer.from(typeof file.content === 'string' ? file.content : String(file.content ?? ''), 'utf8')
    const compressed = deflateRawSync(raw, { level: 9 })
    const useDeflate = compressed.length < raw.length
    const payload = useDeflate ? compressed : raw
    const crc = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(useDeflate ? 8 : 0, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(useDeflate ? 8 : 0, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + payload.length
  }

  const centralBuffer = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, centralBuffer, end])
}
