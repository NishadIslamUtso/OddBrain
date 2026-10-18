/**
 * Render a bounded sample of scanned PDF pages to inert JPEGs in the renderer.
 * The original PDF, embedded actions, links, forms, and annotations are never
 * sent to an engine; PDF.js runs with its evaluator disabled and annotations off.
 */
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'
import { MAX_DOCUMENT_BYTES, MAX_PDF_PAGES } from './documents'

const MAX_PAGE_IMAGE_DIMENSION = 1280
const MAX_PAGE_IMAGE_BYTES = 2 * 1024 * 1024
const PAGE_RENDER_TIMEOUT_MS = 8_000

export type RenderedPdfPages = { pages: File[]; totalPages: number }

type RenderPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number }
  render: (options: {
    canvas: HTMLCanvasElement | null
    canvasContext: CanvasRenderingContext2D
    viewport: unknown
    annotationMode: number
  }) => { promise: Promise<void>; cancel: () => void }
  cleanup: () => void
}

type RenderDocument = {
  numPages: number
  getPage: (page: number) => Promise<RenderPage>
  getPermissions: () => Promise<number[] | null>
  destroy: () => Promise<void>
}

/** A scanned document can be carried as images, never OCR'd or switched elsewhere. */
export async function renderScannedPdfPages(file: File, maxPages = 4): Promise<RenderedPdfPages> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`${file.name}: PDFs are limited to 8 MB for safe local extraction. Nothing was sent.`)
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error(`${file.name}: there is no attachment room left for scanned pages. Nothing was sent.`)
  }
  const data = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') {
    throw new Error(`${file.name}: the file does not have a valid PDF header. It may be corrupt or mislabeled. Nothing was sent.`)
  }

  let loadingTask: { promise: Promise<unknown>; destroy: () => Promise<void> } | undefined
  let pdf: RenderDocument | undefined
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    loadingTask = pdfjs.getDocument({
      data,
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
      stopAtErrors: true,
      useWasm: false,
      maxImageSize: 4_000_000,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    })
    const document = (await loadingTask.promise) as RenderDocument
    pdf = document
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`${file.name}: PDFs are limited to ${MAX_PDF_PAGES} pages for safe local extraction. Nothing was sent.`)
    }
    const permissions = await document.getPermissions()
    if (permissions && !permissions.includes(pdfjs.PermissionFlag.COPY)) {
      throw new Error(`${file.name}: this PDF does not permit page extraction (DRM/copy protection). Nothing was read or sent.`)
    }
    const count = Math.min(document.numPages, maxPages)
    const pages: File[] = []
    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(1.5, MAX_PAGE_IMAGE_DIMENSION / baseViewport.width, MAX_PAGE_IMAGE_DIMENSION / baseViewport.height)
      const viewport = page.getViewport({ scale })
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(viewport.width))
      canvas.height = Math.max(1, Math.ceil(viewport.height))
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error(`${file.name}: this window cannot safely render scanned PDF pages. Nothing was sent.`)
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)

      const render = page.render({
        canvas,
        canvasContext: context,
        viewport,
        annotationMode: pdfjs.AnnotationMode.DISABLE,
      })
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          render.promise,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('page render timeout')), PAGE_RENDER_TIMEOUT_MS)
          }),
        ])
      } catch {
        render.cancel()
        throw new Error(`${file.name}: page ${pageNumber} could not be rendered in time. It may be corrupt or DRM-protected. Nothing was sent.`)
      } finally {
        if (timeout) clearTimeout(timeout)
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          value => value ? resolve(value) : reject(new Error(`${file.name}: page ${pageNumber} could not be encoded. Nothing was sent.`)),
          'image/jpeg',
          0.86,
        )
      })
      if (blob.type !== 'image/jpeg' || blob.size > MAX_PAGE_IMAGE_BYTES) {
        throw new Error(`${file.name}: rendered page ${pageNumber} exceeds the 2 MB image limit. Nothing was sent.`)
      }
      pages.push(new File([blob], `${file.name.replace(/\.pdf$/i, '')}-page-${pageNumber}.jpg`, { type: 'image/jpeg' }))
      page.cleanup()
    }
    if (!pages.length) throw new Error(`${file.name}: the PDF contains no pages to render. Nothing was sent.`)
    return { pages, totalPages: document.numPages }
  } catch (failure) {
    const error = failure as Error & { name?: string }
    if (error.message.startsWith(`${file.name}:`)) throw error
    if (error.name === 'PasswordException') {
      throw new Error(`${file.name}: this PDF is password-protected. Unlock it yourself before attaching; nothing was read or sent.`)
    }
    throw new Error(`${file.name}: scanned PDF pages could not be rendered. It may be corrupt, encrypted, or DRM-protected. Nothing was sent.`)
  } finally {
    try {
      await pdf?.destroy()
      await loadingTask?.destroy()
    } catch {
      // Cleanup only; a useful refusal has already been returned above.
    }
  }
}
