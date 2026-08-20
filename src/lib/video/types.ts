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
