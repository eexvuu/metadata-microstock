import { count, gte, lt, sum } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { auditLog, generationRun, usageDaily } from '#/db/schema'

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

  console.log(
    `[cron] ${day}: ${today?.runs ?? 0} runs, ${Number(today?.files ?? 0)} files; audit pruned before ${cutoff.toISOString().slice(0, 10)}`,
  )
}
