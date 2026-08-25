import { and, asc, eq, lt, sql } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { vectorFile, vectorJob } from '#/db/schema'
import { deleteObject, objectKeys, presignGet, presignPut } from '#/lib/server/r2'
import { refundFile } from '#/lib/server/tokens'

/**
 * The queue, from the worker's side.
 *
 * **Why there is a queue at all.** The vectorizer's web backend is a real
 * browser signed in to vectorizer.ai, plus a CAPTCHA solver — Playwright,
 * Chromium and a Whisper model. None of that fits in a 768 MB unit sharing two
 * cores with MySQL and a dozen vhosts, and none of it should: it is
 * long-running, interactive work that occasionally needs a human to look at a
 * picture of a traffic light. So this box does not vectorize anything. It
 * holds the queue, the tokens and the bucket, and a worker on somebody's own
 * machine — the `vectorizer` repo, unchanged — claims one file at a time.
 *
 * **A claim is a lease, not a handover.** A worker that dies mid-file (a
 * closed laptop, a lost network) leaves a row at `running` forever otherwise.
 * `reclaimStaleLeases` puts it back, and that is why `attempts` exists: a file
 * that keeps killing its worker must eventually fail and refund rather than
 * cycle for a month.
 *
 * **The bytes never come through here.** The worker is handed presigned URLs
 * and talks to R2 directly — see `src/lib/server/r2.ts`.
 */

/**
 * How long a worker may hold a file before the queue assumes it is gone. A web
 * vectorize with a CAPTCHA in the middle can genuinely take twenty minutes, so
 * this is generous; the cost of it being too short is a file done twice.
 */
const LEASE_MINUTES = 45

/**
 * Two goes at a file that fails in a way that might not be the file's fault —
 * a rate limit, a dead session, a reclaimed lease. A worker that says the
 * failure is permanent skips straight to the refund.
 */
const MAX_ATTEMPTS = 2

export interface ClaimedFile {
  fileId: string
  jobId: string
  filename: string
  attempt: number
  /** Where to GET the original. */
  source: string
  /** Where to PUT each result. */
  upload: { svg: string; eps: string }
  leaseExpiresAt: number
}

/**
 * Hands out one file, or null when the queue is empty.
 *
 * The claim is a compare-and-set: the UPDATE carries `status = 'queued'` in its
 * own WHERE, so two workers racing on the same row produce one winner and one
 * empty `returning()` rather than the same image vectorized twice. The loop is
 * what turns the loser into "try the next row" instead of "come back later".
 */
export async function claimNextFile(worker: string): Promise<ClaimedFile | null> {
  const db = getDb()

  for (let attempt = 0; attempt < 5; attempt++) {
    const [next] = await db
      .select()
      .from(vectorFile)
      .where(eq(vectorFile.status, 'queued'))
      .orderBy(asc(vectorFile.createdAt))
      .limit(1)

    if (!next) return null

    const leasedAt = new Date()

    const [claimed] = await db
      .update(vectorFile)
      .set({
        status: 'running',
        leasedAt,
        leaseBy: worker,
        attempts: sql`${vectorFile.attempts} + 1`,
      })
      .where(and(eq(vectorFile.id, next.id), eq(vectorFile.status, 'queued')))
      .returning()

    if (!claimed) continue

    await db
      .update(vectorJob)
      .set({ status: 'running' })
      .where(and(eq(vectorJob.id, claimed.jobId), eq(vectorJob.status, 'queued')))

    const keys = objectKeys(claimed.userId, claimed.jobId, claimed.id)

    return {
      fileId: claimed.id,
      jobId: claimed.jobId,
      filename: claimed.filename,
      attempt: claimed.attempts,
      source: await presignGet(claimed.sourceKey),
      upload: {
        svg: await presignPut(keys.svg),
        eps: await presignPut(keys.eps),
      },
      leaseExpiresAt: leasedAt.getTime() + LEASE_MINUTES * 60_000,
    }
  }

  return null
}

/**
 * The worker reporting that both formats are in the bucket.
 *
 * It names the formats it uploaded rather than being trusted for the whole
 * result: a run that produced an SVG and lost the EPS is a partial success
 * worth keeping, and `hasSvg`/`hasEps` on the screen is what says so.
 */
export async function completeFile(input: {
  fileId: string
  formats: { svg?: boolean; eps?: boolean }
}): Promise<void> {
  const db = getDb()

  const [file] = await db.select().from(vectorFile).where(eq(vectorFile.id, input.fileId)).limit(1)
  if (!file) throw new Error('No such file.')

  const keys = objectKeys(file.userId, file.jobId, file.id)

  await db
    .update(vectorFile)
    .set({
      status: 'done',
      error: null,
      leasedAt: null,
      leaseBy: null,
      svgKey: input.formats.svg ? keys.svg : null,
      epsKey: input.formats.eps ? keys.eps : null,
    })
    .where(eq(vectorFile.id, file.id))

  await settleJob(file.jobId)
}

/**
 * The worker reporting that it could not do this one.
 *
 * The refund happens HERE and only here for a processing failure, and only
 * once the file is genuinely out of attempts — putting it back on the queue
 * with its token already returned would let a retry succeed for free. The
 * refund itself is idempotent (see `refundFile`), so a duplicate report costs
 * a constraint violation rather than a token.
 */
