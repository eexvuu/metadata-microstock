import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/index'
import { vectorFile, vectorJob } from '#/db/schema'
import { isR2Configured, objectKeys, presignGet, presignPut } from '#/lib/server/r2'
import { requireSession } from '#/lib/server/session'
import {
  SIGNUP_GRANT,
  balanceOf,
  ensureSignupGrant,
  recentLedger,
  refundFile,
  spendTokens,
} from '#/lib/server/tokens'

/**
 * The vectorizer tool, from the browser's side.
 *
 * **Open to every signed-in account, and the balance is the gate.** This was
 * admin-only for its first month, and the reasoning is worth keeping rather
 * than deleting because it was right at the time: the tool spends OUR
 * vectorizer.ai credits rather than a key the user brought, so until there was
 * a way to bound what one account could spend, the only safe audience was one
 * person. `token_ledger` is that bound. Every function here still starts with
 * a session check — an anonymous request has no balance to charge and no jobs
 * to list — but the thing standing between an account and our credit card is
 * now `spendTokens`, which refuses a batch it cannot pay for.
 *
 * A new account gets `SIGNUP_GRANT` tokens; anything past that is an admin
 * writing a ledger row. There is no self-service top-up, deliberately — this
 * tool has no price yet, and a trial that cannot be extended by the person
 * using it is a trial.
 *
 * The bytes are not here and never will be. The browser is handed presigned
 * PUT URLs and uploads straight to R2; this process signs, counts and charges.
 * See `src/lib/server/r2.ts` for why that is load-bearing rather than elegant.
 */

/** One image is one token. Not configurable — see `tokens.ts`. */
const TOKENS_PER_FILE = 1

/**
 * There is no retention rule in this application, deliberately.
 *
 * An earlier version stamped every result with a 30-day expiry, refused an
 * expired download, and had the nightly job delete the objects. All of it is
 * gone: R2 has an object lifecycle rule, that rule is one setting rather than
 * three code paths that must agree with it, and two mechanisms deleting the
 * same bytes on different clocks is how you get a row promising a file that is
 * not there. Retention is configured on the bucket — see `deploy/README.md`.
 *
 * The window is thirty days as of 2026-09-01, and it is the same thirty the
 * metadata tool gives a saved result. One promise for the whole shelf.
 *
 * `vector_file.expires_at` survives as an unused nullable column, so turning
 * this back on is a code change and not a migration.
 */

/**
 * vectorizer.ai takes raster art. Anything else is a file the worker would
 * download, fail on, and refund — so it is refused at the door instead.
 */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp'] as const

/**
 * Big enough for a 6000 px PNG, small enough that one dropped folder cannot
 * fill the bucket by accident. The check is here AND in the drop zone: the
 * browser one is a courtesy, this one is the rule.
 */
const MAX_FILE_BYTES = 30 * 1024 * 1024

/** One batch. Past this the screen stops being readable long before R2 minds. */
const MAX_FILES_PER_JOB = 200

export interface VectorFileView {
  id: string
  filename: string
  status: string
  error: string | null
  hasSvg: boolean
  hasEps: boolean
}

export interface VectorJobView {
  id: string
  label: string
  status: string
  filesTotal: number
  filesDone: number
  filesFailed: number
  tokensCharged: number
  createdAt: number
  finishedAt: number | null
}

const fileInput = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(ACCEPTED),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
})

/** What the tool needs to render itself: the balance, the queue, the config. */
export const getVectorOverview = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()

  // Where an account that predates the signup hook gets its ten. Idempotent by
  // a unique index, so this is a no-op on every visit after the first — and it
  // has to happen before `balanceOf`, or the first render says zero.
  await ensureSignupGrant(session.user.id)

  const [balance, jobs, ledger] = await Promise.all([
    balanceOf(session.user.id),
    listJobsFor(session.user.id),
    recentLedger(session.user.id),
  ])

  return {
    balance,
    jobs,
    // The copy says how many tokens a new account gets, so the number travels
    // rather than being written down a second time in a dictionary.
    trial: SIGNUP_GRANT,
    storageReady: isR2Configured(),
    maxFiles: MAX_FILES_PER_JOB,
    maxFileBytes: MAX_FILE_BYTES,
    accepted: [...ACCEPTED],
    ledger: ledger.map((row) => ({
      ...row,
      createdAt: row.createdAt.getTime(),
    })),
  }
})

