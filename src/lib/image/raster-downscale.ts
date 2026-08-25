import type { ImagePreprocessor, RasterResult } from './types'

/**
 * The last step of the browser chain: a photograph that is far bigger than the
 * model can look at, shrunk before it is sent.
 *
 * Nothing here is about a format Gemini refuses — a 65 MB JPEG is perfectly
 * readable. It is about what that costs. The bytes go up as `inline_data`, so
 * they are base64 first (+33%), and a contributor on a home connection spends
 * minutes uploading a file the API is going to reduce anyway: images are billed
 * in 768x768 tiles at 258 tokens each, so an 8000px original buys nothing over
 * a 2048px one except upload time, tokens, and a tab holding ~90 MB of string.
 *
 * Same ceiling and quality as the two rasterisers above it, for the same
 * reason — this is one more way to arrive at "what the model actually sees".
 */
const MAX_SIDE = 2048
const JPEG_QUALITY = 0.9

/**
 * Below this a re-encode costs more than it saves: decoding to a canvas and
 * back is not free, and a 3 MB JPEG uploads in about as long as it takes to
 * think about it. Deliberately generous — the case this exists for is 65 MB.
 */
const SIZE_BUDGET = 4 * 1024 * 1024

export const rasterDownscalePreprocessor: ImagePreprocessor = {
  async toRaster(bytes, name, mimeType): Promise<RasterResult> {
    const unchanged: RasterResult = { bytes, mimeType, changed: false }
    const size = dimensionsOf(bytes)

    // Either axis over the ceiling, or simply too many bytes to be worth
    // uploading. The second half is what catches a 2000px, 20 MB PNG, and it
    // is also the whole rule for a format whose header we cannot read.
    const oversized =
      bytes.length > SIZE_BUDGET ||
      (size !== null && Math.max(size.width, size.height) > MAX_SIDE)
    if (!oversized) return unchanged

    try {
      const shrunk = await shrink(bytes, mimeType, size)
      // A small, heavily compressed source can come back bigger. Keep whichever
      // is actually smaller; the point of this module is fewer bytes.
      return shrunk.length < bytes.length
        ? { bytes: shrunk, mimeType: 'image/jpeg', changed: true }
        : unchanged
    } catch (error) {
      /*
       * Deliberately not a throw, unlike the SVG and PDF steps. Those fail
       * because the API is certain to refuse what they could not convert; this
       * one is an optimisation, and a picture this browser cannot decode may
       * still be one Gemini reads perfectly well. Sending the original is the
       * safe answer.
       */
      console.warn(`[stockflow] ${name} could not be downscaled, sending as-is:`, error)
      return unchanged
    }
  },
}

async function shrink(
  bytes: Uint8Array,
  mimeType: string,
  size: { width: number; height: number } | null,
): Promise<Uint8Array> {
  // `bytes.buffer` is typed as ArrayBufferLike; Blob wants a real ArrayBuffer.
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType })
  const bitmap = await decode(blob, size)

  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))

    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser gave no 2D canvas context')

    // JPEG has no alpha, so a transparent PNG would come out black.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!out) throw new Error('Could not re-encode the image as a JPEG')

    return new Uint8Array(await out.arrayBuffer())
  } finally {
    bitmap.close()
  }
}

/**
 * Decode at roughly the size we want rather than at full resolution.
 *
 * This is the half that matters on the files this module exists for: a 100
 * megapixel photograph is 400 MB of RGBA once it is a bitmap, which is how a
 * tab dies on a folder of them. `resizeWidth`/`resizeHeight` let the browser
 * scale during the decode instead.
 *
 * Only one axis is given. Browsers apply EXIF orientation here, and the header
 * dimensions below are the pre-rotation ones — asking for both would stretch a
 * rotated photo. One axis keeps the aspect ratio whatever the orientation says,
 * and the canvas above still caps the result.
 */
async function decode(
  blob: Blob,
  size: { width: number; height: number } | null,
): Promise<ImageBitmap> {
  if (size && Math.max(size.width, size.height) > MAX_SIDE) {
    const landscape = size.width >= size.height
    try {
      return await createImageBitmap(blob, {
        ...(landscape ? { resizeWidth: MAX_SIDE } : { resizeHeight: MAX_SIDE }),
        resizeQuality: 'high',
      })
    } catch {
      // Older Safari ignores or rejects the options bag; full decode it is.
    }
  }

  return createImageBitmap(blob)
}

/**
 * Width and height straight out of the file header, without decoding it.
 *
 * Cheap enough to run over every image in a folder, which is what lets an
 * already-small picture skip this module entirely. WebP is not read here and
 * does not need to be: an unknown size falls back to the byte budget, which is
 * the rule that was going to decide anyway.
 */
function dimensionsOf(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // PNG: the IHDR chunk is always first, at a fixed offset.
  if (bytes.length > 24 && view.getUint32(0) === 0x89504e47) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }

  // GIF: little-endian, right after the "GIF89a" header.
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }

  // BMP: the DIB header. Height is signed — a negative one is top-down.
  if (bytes.length > 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) }
  }

  // JPEG: no fixed offset, so walk the segments to the frame header.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(view)

  return null
}

/**
 * Walk JPEG markers until a start-of-frame, which is the only segment carrying
 * the picture's size. Standalone markers have no length field to skip by, and a
 * run of 0xFF is legal padding — both are why this is a loop and not an offset.
 */
function jpegSize(view: DataView): { width: number; height: number } | null {
  let i = 2

  while (i + 9 < view.byteLength) {
    if (view.getUint8(i) !== 0xff) {
      i++
      continue
    }

    const marker = view.getUint8(i + 1)

    // Padding, restart markers and the two standalone ones: no payload.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }

    // SOF0-SOF15, minus the three that are Huffman/arithmetic tables instead.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) }
    }

    i += 2 + view.getUint16(i + 2)
  }

  return null
}
