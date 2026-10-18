const MAX_DOCUMENT_BYTES = 8 * 1024 ** 2
const MAX_XML_BYTES = 4 * 1024 ** 2
const MAX_EXPANDED_BYTES = 32 * 1024 ** 2

/** Read only bounded XML entries. Nothing is extracted, executed or fetched. */
async function officeXml(file: File): Promise<Map<string, string>> {
  if (file.size > MAX_DOCUMENT_BYTES) throw Error(`${file.name}: document limit is 8 MB.`)
  const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  if (end < 0) throw Error('Not a readable Office/OpenDocument archive. Encrypted documents are not supported.')
  const count = view.getUint16(end + 10, true)
  if (count > 512) throw Error('Document contains too many archive entries.')
  let offset = view.getUint32(end + 16, true), total = 0
  const result = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw Error('Damaged document directory.')
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true)
    const size = view.getUint32(offset + 20, true), expanded = view.getUint32(offset + 24, true)
    const names = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + names))
    total += expanded
    if (total > MAX_EXPANDED_BYTES) throw Error('Document exceeds the expanded-size limit.')
    if (flags & 1) throw Error('Encrypted documents are not supported.')
    offset += 46 + names + extra + comment
    // Read only the text-bearing parts, not embedded objects, macros or links.
    if (!/^(?:word\/document\.xml|content\.xml|ppt\/slides\/slide\d+\.xml|xl\/(?:sharedStrings\.xml|worksheets\/sheet\d+\.xml))$/.test(name)) continue
    if (expanded > MAX_XML_BYTES || local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw Error('Document text is oversized or damaged.')
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    if (start + size > bytes.length) throw Error('Truncated document entry.')
    const raw = bytes.slice(start, start + size)
    let content: Uint8Array
    if (method === 0) content = raw
    else if (method === 8) {
      const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
      const chunks: Uint8Array[] = []; let got = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          got += value.byteLength
          if (got > MAX_XML_BYTES || got > expanded) throw Error('Document expands beyond its declared size.')
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => undefined) }
      content = new Uint8Array(got); let position = 0
      for (const chunk of chunks) { content.set(chunk, position); position += chunk.length }
    } else throw Error('Unsupported document compression.')
    if (content.length !== expanded) throw Error('Document entry size does not match its declaration.')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(content)
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('Document XML declarations are not allowed.')
    if (result.has(name)) throw Error('Duplicate document text entry.')
    result.set(name, text)
  }
  return result
}
function xml(source: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw Error('The document contains damaged XML.')
  return doc
}
function elements(doc: Document | Element, name: string): Element[] { return Array.from(doc.getElementsByTagNameNS('*', name)) }
export function officeText(parts: Map<string, string>, extension: string): string {
  if (extension === 'xlsx') {
    const shared = parts.get('xl/sharedStrings.xml')
    const strings = shared ? elements(xml(shared), 'si').map(el => elements(el, 't').map(t => t.textContent || '').join('')) : []
    return [...parts].filter(([name]) => /^xl\/worksheets\//.test(name)).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([name, source]) => `${name}\n` + elements(xml(source), 'row').map(row => elements(row, 'c').map(cell => {
      const value = elements(cell, 'v')[0]?.textContent || ''
      const text = cell.getAttribute('t') === 's' ? strings[Number(value)] || '' : cell.getAttribute('t') === 'inlineStr' ? elements(cell, 't').map(t => t.textContent || '').join('') : value
      return `${cell.getAttribute('r') || ''}: ${text}`
    }).join('\t')).join('\n')).join('\n\n')
  }
  const selected = [...parts].filter(([name]) => extension === 'docx' ? name === 'word/document.xml' : extension === 'pptx' ? name.startsWith('ppt/slides/') : name === 'content.xml').sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  return selected.map(([name, source]) => {
    const doc = xml(source)
    const paragraphs = elements(doc, 'p')
    return (extension === 'pptx' ? `${name}\n` : '') + paragraphs.map(p => extension === 'odt' ? p.textContent || '' : elements(p, 't').map(t => t.textContent || '').join('')).join('\n')
  }).join('\n\n')
}
export async function readDocumentText(file: File): Promise<File> {
  const extension = file.name.split('.').at(-1)?.toLowerCase() || ''
  const text = officeText(await officeXml(file), extension).trim()
  if (!text) throw Error(`${file.name}: no readable document text. Embedded images, macros and audio were not decoded.`)
  return new File([text], `${file.name}.txt`, { type: 'text/plain' })
}
