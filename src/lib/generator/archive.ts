import { UPLOAD_MAX_BYTES, mimeTypeOf } from '#/lib/engine/media'
import type { MediaEntry } from '#/lib/engine/types'
import { confirmRunMedia, presignRunMedia } from '#/lib/server/run-media'
import type { FileSource } from '#/lib/sources/types'

/**
 * Send a finished run's originals to R2, from the tab that did the run.
 *
 * The counterpart of `thumbnails.ts`, and the opposite decision. Those stay in
 * IndexedDB because a 320 px JPEG of somebody's shoot is still their shoot;
 * these leave, because support cannot answer "it read my photo as a dog"
 * without the photo, and asking a contributor to email a 60 MB .mov is worse
 * for them than an admin opening a screen that records the opening. The tool's
 * own copy says so — see `m.tool` and `m.history.resultsNote`.
 *
 * **After the run, never during it.** The bytes are read a second time off the
 * disk they came from, which is cheap next to what it buys: a run's pace stays
 * the model's, not the uplink's, and somebody reading the review screen is not
 * waiting on an upload they did not ask for. It also means a closed tab
 * archives nothing, which is the same deal the run itself has.
 *
 * Nothing here throws at the caller. A run that finished is finished; losing
 * it to a failed convenience upload would be the worse outcome by far, so
 * every failure is one console line and one skipped file.
 */

/** Four at a time — what a home uplink is helped by, and no more. */
const LANES = 4

/** Matches `MAX_BATCH` in `run-media.ts`: URLs live two hours, so ask late. */
const PRESIGN_BATCH = 8

interface Archived {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  kind: 'image' | 'video'
}

export async function archiveOriginals(
  source: FileSource,
  entries: MediaEntry[],
  runId: string,
): Promise<number> {
  // A file the run could not have sent to Google is a file there is nothing to
  // keep — same number, same reason (`UPLOAD_MAX_BYTES`).
  const queue = entries.filter((entry) => entry.size > 0 && entry.size <= UPLOAD_MAX_BYTES)
  if (queue.length === 0) return 0

  const stored: Archived[] = []
  let storageReady = true

  /**
   * One presign round trip, then its uploads. Asking for eight at a time keeps
   * a URL's two-hour life ahead of the uploader on a folder of video, where an
   * everything-up-front presign would hand out links that expire before their
   * turn comes.
   */
  const sendBatch = async (batch: MediaEntry[]) => {
    const { storageReady: ready, uploads } = await presignRunMedia({
      data: {
        runId,
        files: batch.map((entry) => ({
          filename: entry.name,
          contentType: mimeTypeOf(entry.name),
          sizeBytes: entry.size,
          kind: entry.kind === 'video' ? ('video' as const) : ('image' as const),
        })),
      },
    })

    if (!ready) {
      storageReady = false
      return
    }

    const pairs = uploads.map((upload, index) => ({ upload, entry: batch[index]! }))

    const lane = async () => {
      for (;;) {
        const next = pairs.shift()
        if (!next) return
        const { upload, entry } = next

        try {
          const bytes = await source.readBytes(entry)
          const response = await fetch(upload.url, {
            method: 'PUT',
            // A fresh ArrayBuffer rather than the view: a Uint8Array over a
            // larger buffer would upload the whole buffer.
            body: bytes.slice().buffer as ArrayBuffer,
            headers: { 'Content-Type': upload.contentType },
          })

          if (!response.ok) {
            console.warn(`[stockflow] ${entry.name} not archived: ${response.status}`)
            continue
          }

          stored.push({
            id: upload.id,
            filename: upload.filename,
            contentType: upload.contentType,
            sizeBytes: upload.sizeBytes,
            kind: upload.kind,
          })
        } catch (error) {
          console.warn(`[stockflow] ${entry.name} not archived:`, error)
        }
      }
    }

    await Promise.all(Array.from({ length: LANES }, lane))
  }

  for (let index = 0; index < queue.length; index += PRESIGN_BATCH) {
    if (!storageReady) break
    await sendBatch(queue.slice(index, index + PRESIGN_BATCH))
  }

  // One row per object that actually arrived, and the call is made even when
  // none did: it is what clears the rows of an earlier attempt at the same run.
  if (!storageReady) return 0
  await confirmRunMedia({ data: { runId, files: stored } })

  return stored.length
}