export async function failFile(input: {
  fileId: string
  reason: string
  retryable: boolean
}): Promise<{ requeued: boolean }> {
  const db = getDb()

  const [file] = await db.select().from(vectorFile).where(eq(vectorFile.id, input.fileId)).limit(1)
  if (!file) throw new Error('No such file.')

  // A worker error message can quote a login page or a URL with a token in it.
  // One line, clipped, is all a screen needs and all this table should hold.
  const reason = input.reason.split('\n')[0].slice(0, 300)

  if (input.retryable && file.attempts < MAX_ATTEMPTS) {
    await db
      .update(vectorFile)
      .set({ status: 'queued', error: reason, leasedAt: null, leaseBy: null })
      .where(eq(vectorFile.id, file.id))

    return { requeued: true }
  }

  await db
    .update(vectorFile)
    .set({ status: 'failed', error: reason, leasedAt: null, leaseBy: null })
    .where(eq(vectorFile.id, file.id))

  await refundFile({
    userId: file.userId,
    jobId: file.jobId,
    fileId: file.id,
    note: reason,
  })

  // Nobody will ever download the original of a file that failed, and the
  // lifecycle rule is a backstop rather than a plan. Best-effort: a bucket
  // that refuses the delete must not turn a refund into an exception.
  await deleteObject(file.sourceKey).catch(() => {})

  await settleJob(file.jobId)

  return { requeued: false }
}

/**
 * Recomputes a job's counters from its own files.
 *
 * Counted rather than incremented on purpose: an increment is a number that
 * can be applied twice by a retried report, and these counters are what the
 * screen and the admin panel read. Counting a few hundred rows costs nothing
 * and cannot drift — the same argument the token balance makes.
 */
export async function settleJob(jobId: string): Promise<void> {
  const db = getDb()

  const files = await db
    .select({ status: vectorFile.status })
    .from(vectorFile)
    .where(eq(vectorFile.jobId, jobId))

  const done = files.filter((file) => file.status === 'done').length
  const failed = files.filter((file) => file.status === 'failed').length
  const settled = done + failed === files.length
  const working = files.some((file) => file.status === 'queued' || file.status === 'running')

  await db
    .update(vectorJob)
    .set({
      filesDone: done,
      filesFailed: failed,
      // `working` rather than `!settled`: a job whose siblings are still
      // awaiting upload has not started, and calling that "running" makes the
      // screen claim a worker has it when nothing does.
      status: settled
        ? failed === 0
          ? 'complete'
          : done === 0
            ? 'failed'
            : 'partial'
        : working
          ? 'running'
          : 'uploading',
      finishedAt: settled ? new Date() : null,
    })
    .where(eq(vectorJob.id, jobId))
}

/**
 * Puts back everything a dead worker was holding.
 *
 * Runs nightly and again whenever a worker asks for something to do, because a
 * queue that only heals at 3am is a queue that looks empty all evening.
 */
export async function reclaimStaleLeases(): Promise<number> {
  const cutoff = new Date(Date.now() - LEASE_MINUTES * 60_000)

  const stale = await getDb()
    .update(vectorFile)
    .set({
      status: 'queued',
      leasedAt: null,
      leaseBy: null,
      error: 'The worker stopped responding — put back on the queue',
    })
    .where(and(eq(vectorFile.status, 'running'), lt(vectorFile.leasedAt, cutoff)))
    .returning({ id: vectorFile.id, jobId: vectorFile.jobId, attempts: vectorFile.attempts })

  // A file that has burned its attempts goes through the normal failure path,
  // refund included — reclaiming it forever would be a token quietly kept.
  for (const file of stale) {
    if (file.attempts >= MAX_ATTEMPTS) {
      await failFile({
        fileId: file.id,
        reason: 'The worker stopped responding',
        retryable: false,
      })
    }
  }

  return stale.length
}

/**
 * Refunds files whose bytes never arrived.
 *
 * `startVectorJob` handles the common case, when the browser is still there to
 * say what it managed to upload. This is the other one: the tab was closed
 * mid-upload, so nobody ever spoke for those rows. An hour is long enough that
 * a slow upload is not mistaken for an abandoned one.
 */
export async function refundAbandonedUploads(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000)

  const abandoned = await getDb()
    .update(vectorFile)
    .set({ status: 'failed', error: 'Upload never completed' })
    .where(and(eq(vectorFile.status, 'awaiting_upload'), lt(vectorFile.createdAt, cutoff)))
    .returning({
      id: vectorFile.id,
      jobId: vectorFile.jobId,
      userId: vectorFile.userId,
      sourceKey: vectorFile.sourceKey,
    })

  for (const file of abandoned) {
    await refundFile({
      userId: file.userId,
      jobId: file.jobId,
      fileId: file.id,
      note: 'upload never completed',
    })
    // A half-finished multipart PUT can still have left an object behind.
    await deleteObject(file.sourceKey).catch(() => {})
    await settleJob(file.jobId)
  }

  return abandoned.length
}
