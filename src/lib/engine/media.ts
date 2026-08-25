import type { MediaKind } from './types'

/*
 * `.svg`, `.ai` and `.pdf` are images as far as this app is concerned: the tab
 * renders them to a JPEG before anything is sent (src/lib/image/). The model
 * never sees a vector.
 */
export const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.webp',
  '.svg',
  '.ai',
  '.pdf',
]
export const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v']
export const SUPPORTED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  // Rasterised before they are sent — see src/lib/image/.
  '.svg': 'image/svg+xml',
  '.ai': 'application/pdf',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
}

/** node:path's extname, minus node:path. Returns "" or ".ext" lowercased. */
/**
 * Formats a contributor plausibly expects to work, that this tool cannot open:
 * PostScript needs a renderer no browser ships, and the video containers here
 * cannot have their audio stripped in a tab. Listed so the picker can say so
 * out loud instead of quietly dropping the file.
 */
export const UNSUPPORTED_MEDIA_EXTENSIONS = [
  '.eps',
  '.psd',
  '.tif',
  '.tiff',
  '.cdr',
  '.indd',
  '.heic',
  '.heif',
  '.avi',
  '.mkv',
  '.webm',
  '.wmv',
  '.flv',
]

/**
 * The media itself is the problem, and no key, model or retry changes that.
 *
 * The runner treats every other failure as maybe-transient — it requeues the
 * file, walks it through every remaining key and then tries a rung down. That
 * is right for a 429 and wrong for a codec: the answer is identical eight keys
 * later, and the only thing the loop buys is eight re-reads of a 68 MB file and
 * eight identical lines in the run log. Thrown by the preprocessors, caught in
 * `runner.ts`, which writes the fallback row immediately and says why.
 */
export class UnsendableMediaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsendableMediaError'
  }
}

export function isUnsendableMedia(error: unknown): boolean {
  return error instanceof UnsendableMediaError
}

/**
 * The most this app will put in a `generateContent` body.
 *
 * The request may not exceed about 20 MB and `inline_data` is base64, which
 * costs a third on top — so 14 MiB of file is roughly 19 MB of request. Past
 * this the same bytes go up through the Files API instead, which is a slower
 * first step and no different to the model.
 */
export const INLINE_MAX_BYTES = 14 * 1024 * 1024

/**
 * The most this app will upload for one file.
 *
 * Measured on this connection, 2026-08-25: 65 MB took 45 s, and the worker
 * holding the file is busy for all of it with no way to resume. A 4K ProRes
 * master runs about 10 MB a second, so 200 MB is around twenty seconds of
 * footage — past that, exporting an H.264 is genuinely the faster answer and
 * the refusal says so.
 */
export const UPLOAD_MAX_BYTES = 200 * 1024 * 1024

/**
 * The file needs the fast rung and this key is not on it.
 *
 * Only one thing produces this: a mastering codec that also carries audio.
 * The tab cannot remux it — mp4box will not touch a track it could not
 * classify — so the audio travels with it, and the bottom rung answers
 * `400: Audio input modality is not enabled` whether the media arrives inline
 * or as a file reference (measured both ways, 2026-08-25).
 *
 * Unlike `UnsendableMediaError` this is about the key, not the file: another
 * key still on the fast rung can do it, so the runner requeues. What it must
 * not do is try a rung *down*, which is the one answer guaranteed to fail.
 */
export class WrongRungError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WrongRungError'
  }
}

export function isWrongRung(error: unknown): boolean {
  return error instanceof WrongRungError
}

export function extname(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot).toLowerCase()
}

export function stem(name: string): string {
  const ext = extname(name)
  return ext ? name.slice(0, -ext.length) : name
}

export function kindOf(name: string): MediaKind | null {
  const ext = extname(name)
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  return null
}

export function mimeTypeOf(name: string): string {
  return MIME_TYPES[extname(name)] ?? 'video/mp4'
}

/**
 * Extract keywords from square brackets in a filename.
 * "[low taper fade]-1.mp4" -> ["low taper fade"]
 * "[sunset][beach vibes]-clip.mp4" -> ["sunset", "beach vibes"]
 */
export function extractBracketKeywords(name: string): string[] {
  const matches = stem(name).match(/\[([^\]]+)\]/g)
  if (!matches) return []
  return matches.map((match) => match.slice(1, -1).trim()).filter(Boolean)
}

/** Brackets are a local convention; stock platforms reject them in filenames. */
export function cleanFilenameForExport(name: string): string {
  return name.replace(/[[\]]/g, '')
}

/**
 * The filename the CSV should reference. In vector mode the raster extension is
 * swapped for the vector one, because the file you upload is the .eps/.ai while
 * the file the model looked at was the paired .png.
 */
export function outputFilename(name: string, vectorExtension?: string): string {
  return vectorExtension ? stem(name) + vectorExtension : name
}
