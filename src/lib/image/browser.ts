import { pdfRasterPreprocessor } from './pdf-raster'
import { svgRasterPreprocessor } from './svg-raster'
import type { ImagePreprocessor } from './types'

/**
 * Everything a tab can turn into a picture, in one preprocessor.
 *
 * Each step no-ops on formats that are not its own, so the order only decides
 * who gets asked first and a JPEG walks through both untouched. The heavy half
 * (pdf.js) is behind a dynamic import inside `pdf-raster.ts`, so a run of pure
 * photographs never downloads it.
 */
export const browserImagePreprocessor: ImagePreprocessor = {
  async toRaster(bytes, name, mimeType) {
    const svg = await svgRasterPreprocessor.toRaster(bytes, name, mimeType)
    if (svg.changed) return svg

    return pdfRasterPreprocessor.toRaster(bytes, name, mimeType)
  },
}
