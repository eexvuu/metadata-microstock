import { pdfRasterPreprocessor } from './pdf-raster'
import { rasterDownscalePreprocessor } from './raster-downscale'
import { svgRasterPreprocessor } from './svg-raster'
import type { ImagePreprocessor } from './types'

/**
 * Everything a tab can turn into a picture, in one preprocessor.
 *
 * Each step no-ops on formats that are not its own, so the order only decides
 * who gets asked first and a JPEG walks past both vector steps untouched. The
 * heavy half (pdf.js) is behind a dynamic import inside `pdf-raster.ts`, so a
 * run of pure photographs never downloads it.
 *
 * The downscale is last and only ever sees a photograph: whatever the two
 * rasterisers produce is already capped at the same 2048px, so a converted
 * vector has nothing left to give.
 */
export const browserImagePreprocessor: ImagePreprocessor = {
  async toRaster(bytes, name, mimeType) {
    const svg = await svgRasterPreprocessor.toRaster(bytes, name, mimeType)
    if (svg.changed) return svg

    const pdf = await pdfRasterPreprocessor.toRaster(bytes, name, mimeType)
    if (pdf.changed) return pdf

    return rasterDownscalePreprocessor.toRaster(bytes, name, mimeType)
  },
}
