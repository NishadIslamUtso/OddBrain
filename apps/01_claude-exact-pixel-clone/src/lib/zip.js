/**
 * zip.js — a dependency-free ZIP writer (stored entries, no compression).
 *
 * The target machine has a slow connection and this app deliberately carries no
 * bundler, so exporting a deployable folder needs a writer that ships in the
 * repo rather than a package. "Stored" (method 0) is a valid ZIP; every unzip
 * tool and every static host reads it. Compression would need a DEFLATE
 * implementation for no benefit at these sizes (a single HTML file).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(bytes) {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS date/time pair used by the ZIP header. */
export function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const stamp = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time: time & 0xffff, date: Math.max(0, stamp) & 0xffff }
}

/** Names are stored as UTF-8; path separators must be forward slashes. */
export function safeEntryName(name) {
  const cleaned = String(name).replace(/\\/g, '/').replace(/^\/+/, '').split('/')
    .filter(segment => segment && segment !== '.' && segment !== '..')
    .join('/')
  if (!cleaned) throw new Error('A ZIP entry needs a usable file name.')
  return cleaned
}

/**
 * @param {{name: string, content: string|Uint8Array}[]} entries
 * @returns {Uint8Array} the complete archive
 */
export const MAX_ZIP_FILES = 200
export const MAX_ZIP_BYTES = 2_000_000

export function createZip(entries, clock = new Date()) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('Nothing to export: the archive would be empty.')
  // Same limits as the vault API route, so the in-browser path cannot be used
  // to build an archive the server would have refused.
  if (entries.length > MAX_ZIP_FILES) throw new Error(`Too many files: a deployable export is limited to ${MAX_ZIP_FILES} files.`)
  for (const entry of entries) {
    const size = typeof entry?.content === 'string' ? entry.content.length : entry?.content?.length || 0
    if (size > MAX_ZIP_BYTES) throw new Error('Each exported file is limited to 2 MB.')
  }
  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(clock)
  const files = entries.map(entry => {
    const name = encoder.encode(safeEntryName(entry.name))
    const data = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content
    if (!(data instanceof Uint8Array)) throw new Error(`Unsupported content for ${entry.name}.`)
    return { name, data, crc: crc32(data) }
  })
  const localSize = files.reduce((total, file) => total + 30 + file.name.length + file.data.length, 0)
  const centralSize = files.reduce((total, file) => total + 46 + file.name.length, 0)
  const buffer = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(buffer.buffer)
  let offset = 0
  const offsets = []
  for (const file of files) {
    offsets.push(offset)
    view.setUint32(offset, 0x04034b50, true)
    view.setUint16(offset + 4, 20, true) // version needed: 2.0
    view.setUint16(offset + 6, 0x0800, true) // UTF-8 file names
    view.setUint16(offset + 8, 0, true) // method 0: stored
    view.setUint16(offset + 10, time, true)
    view.setUint16(offset + 12, date, true)
    view.setUint32(offset + 14, file.crc, true)
    view.setUint32(offset + 18, file.data.length, true)
    view.setUint32(offset + 22, file.data.length, true)
    view.setUint16(offset + 26, file.name.length, true)
    view.setUint16(offset + 28, 0, true)
    buffer.set(file.name, offset + 30)
    buffer.set(file.data, offset + 30 + file.name.length)
    offset += 30 + file.name.length + file.data.length
  }
  const centralStart = offset
  files.forEach((file, index) => {
    view.setUint32(offset, 0x02014b50, true)
    view.setUint16(offset + 4, 20, true) // version made by
    view.setUint16(offset + 6, 20, true) // version needed
    view.setUint16(offset + 8, 0x0800, true)
    view.setUint16(offset + 10, 0, true)
    view.setUint16(offset + 12, time, true)
    view.setUint16(offset + 14, date, true)
    view.setUint32(offset + 16, file.crc, true)
    view.setUint32(offset + 20, file.data.length, true)
    view.setUint32(offset + 24, file.data.length, true)
    view.setUint16(offset + 28, file.name.length, true)
    view.setUint16(offset + 30, 0, true) // extra
    view.setUint16(offset + 32, 0, true) // comment
    view.setUint16(offset + 34, 0, true) // disk
    view.setUint16(offset + 36, 0, true) // internal attributes
    view.setUint32(offset + 38, 0, true) // external attributes
    view.setUint32(offset + 42, offsets[index], true)
    buffer.set(file.name, offset + 46)
    offset += 46 + file.name.length
  })
  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 4, 0, true)
  view.setUint16(offset + 6, 0, true)
  view.setUint16(offset + 8, files.length, true)
  view.setUint16(offset + 10, files.length, true)
  view.setUint32(offset + 12, offset - centralStart, true)
  view.setUint32(offset + 16, centralStart, true)
  view.setUint16(offset + 20, 0, true)
  return buffer
}

/** Turn an artifact title into a folder/file name that is safe on Windows. */
export function slugify(value, fallback = 'artifact') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback
}

/**
 * A static site that a host like Vercel or Netlify can serve with no build step:
 * the artifact itself, the config those hosts look for, and a short README.
 */
export function staticSiteEntries({ title, source, type, note = '' }) {
  const name = slugify(title)
  const html = type === 'svg'
    ? `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>\n<style>html,body{margin:0;min-height:100%;display:grid;place-items:center;background:#111;color:#eee;font:14px/1.6 system-ui,sans-serif}img{max-width:min(90vw,720px)}</style>\n</head>\n<body>\n${source}\n</body>\n</html>\n`
    : source
  return [
    { name: 'index.html', content: html },
    { name: 'README.md', content: `# ${title}\n\nA single-file ${type === 'svg' ? 'SVG' : 'HTML'} app exported from AI ASSistant.\n\n- \`index.html\` — the whole app, no build step, no dependencies.\n- \`vercel.json\` / \`netlify.toml\` — static hosting config; publish the folder as-is.\n\n## Deploy\n\nVercel: \`npx vercel deploy --prod\` in this folder.\nNetlify: \`npx netlify deploy --prod --dir .\`\n\nOr upload the folder to any static host. Because this document is self-contained,\nit makes no network requests of its own.\n${note ? `\n> ${note}\n` : ''}` },
    { name: 'vercel.json', content: `${JSON.stringify({ cleanUrls: true, headers: [{ source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] }] }, null, 2)}\n` },
    { name: 'netlify.toml', content: `# Static export — no build step.\n[build]\n  publish = "."\n\n[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Content-Type-Options = "nosniff"\n` },
    { name: '.gitignore', content: `node_modules/\n.DS_Store\n${name}-*.zip\n` },
  ]
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
}

export function downloadBytes(bytes, filename, mime = 'application/zip', notify = () => {}) {
  try {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return true
  } catch (error) {
    notify(`Download failed: ${error.message} You can copy the source instead.`)
    return false
  }
}
