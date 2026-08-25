/**
 * Gemma rejects any media that carries an audio track ("Audio input modality is
 * not enabled"), so every video is remuxed without audio before it is sent.
 * The CLI does this with `ffmpeg -an -c:v copy`. The browser has no ffmpeg, so
 * each target supplies its own implementation of this one interface.
 */
export interface StripResult {
  bytes: Uint8Array
  mimeType: string
  /** False when the file had no audio track and was passed through untouched. */
  changed: boolean
  /**
   * Send these bytes by reference rather than in the request body.
   *
   * Set for the codecs a tab cannot decode — ProRes, DNxHD — which used to be
   * refused outright. They cannot be shrunk here, but Google decodes them
   * server-side, so the Files API turns "export an H.264 first" into a slower
   * upload and nothing else. Measured 2026-08-25; see `files-api.ts` for why
   * a browser is allowed to do this at all.
   */
  upload?: boolean
  /**
   * An audio track survived, because this preprocessor could not reach it.
   * The bottom rung refuses audio, so the runner keeps such a file on the
   * fast one.
   */
  hasAudio?: boolean
}

export interface VideoPreprocessor {
  /** Throws when the container is one this preprocessor cannot handle. */
  stripAudio(bytes: Uint8Array, name: string, mimeType: string): Promise<StripResult>
}

/** Used when videos are known to be audio-free, or for image-only runs. */
export const passthroughPreprocessor: VideoPreprocessor = {
  async stripAudio(bytes, _name, mimeType) {
    return { bytes, mimeType, changed: false }
  },
}
