import { extname } from '#/lib/engine/media'
import type { ImagePreprocessor, RasterResult } from './types'

/** What the model gets. Gemini downsizes anything larger anyway. */
const MAX_SIDE = 2048
const JPEG_QUALITY = 0.9

const PDF_EXTENSIONS = ['.ai', '.pdf']

/**
 * Illustrator artwork and PDFs, rendered by the tab.
 *
 * Adobe Stock and Shutterstock can preview a vector because they rasterise it
 * on their own servers with their own engines. A browser cannot run PostScript
 * — but it turns out it does not have to for `.ai`: since Illustrator 9, a file
 * saved with "Create PDF Compatible File" (the default) *is* a PDF with the
 * editable Illustrator data tucked into a private stream. So pdf.js renders
 * page one and the model sees the artwork.
 *
 * `.eps` is deliberately not here. That really is PostScript, and the only
 * browser answers are a multi-megabyte ghostscript build or the low-resolution
 * TIFF preview Illustrator sometimes embeds — "works for some files" is worse
 * than "export a JPEG", which contributors do anyway.
 */
export const pdfRasterPreprocessor: ImagePreprocessor = {
  async toRaster(bytes, name, mimeType): Promise<RasterResult> {
    if (!PDF_EXTENSIONS.includes(extname(name))) {
      return { bytes, mimeType, changed: false }
    }

    return {
      bytes: await rasterizePdf(bytes, MAX_SIDE),
      mimeType: 'image/jpeg',
      changed: true,
    }
  },
}

/**
 * Page one as JPEG bytes. Exported so the thumbnail grid can reuse it at a
 * fraction of the size instead of rendering a poster nobody looks at.
 */
export async function rasterizePdf(
  bytes: Uint8Array,
  maxSide: number,
): Promise<Uint8Array> {
  assertPdf(bytes)

  const pdfjs = await loadPdfjs()

  const task = pdfjs.getDocument({
    // pdf.js transfers and neuters the buffer it is handed, and the caller
    // still owns these bytes.
    data: bytes.slice(),
    // The Illustrator private stream references fonts we do not ship; the
    // standard-font fallback is what makes text render instead of vanishing.
    useSystemFonts: true,
  })

  const pdf = await task.promise

  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(1, maxSide / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale: scale || 1 })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser gave no 2D canvas context')

    // Vector art is usually transparent, and JPEG has no alpha.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvas, canvasContext: context, viewport }).promise

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) throw new Error('Could not turn the page into a JPEG')

    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    // Tears down the worker too; a folder of vectors would otherwise leave one
    // per file alive for as long as the tab is open.
    await task.destroy()
  }
}

/**
 * pdf.js, its worker, and both of them only once.
 *
 * Dynamic on purpose: ~1 MB of renderer that only the people dropping
 * Illustrator files ever download. The worker is handed over as a port rather
 * than a `workerSrc` URL — that is the arrangement bundlers can actually see,
 * and one shared worker serves every file the run has in flight.
 */
let pdfjsModule: Promise<typeof import('pdfjs-dist')> | null = null

function loadPdfjs() {
  pdfjsModule ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    )
    return pdfjs
  })

  return pdfjsModule
}

export function isPdfBacked(name: string): boolean {
  return PDF_EXTENSIONS.includes(extname(name))
}

/**
 * Cheap enough to run over every dropped Illustrator file at scan time: an
 * `.ai` saved with PDF compatibility switched off is not a PDF, and telling
 * someone that before the run beats failing the file a minute into it.
 */
export function looksLikePdf(head: Uint8Array): boolean {
  return new TextDecoder().decode(head.slice(0, 1024)).includes('%PDF-')
}

/**
 * An `.ai` saved with PDF compatibility switched off is not a PDF at all, and
 * pdf.js fails on it with something unreadable. The magic bytes are cheaper to
 * check than the error is to explain.
 */
function assertPdf(bytes: Uint8Array): void {
  const head = new TextDecoder().decode(bytes.slice(0, 1024))

  if (!head.includes('%PDF-')) {
    throw new Error(
      'This file was saved without PDF compatibility, so it cannot be rendered here — re-save it from Illustrator with "Create PDF Compatible File" ticked, or export a JPEG instead.',
    )
  }
}
