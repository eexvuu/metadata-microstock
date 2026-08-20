import { extname } from '#/lib/engine/media'
import type { ImagePreprocessor, RasterResult } from './types'

/** Google's vision models never see the vector; they see this many pixels. */
const MAX_SIDE = 2048
const JPEG_QUALITY = 0.9

/**
 * SVG in, JPEG out, drawn by the browser itself.
 *
 * The Gemini API rejects `image/svg+xml`, so the tab renders the vector to a
 * canvas and sends the picture instead — no dependency, no upload, and the CSV
 * still names whatever file the contributor is going to upload.
 *
 * Two things an SVG does that a photo does not, both handled below: it can
 * carry no intrinsic size (only a viewBox), and it is usually transparent —
 * and JPEG has no alpha, so an unpainted canvas would hand Gemma a black
 * rectangle to describe.
 */
export const svgRasterPreprocessor: ImagePreprocessor = {
  async toRaster(bytes, name, mimeType): Promise<RasterResult> {
    if (extname(name) !== '.svg' && mimeType !== 'image/svg+xml') {
      return { bytes, mimeType, changed: false }
    }

    // `bytes.buffer` is typed as ArrayBufferLike; Blob wants a real ArrayBuffer.
    const source = URL.createObjectURL(
      new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/svg+xml' }),
    )

    try {
      const image = await load(source)
      const { width, height } = sizeOf(image, bytes)

      const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))

      const context = canvas.getContext('2d')
      if (!context) throw new Error('This browser gave no 2D canvas context')

      // White first: a transparent SVG on a JPEG is a black rectangle.
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
      )
      if (!blob) throw new Error('Could not turn the SVG into a JPEG')

      return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: 'image/jpeg',
        changed: true,
      }
    } finally {
      URL.revokeObjectURL(source)
    }
  },
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(
        new Error(
          'This SVG could not be rendered — external fonts and linked images do not load inside one.',
        ),
      )
    image.src = url
  })
}

/**
 * The viewBox wins where there is one: browsers hand back a default layout size
 * for an SVG without width/height (300×150-ish), which would rasterise a
 * perfectly good logo at postage-stamp resolution.
 */
function sizeOf(image: HTMLImageElement, bytes: Uint8Array) {
  const head = new TextDecoder().decode(bytes.slice(0, 4096))
  const viewBox = head.match(/viewBox\s*=\s*["']([^"']+)["']/)

  if (viewBox) {
    const [, , width, height] = viewBox[1].trim().split(/[\s,]+/).map(Number)
    if (width > 0 && height > 0) return { width, height }
  }

  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    return { width: image.naturalWidth, height: image.naturalHeight }
  }

  return { width: 1024, height: 1024 }
}