async function listJobsFor(userId: string): Promise<VectorJobView[]> {
  const rows = await getDb()
    .select()
    .from(vectorJob)
    .where(eq(vectorJob.userId, userId))
    .orderBy(desc(vectorJob.createdAt))
    .limit(25)

  return rows.map(toJobView)
}

function toJobView(row: typeof vectorJob.$inferSelect): VectorJobView {
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    filesTotal: row.filesTotal,
    filesDone: row.filesDone,
    filesFailed: row.filesFailed,
    tokensCharged: row.tokensCharged,
    createdAt: row.createdAt.getTime(),
    finishedAt: row.finishedAt?.getTime() ?? null,
  }
}

/**
 * Opens a batch: charges it, records it, and hands back one upload URL per file.
 *
 * The count that is charged is the number of rows THIS function wrote, never a
 * number the client sent — the request describes files, the server decides how
 * many there are. Nothing is queued yet: a file the browser fails to upload
 * sits at `awaiting_upload` and is refunded by `startVectorJob` or by the
 * nightly sweep, because a token must not be spent on bytes that never arrived.
 */
export const createVectorJob = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      label: z.string().min(1).max(120),
      files: z.array(fileInput).min(1).max(MAX_FILES_PER_JOB),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    const userId = session.user.id

    if (!isR2Configured()) {
      throw new Error('Storage is not configured on this server — see .env.example (R2_*).')
    }

    const jobId = crypto.randomUUID()
    const rows = data.files.map((file) => {
      const id = crypto.randomUUID()
      return {
        id,
        jobId,
        userId,
        filename: file.filename,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        sourceKey: objectKeys(userId, jobId, id).source,
      }
    })

    const charged = rows.length * TOKENS_PER_FILE

    // Charge BEFORE the rows exist, so a balance that cannot cover the batch
    // costs nothing and leaves nothing behind.
    const paid = await spendTokens({
      userId,
      amount: charged,
      jobId,
      note: `${rows.length} file${rows.length === 1 ? '' : 's'} · ${data.label}`,
    })

    if (!paid) {
      throw new Error(
        `Not enough tokens: this batch costs ${charged} and the balance is ${await balanceOf(userId)}.`,
      )
    }

    const db = getDb()

    await db.insert(vectorJob).values({
      id: jobId,
      userId,
      label: data.label,
      filesTotal: rows.length,
      tokensCharged: charged,
      status: 'uploading',
    })

    await db.insert(vectorFile).values(rows)

    const uploads = await Promise.all(
      rows.map(async (row) => ({
        fileId: row.id,
        filename: row.filename,
        contentType: row.contentType,
        url: await presignPut(row.sourceKey),
      })),
    )

    return { jobId, charged, uploads }
  })

/**
 * The browser saying "those uploads landed".
 *
 * It names the files it managed to upload; everything else in the job is
 * abandoned and refunded here rather than left to the nightly sweep, because
 * the person is still looking at the screen and a wrong balance is what they
 * would notice.
 */
export const startVectorJob = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ jobId: z.string(), uploaded: z.array(z.string()) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    const db = getDb()

    const job = await ownedJob(data.jobId, session.user.id)

    const files = await db.select().from(vectorFile).where(eq(vectorFile.jobId, job.id))

    const uploaded = new Set(data.uploaded)
    const queued = files.filter((file) => uploaded.has(file.id))
    const missed = files.filter((file) => !uploaded.has(file.id))

    if (queued.length) {
      await db
        .update(vectorFile)
        .set({ status: 'queued' })
        .where(
          and(
            eq(vectorFile.jobId, job.id),
            inArray(
              vectorFile.id,
              queued.map((file) => file.id),
            ),
          ),
        )
    }

    for (const file of missed) {
      await db
        .update(vectorFile)
        .set({ status: 'failed', error: 'Upload did not complete' })
        .where(eq(vectorFile.id, file.id))

      await refundFile({
        userId: job.userId,
        jobId: job.id,
        fileId: file.id,
        note: 'upload did not complete',
      })
    }

    await db
      .update(vectorJob)
      .set({
        status: queued.length ? 'queued' : 'failed',
        filesFailed: missed.length,
        finishedAt: queued.length ? null : new Date(),
      })
      .where(eq(vectorJob.id, job.id))

    return { queued: queued.length, refunded: missed.length }
  })

