/**
 * Gemini only reads a handful of raster types (JPEG, PNG, WEBP, HEIC/HEIF).
 * Vector art has to become a picture first, and how that is done depends on
 * the target: a browser tab has a canvas, a Node process does not. Same seam
 * as `VideoPreprocessor`, one step earlier in the pipeline.
 */
export interface RasterResult {
  bytes: Uint8Array
  mimeType: string
  /** False when the file was already a raster the model can read. */
  changed: boolean
}

export interface ImagePreprocessor {
  /** Throws when the format is one this preprocessor cannot rasterise. */
  toRaster(bytes: Uint8Array, name: string, mimeType: string): Promise<RasterResult>
}

/** Used where every image is already a raster — the CLI and the test script. */
export const passthroughImagePreprocessor: ImagePreprocessor = {
  async toRaster(bytes, _name, mimeType) {
    return { bytes, mimeType, changed: false }
  },
}
