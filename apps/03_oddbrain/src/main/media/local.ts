import WordExtractor from 'word-extractor'
import * as spreadsheets from '@e965/xlsx'
import { imageSize } from 'image-size'
import { createCanvas, loadImage, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'
import { createWorker, type Worker } from 'tesseract.js'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { MAX_MEDIA_TEXT, type MediaInput } from '../../shared/lib/mediaProcessing'
const modules = createRequire(join(__dirname, 'package.json'))
const unpacked = (path: string): string => path.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')
const languagePath = (): string => unpacked(join(dirname(modules.resolve('@tesseract.js-data/eng/package.json')), '4.0.0'))

/** Local-only PDF and English OCR. No model, worker or language file is fetched. */
export async function extractLocal(input: MediaInput, options: { ocr: boolean; cache: string; signal: AbortSignal }): Promise<{ text: string; notes: string[] }> {
  options.signal.throwIfAborted()
  let worker: Worker | undefined
  let document: { destroy(): Promise<void> } | undefined
  const cancel = (): void => { void worker?.terminate().catch(() => undefined); void document?.destroy().catch(() => undefined) }
  options.signal.addEventListener('abort', cancel, { once: true })
  async function recognize(data: Buffer): Promise<string> {
    if (!options.ocr) throw Error('This file needs OCR. Enable on-device OCR in Settings > Models & API keys > Attachments & dictation, or explicitly use the selected media model.')
    options.signal.throwIfAborted()
    worker ??= await createWorker('eng', 1, { langPath: languagePath(), gzip: true, cacheMethod: 'none', cachePath: options.cache, workerPath: unpacked(modules.resolve('tesseract.js/src/worker-script/node/index.js')), corePath: unpacked(modules.resolve('tesseract.js-core/tesseract-core-lstm.wasm.js')) })
    options.signal.throwIfAborted()
    const result = await worker.recognize(data)
    options.signal.throwIfAborted()
    return result.data.text.trim()
  }
  try {
    if (/\.doc$/i.test(input.name)) {
      if (Buffer.from(input.data.subarray(0,8)).toString('hex')!=='d0cf11e0a1b11ae1') throw Error('Not a readable legacy Word document. Encrypted files require decryption first.')
      const doc=await new WordExtractor().extract(Buffer.from(input.data))
      const text=[doc.getBody(),doc.getFootnotes(),doc.getEndnotes(),doc.getHeaders(),doc.getAnnotations(),doc.getTextboxes()].filter(Boolean).join('\n\n')
      if(!text.trim()||text.length>MAX_MEDIA_TEXT)throw Error('The legacy Word document has no readable text or exceeds the text budget. Nothing was truncated.')
      return {text,notes:['Legacy Word text decoded locally in an isolated worker. Macros, embedded objects and images were not executed or described.']}
    }
    if (/\.(xls|xlsb|ods|fods)$/i.test(input.name)) {
      const book=spreadsheets.read(input.data,{type:'array',dense:true,cellFormula:false,cellHTML:false,cellStyles:false,bookVBA:false})
      if(book.SheetNames.length>100)throw Error('Spreadsheet exceeds 100 sheets. Split the file; no sheets were silently skipped.')
      const sections:string[]=[];let total=0
      for(const name of book.SheetNames){
        options.signal.throwIfAborted()
        const sheet=book.Sheets[name],range=sheet['!ref']?spreadsheets.utils.decode_range(sheet['!ref']):null
        if(range&&(range.e.r-range.s.r+1)*(range.e.c-range.s.c+1)>1_000_000)throw Error('Spreadsheet exceeds one million cells. Split the file; no rows were silently skipped.')
        const text=`[Sheet: ${name}]\n${spreadsheets.utils.sheet_to_csv(sheet)}`
        total+=text.length;if(total>MAX_MEDIA_TEXT)throw Error('Spreadsheet text exceeds 180,000 characters. Split the file; no text was truncated.')
        sections.push(text)
      }
      return {text:sections.join('\n\n'),notes:['Spreadsheet saved values decoded locally. Formulas, macros and external data connections were not executed or refreshed.']}
    }
    if (input.mime.startsWith('image/')) {
      // Decode locally, downscale before OCR; no SVG/HTML execution.
      const dimensions = imageSize(input.data)
      if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 32_000_000) throw Error('Image exceeds the 32-megapixel decode limit or has no readable dimensions.')
      const image = await loadImage(Buffer.from(input.data))
      if (!image.width || !image.height || image.width * image.height > 32_000_000) throw Error('Image exceeds the 32-megapixel decode limit.')
      const scale = Math.min(1, Math.sqrt(4_000_000 / (image.width * image.height)))
      const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)))
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      const text = await recognize(canvas.toBuffer('image/png'))
      if (!text) throw Error('No readable text was found. OCR is not an image description; use an explicitly selected vision model for that.')
      return { text, notes: ['On-device English OCR. Handwriting, layout and non-English text may be inaccurate; this is not a visual description.'] }
    }
    if (input.mime !== 'application/pdf') throw Error('This format has no on-device text decoder. Select a capable media model and explicitly allow its use; no data was sent elsewhere.')
    Object.assign(globalThis, { DOMMatrix, ImageData, Path2D })
    const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdf.getDocument({ data: new Uint8Array(input.data), useSystemFonts: true, disableFontFace: true, maxImageSize: 8_000_000, stopAtErrors: true })
    const abortLoad = (): void => { void task.destroy().catch(() => undefined) }
    options.signal.addEventListener('abort', abortLoad, { once: true })
    let doc
    try { doc = await task.promise } finally { options.signal.removeEventListener('abort', abortLoad) }
    document = task
    if (doc.numPages > 80) throw Error('PDF limit is 80 pages. Split the document; no pages were silently skipped.')
    const pages: string[] = []; let total = 0, ocrPages = 0
    for (let index = 1; index <= doc.numPages; index++) {
      options.signal.throwIfAborted()
      const page = await doc.getPage(index)
      const content = await page.getTextContent()
      let text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim()
      if (text.length < 20) {
        if (++ocrPages > 20) throw Error('Scanned-PDF limit is 20 OCR pages. Split the document; no pages were silently skipped.')
        const original = page.getViewport({ scale: 1 })
        const scale = Math.min(2, Math.sqrt(4_000_000 / (original.width * original.height)))
        const viewport = page.getViewport({ scale })
        const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)))
        const render = page.render({ canvas: canvas as never, canvasContext: canvas.getContext('2d') as never, viewport })
        const abortRender = (): void => render.cancel()
        options.signal.addEventListener('abort', abortRender, { once: true })
        try { await render.promise } finally { options.signal.removeEventListener('abort', abortRender) }
        text = await recognize(canvas.toBuffer('image/png'))
      }
      pages.push(`[Page ${index}]\n${text || '(No readable text on this page.)'}`)
      total += pages.at(-1)!.length
      if (total > MAX_MEDIA_TEXT) throw Error('Extracted text exceeds 180,000 characters. Split the document; no text was silently truncated.')
      page.cleanup()
    }
    return { text: pages.join('\n\n'), notes: [`PDF text layer extracted locally; ${ocrPages} textless/near-textless pages used English OCR. Embedded media, annotations and images on text-bearing pages were not described.`] }
  } finally {
    options.signal.removeEventListener('abort', cancel)
    await worker?.terminate().catch(() => undefined)
    await document?.destroy().catch(() => undefined)
  }
}