export const getVectorJob = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ jobId: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    const job = await ownedJob(data.jobId, session.user.id)

    const files = await getDb()
      .select()
      .from(vectorFile)
      .where(eq(vectorFile.jobId, job.id))
      .orderBy(asc(vectorFile.filename))

    const view: VectorFileView[] = files.map((file) => ({
      id: file.id,
      filename: file.filename,
      status: file.status,
      error: file.error,
      hasSvg: Boolean(file.svgKey),
      hasEps: Boolean(file.epsKey),
    }))

    return { job: toJobView(job), files: view }
  })

/**
 * A download link, minted on the click.
 *
 * The URL is presigned and lives fifteen minutes, so it is never stored and
 * never rendered into a page that might be left open — the row holds an object
 * key, and a key is not a capability.
 */
export const getVectorDownload = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ fileId: z.string(), format: z.enum(['svg', 'eps', 'source']) }))
  .handler(async ({ data }) => {
    const session = await requireSession()

    const [file] = await getDb()
      .select()
      .from(vectorFile)
      .where(and(eq(vectorFile.id, data.fileId), eq(vectorFile.userId, session.user.id)))
      .limit(1)

    if (!file) throw new Error('No such file.')

    const key =
      data.format === 'svg' ? file.svgKey : data.format === 'eps' ? file.epsKey : file.sourceKey

    if (!key) throw new Error('That format was not produced for this file.')

    return { url: await presignGet(key), filename: downloadName(file.filename, data.format) }
  })

/**
 * Every download link for one batch, in one round trip.
 *
 * `getVectorDownload` mints one URL per click, which is right for one click.
 * A bulk save is two hundred files times three formats, and six hundred server
 * calls to fetch six hundred signatures would be slower than the transfer they
 * are for.
 *
 * Only `done` files appear. A failed one has no vectors and its original was
 * already dropped (`failFile`), so offering it would be offering a 404.
 */
export const getVectorJobDownloads = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ jobId: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    const job = await ownedJob(data.jobId, session.user.id)

    const files = await getDb()
      .select()
      .from(vectorFile)
      .where(and(eq(vectorFile.jobId, job.id), eq(vectorFile.status, 'done')))
      .orderBy(asc(vectorFile.filename))

    return {
      // A folder per batch, so two batches that both hold a `flower.png` do
      // not overwrite each other in the folder the user picked.
      folder: safeFolderName(job.label),
      files: await Promise.all(
        files.map(async (file) => ({
          fileId: file.id,
          filename: file.filename,
          source: await presignGet(file.sourceKey, true),
          svg: file.svgKey ? await presignGet(file.svgKey, true) : null,
          eps: file.epsKey ? await presignGet(file.epsKey, true) : null,
          svgName: downloadName(file.filename, 'svg'),
          epsName: downloadName(file.filename, 'eps'),
        })),
      ),
    }
  })

/**
 * A batch label is whatever somebody typed, and it is about to become a
 * directory name. Anything unsafe is replaced rather than rejected, because
 * failing a download over a colon in a name would be absurd.
 *
 * An allowlist rather than a list of forbidden characters: the forbidden set
 * differs per platform and is easy to write down wrong — a missed backslash
 * turns one label into a nested path. `\p{L}\p{N}` keeps letters and digits in
 * any script, so an Indonesian or Japanese batch name survives intact.
 */
function safeFolderName(label: string): string {
  const cleaned = label
    .replace(/[^\p{L}\p{N} ._()-]+/gu, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')

  return cleaned.slice(0, 60) || 'batch'
}

function downloadName(filename: string, format: 'svg' | 'eps' | 'source'): string {
  if (format === 'source') return filename
  return `${filename.replace(/\.[^.]+$/, '')}.${format}`
}

async function ownedJob(jobId: string, userId: string) {
  const [job] = await getDb()
    .select()
    .from(vectorJob)
    .where(and(eq(vectorJob.id, jobId), eq(vectorJob.userId, userId)))
    .limit(1)

  if (!job) throw new Error('No such job.')
  return job
}
