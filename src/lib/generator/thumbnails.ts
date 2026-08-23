import type { MediaEntry } from '#/lib/engine/types'
import { mimeTypeOf } from '#/lib/engine/media'
import { browserImagePreprocessor } from '#/lib/image/browser'
import type { FileSource } from '#/lib/sources/types'
import { THUMBNAILS, transact } from './idb'

/**
 * Contact-sheet thumbnails for a finished run, kept in the browser.
 *
 * A reopened run used to show grey squares, because the review screen draws
 * from the folder on disk and history has no handle to it. The obvious fix —
 * upload a thumbnail with the rows — is the one thing this app promises not to
 * do: media never reaches a disk we own, and a 320px JPEG of somebody's shoot
 * is still their shoot. So the pictures stay on the machine that made them,
 * in IndexedDB, and expire on exactly the same day the rows do.
 *
 * The cost of that choice, stated plainly in the UI: reopen the run in a
 * different browser and the tiles are blank. Everything else still works —
 * the rows, the edits and the CSV all come from the server.
 */

/** Long enough to recognise the shot, small enough that 500 of them fit. */
const MAX_EDGE = 320
const QUALITY = 0.72

interface ThumbnailRecord {
  runId: string
  expiresAt: number
  /** Keyed by `MetadataRow.sourceName` — the file as it is on disk. */
  blobs: Record<string, Blob>
}

const store = <T,>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
) => transact<T>(THUMBNAILS, mode, work)

export async function saveThumbnails(
  runId: string,
  expiresAt: number,
  blobs: Record<string, Blob>,
): Promise<void> {
  if (Object.keys(blobs).length === 0) return
  const record: ThumbnailRecord = { runId, expiresAt, blobs }
  await store('readwrite', (records) => records.put(record))
}

export async function loadThumbnails(
  runId: string,
): Promise<Record<string, Blob> | null> {
  const record = await store<ThumbnailRecord | undefined>('readonly', (records) =>
    records.get(runId),
  )
  if (!record) return null
  // A record that outlived its run is treated as absent rather than deleted
  // here; the purge below is the one writer that removes things.
  return record.expiresAt > Date.now() ? record.blobs : null
}

/**
 * Drop everything past its date, plus anything whose run the server no longer
 * lists — a deleted account, a pruned run, a different login on this machine.
 * Called from the history screen, which is the only place that knows both.
 */
export async function purgeThumbnails(liveRunIds: string[]): Promise<void> {
  const records = await store<ThumbnailRecord[]>('readonly', (records) =>
    records.getAll(),
  )
  const live = new Set(liveRunIds)
  const now = Date.now()
  const dead = records.filter(
    (record) => record.expiresAt <= now || !live.has(record.runId),
  )

  for (const record of dead) {
    await store('readwrite', (records) => records.delete(record.runId))
  }
}

/**
 * Make the thumbnails for a run that just finished.
 *
 * Sequential on purpose: this happens while the contributor is reading the
 * review screen, and racing a hundred decodes against the tiles they are
 * actually looking at would make the page stutter for no gain. Anything that
 * refuses to decode is skipped — a blank tile is not worth failing a save for.
 */
export async function captureThumbnails(
  source: FileSource,
  entries: MediaEntry[],
): Promise<Record<string, Blob>> {
  const blobs: Record<string, Blob> = {}

  for (const entry of entries) {
    try {
      const blob =
        entry.kind === 'video'
          ? await videoThumbnail(source, entry)
          : await imageThumbnail(source, entry)
      if (blob) blobs[entry.name] = blob
    } catch (error) {
      console.warn(`[stockflow] no saved thumbnail for ${entry.name}:`, error)
    }
  }

  return blobs
}

async function imageThumbnail(
  source: FileSource,
  entry: MediaEntry,
): Promise<Blob | null> {
  const bytes = await source.readBytes(entry)
  // SVG and .ai/.pdf become a JPEG here, exactly as they do for the model.
  const raster = await browserImagePreprocessor.toRaster(
    bytes,
    entry.name,
    mimeTypeOf(entry.name),
  )
  const blob = new Blob([raster.bytes.slice().buffer as ArrayBuffer], {
    type: raster.mimeType,
  })

  const bitmap = await createImageBitmap(blob)
  try {
    return draw(bitmap.width, bitmap.height, (context, width, height) =>
      context.drawImage(bitmap, 0, 0, width, height),
    )
  } finally {
    bitmap.close()
  }
}

/** One frame, a fraction of a second in — the same nudge the review tile uses. */
async function videoThumbnail(
  source: FileSource,
  entry: MediaEntry,
): Promise<Blob | null> {
  if (!source.previewUrl) return null
  const url = await source.previewUrl(entry)
  if (!url) return null

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      const fail = () => reject(new Error('the browser could not decode it'))
      video.onerror = fail
      // `seeked`, not `loadeddata`: the latter fires on frame zero, which on a
      // fade-in is a black square. This is the same nudge the review tile does.
      video.onseeked = () => resolve()
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2)
      }
      // A codec the browser refuses never fires any of them.
      setTimeout(fail, 10_000)
    })

    return draw(video.videoWidth, video.videoHeight, (context, width, height) =>
      context.drawImage(video, 0, 0, width, height),
    )
  } finally {
    video.src = ''
    URL.revokeObjectURL(url)
  }
}

function draw(
  sourceWidth: number,
  sourceHeight: number,
  paint: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void,
): Promise<Blob | null> {
  if (!sourceWidth || !sourceHeight) return Promise.resolve(null)

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return Promise.resolve(null)

  // JPEG has no alpha, so a transparent PNG or SVG would come out black.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  paint(context, width, height)

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', QUALITY),
  )
}
