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
