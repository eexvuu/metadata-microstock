import { count, gte, lt, sum } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { auditLog, generationRun, runMedia, runRows, usageDaily } from '#/db/schema'
import { RESULT_DAYS } from '#/lib/server/runs'
import { reclaimStaleLeases, refundAbandonedUploads } from '#/lib/server/vector-queue'

/**
 * The nightly housekeeping, run by `stockflow-cron.timer`.
 *
 * This was the Worker's `scheduled()` handler. Two things moved with it: the
 * rollup now lands in a table rather than KV — there is no KV here, and it was
 * never worth a dependency — and the audit prune is unchanged.
 *
 * Shares the server's bundle and runs behind `--cron`, rather than being a
 * second build to keep in step with the first. It still exits when it is done,
 * so a failure is one red unit in `systemctl list-timers`, not a silent skip.
 */
const DAY = 24 * 60 * 60 * 1000
const AUDIT_RETENTION_DAYS = 180

export async function runNightly() {
  const db = getDb()
  const since = new Date(Date.now() - DAY)

  const [today] = await db
    .select({
      runs: count(generationRun.id),
      files: sum(generationRun.filesDone),
    })
    .from(generationRun)
    .where(gte(generationRun.startedAt, since))

  const day = new Date().toISOString().slice(0, 10)

  await db
    .insert(usageDaily)
    .values({
      day,
      runs: today?.runs ?? 0,
      files: Number(today?.files ?? 0),
    })
    .onConflictDoUpdate({
      target: usageDaily.day,
      set: { runs: today?.runs ?? 0, files: Number(today?.files ?? 0) },
    })

  // The audit log is the one table here that only grows. Six months answers
  // "who banned this account" and keeps the file off the disk budget.
  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * DAY)
  await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff))

  // Saved run results are the only thing here that grows with use rather
  // than with time. Thirty days from the save, never extended by editing —
  // `getRunRows` already refuses an expired one, so this is reclaiming disk,
  // not enforcing the rule.
  const expired = await db
    .delete(runRows)
    .where(lt(runRows.expiresAt, new Date()))
    .returning({ runId: runRows.runId })

  /*
   * The pointers to a run's archived originals, on the same clock as the rows.
   *
   * This one IS the rule rather than a disk reclaim, and it is the parity that
   * makes `revealRunMedia` defensible: R2's lifecycle rule owns the bytes, and
   * without this an admin would keep a card — and a working link, until the
   * bucket got round to the object — after the month the contributor was told
   * about had passed. Rows only. Nothing here deletes an object, because two
   * mechanisms deleting the same bytes on different clocks is how a row ends up
   * promising a file that is not there.
   */
  const staleMedia = await db
    .delete(runMedia)
    .where(lt(runMedia.createdAt, new Date(Date.now() - RESULT_DAYS * DAY)))
    .returning({ id: runMedia.id })

  // The vectorizer's two, and both hand tokens back: a worker died holding a
  // file, or a tab was closed mid-upload. A night these do not run is a night
  // somebody is short, so they are wrapped rather than awaited bare — R2 being
  // unreachable must not take the rollup down with it.
  //
  // There is no result pruner here. Retention is an R2 lifecycle rule now; see
  // the note at the top of `src/lib/server/vector.ts`.
  let vectors = { reclaimed: 0, refunded: 0 }
  try {
    vectors = {
      reclaimed: await reclaimStaleLeases(),
      refunded: await refundAbandonedUploads(),
    }
  } catch (error) {
    console.error('[cron] vector housekeeping failed', error)
  }

  console.log(
    `[cron] ${day}: ${today?.runs ?? 0} runs, ${Number(today?.files ?? 0)} files; ` +
      `${expired.length} expired results removed; ${staleMedia.length} archived originals unlisted; ` +
      `audit pruned before ${cutoff.toISOString().slice(0, 10)}; ` +
      `vector: ${vectors.reclaimed} leases reclaimed, ${vectors.refunded} uploads refunded`,
  )
}
