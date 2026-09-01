import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/index'
import { generationRun, runMedia } from '#/db/schema'
import { UPLOAD_MAX_BYTES } from '#/lib/engine/media'
import { isR2Configured, presignPut, runMediaKey } from '#/lib/server/r2'
import { requireSession } from '#/lib/server/session'

/**
 * The archive of what a run was given — from the browser's side.
 *
 * **The engine did not move.** Media is still read off the contributor's disk
 * and posted straight to Google with their own key; no route here proxies a
 * byte of it, and that rule is unchanged. What changed on 2026-09-01 is that
 * after a run finishes, the tab also PUTs each original to R2, so support can
 * see the file somebody is asking about. `revealRunRows` answers "the titles
 * come out wrong"; nothing answered "it called my photo a dog", and the
 * alternative was asking a contributor to email a 60 MB .mov.
 *
 * The bytes go browser → R2 on a presigned URL, exactly like the vectorizer's.
 * The 768 MB cap on a shared box is not negotiable, and a folder of 4K video
 * streamed through Node would be the whole memory budget for one file.
 *
 * Two shape differences from `vector.ts`, both deliberate:
 *
 * 1. **Rows are written on confirm, not on presign.** That file must insert
 *    first because a token is charged against the row. Nothing is charged
 *    here, so a row can mean what it should mean: the bytes arrived. No
 *    abandoned-upload sweep, and no card in the admin screen for an object
 *    that was never made.
 * 2. **URLs are handed out a few at a time.** A presigned PUT lives two hours
 *    (`r2.ts`), which is generous for a batch of PNGs and not at all generous
 *    for two hundred videos on a home connection — the tail of an
 *    everything-up-front presign would be dead before the uploader reached it.
 */

/** One presign request. Small enough that its URLs are used within minutes. */
const MAX_BATCH = 8

/**
 * The size cap is the engine's own. `UPLOAD_MAX_BYTES` is where re-exporting
 * beats uploading, so a file over it never reached the model either and there
 * is nothing to keep — and the browser that skips the file reads the same
 * constant, because two numbers that must agree are one number waiting to
 * drift.
 */
const mediaInput = z.object({
  filename: z.string().min(1).max(400),
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(UPLOAD_MAX_BYTES),
  kind: z.enum(['image', 'video']),
})

/** The run has to be this session's. Scope comes from the session, never the body. */
async function ownedRun(runId: string, userId: string) {
  const [row] = await getDb()
    .select({ id: generationRun.id })
    .from(generationRun)
    .where(and(eq(generationRun.id, runId), eq(generationRun.userId, userId)))
    .limit(1)

  if (!row) throw new Error('That run is not yours, or no longer exists.')
  return row
}

/**
 * URLs for the next few files, and the ids they will be filed under.
 *
 * The ids are minted here rather than accepted from the client, so an object
 * key can never be steered: it is always `metadata/<this session>/<this
 * run>/<a uuid we made>`. The browser echoes them back to `confirmRunMedia`,
 * which is the only thing that writes a row.
 *
 * `storageReady: false` when R2 is not configured — a deploy without a bucket
 * still runs the whole tool, it just keeps no originals.
 */
export const presignRunMedia = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      runId: z.string().min(1),
      files: z.array(mediaInput).min(1).max(MAX_BATCH),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()

    if (!isR2Configured()) return { storageReady: false, uploads: [] }

    await ownedRun(data.runId, session.user.id)

    const uploads = await Promise.all(
      data.files.map(async (file) => {
        const id = crypto.randomUUID()
        const key = runMediaKey(session.user.id, data.runId, id)
        return {
          id,
          filename: file.filename,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          kind: file.kind,
          key,
          url: await presignPut(key),
        }
      }),
    )

    return { storageReady: true, uploads }
  })

/**
 * "Those landed" — the only writer of `run_media`.
 *
 * Every row for the run is replaced rather than appended to. A resumed run
 * reuses its `generation_run` row (that is what stops History counting one
 * piece of work twice), so a folder continued and then finished would archive
 * twice and show every file two or three times. Replacing keeps the screen
 * honest; the objects the old rows named are left to the lifecycle rule, which
 * is the only thing that deletes bytes here.
 *
 * The key is recomputed from the session and the run rather than trusted from
 * the body, so the worst a lying client can do is file a row against an object
 * of its own that nobody will ever be able to read.
 */
export const confirmRunMedia = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      runId: z.string().min(1),
      files: z
        .array(mediaInput.extend({ id: z.string().min(1).max(64) }))
        .max(2000),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    const userId = session.user.id

    await ownedRun(data.runId, userId)

    const db = getDb()
    await db.delete(runMedia).where(eq(runMedia.runId, data.runId))

    if (data.files.length === 0) return { stored: 0 }

    await db.insert(runMedia).values(
      data.files.map((file) => ({
        id: file.id,
        runId: data.runId,
        userId,
        filename: file.filename,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        kind: file.kind,
        objectKey: runMediaKey(userId, data.runId, file.id),
      })),
    )

    return { stored: data.files.length }
  })
