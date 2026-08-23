import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/index'
import { generationRun, runRows } from '#/db/schema'
import { readSession, requireSession } from '#/lib/server/session'

/**
 * Run history.
 *
 * IMPORTANT: every count here is reported by the browser that did the work,
 * because that is where the engine runs. It is honest history for the person
 * looking at their own dashboard, and it is NOT a number to bill or rate-limit
 * against — a user can post whatever they like. Enforcing a real quota would
 * mean proxying the generation through the Worker (which the 10 ms CPU budget
 * rules out on the free plan) or attesting the runs some other way.
 */

/**
 * How long a saved result stays openable.
 *
 * Seven days is a working window, not storage: the box is shared and the rows
 * are the only large thing this app keeps. The counts in `generation_run`
 * outlive it — what expires is the editable result, not the history.
 */
export const RESULT_DAYS = 7

/**
 * 2 MB of JSON. A 500-file run is around 300 KB, so this is generous enough
 * that nobody meets it by accident and small enough that nobody can park a
 * gigabyte of text on a shared box.
 */
const MAX_RESULT_BYTES = 2_000_000

export interface RunSummary {
  id: string
  platform: string
  model: string
  folderName: string
  sourceMode: string
  filesTotal: number
  filesDone: number
  fallbacks: number
  status: string
  startedAt: number
  finishedAt: number | null
  /** Epoch ms the saved result disappears, or null when there is none left. */
  resultExpiresAt: number | null
}

export const startRun = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      platform: z.enum(['adobe', 'shutterstock']),
      model: z.string().max(120),
      folderName: z.string().max(400),
      sourceMode: z.enum(['folder', 'files']),
      filesTotal: z.number().int().min(0).max(100000),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    const id = crypto.randomUUID()

    await getDb().insert(generationRun).values({
      id,
      userId: session.user.id,
      platform: data.platform,
      model: data.model,
      folderName: data.folderName,
      sourceMode: data.sourceMode,
      filesTotal: data.filesTotal,
      status: 'running',
    })

    return { id }
  })

export const finishRun = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string(),
      filesDone: z.number().int().min(0).max(100000),
      fallbacks: z.number().int().min(0).max(100000),
      status: z.enum(['complete', 'partial', 'error']),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()

    await getDb()
      .update(generationRun)
      .set({
        filesDone: data.filesDone,
        fallbacks: data.fallbacks,
        status: data.status,
        finishedAt: new Date(),
      })
      // Scoped to the owner: a run id is not a capability.
      .where(and(eq(generationRun.id, data.id), eq(generationRun.userId, session.user.id)))

    return { ok: true }
  })

/**
 * The one number on the public landing page.
 *
 * Deliberately unauthenticated and deliberately two integers: how many runs
 * have happened and how many files came out of them, across everybody. No
 * session, no folder names, no owner — nothing here narrows to a person.
 *
 * Same warning as the rest of this file applies: the browser reports the
 * counts, so this is a marketing number, not an audited one.
 */
export const getPublicStats = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ runs: number; files: number }> => {
    const [row] = await getDb()
      .select({
        runs: sql<number>`count(*)`,
        files: sql<number>`coalesce(sum(${generationRun.filesDone}), 0)`,
      })
      .from(generationRun)

    return { runs: Number(row?.runs ?? 0), files: Number(row?.files ?? 0) }
  },
)

export const listRuns = createServerFn({ method: 'GET' }).handler(
  async (): Promise<RunSummary[]> => {
    const session = await readSession()
    if (!session) return []

    // Left join, and `rows` is deliberately not selected: this screen shows
    // whether a result is still there and when it goes, never the result.
    const rows = await getDb()
      .select({ run: generationRun, expiresAt: runRows.expiresAt })
      .from(generationRun)
      .leftJoin(runRows, eq(runRows.runId, generationRun.id))
      .where(eq(generationRun.userId, session.user.id))
      .orderBy(desc(generationRun.startedAt))
      .limit(25)

    const now = Date.now()

    return rows.map(({ run, expiresAt }) => ({
      id: run.id,
      platform: run.platform,
      model: run.model,
      folderName: run.folderName,
      sourceMode: run.sourceMode,
      filesTotal: run.filesTotal,
      filesDone: run.filesDone,
      fallbacks: run.fallbacks,
      status: run.status,
      startedAt: run.startedAt.getTime(),
      finishedAt: run.finishedAt?.getTime() ?? null,
      // Treated as gone the moment it is due, rather than whenever the nightly
      // prune next runs — otherwise the screen offers a link for a few hours
      // that the detail page then refuses.
      resultExpiresAt:
        expiresAt && expiresAt.getTime() > now ? expiresAt.getTime() : null,
    }))
  },
)

/**
 * Keep what a run produced, so it can be opened and edited later.
 *
 * The payload is user content coming from a browser, so it gets the same two
 * checks as everything else here: the run has to belong to the session, and
 * the JSON has to fit. A run id is not a capability.
 *
 * Saving is best-effort from the caller's point of view — a run that finished
 * is finished whether or not this succeeded. The tool toasts the failure and
 * keeps the CSV in the tab.
 */
export const saveRunRows = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      runId: z.string().min(1),
      /** Serialised on the client; this side never looks inside it. */
      rows: z.string().min(2).max(MAX_RESULT_BYTES),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    const db = getDb()

    const [run] = await db
      .select({
        id: generationRun.id,
        platform: generationRun.platform,
        folderName: generationRun.folderName,
      })
      .from(generationRun)
      .where(
        and(
          eq(generationRun.id, data.runId),
          eq(generationRun.userId, session.user.id),
        ),
      )
      .limit(1)

    if (!run) throw new Error('That run is not yours, or no longer exists.')

    const expiresAt = new Date(Date.now() + RESULT_DAYS * 24 * 60 * 60 * 1000)

    await db
      .insert(runRows)
      .values({
        runId: run.id,
        userId: session.user.id,
        platform: run.platform,
        folderName: run.folderName,
        rows: data.rows,
        expiresAt,
      })
      // Re-running the same id overwrites rather than failing; the expiry is
      // set once, on the way in, and editing later does not push it back.
      .onConflictDoUpdate({
        target: runRows.runId,
        set: { rows: data.rows },
      })

    return { expiresAt: expiresAt.getTime() }
  })

export interface SavedResult {
  runId: string
  platform: 'adobe' | 'shutterstock'
  folderName: string
  rows: string
  expiresAt: number
}

/**
 * One saved result, for its owner.
 *
 * Filters on the expiry as well as the owner, so a result reads as gone the
 * moment it is due rather than whenever the nightly prune gets to it.
 */
export const getRunRows = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ runId: z.string().min(1) }))
  .handler(async ({ data }): Promise<SavedResult | null> => {
    const session = await requireSession()

    const [row] = await getDb()
      .select()
      .from(runRows)
      .where(
        and(
          eq(runRows.runId, data.runId),
          eq(runRows.userId, session.user.id),
          gt(runRows.expiresAt, new Date()),
        ),
      )
      .limit(1)

    if (!row) return null

    return {
      runId: row.runId,
      platform: row.platform === 'shutterstock' ? 'shutterstock' : 'adobe',
      folderName: row.folderName,
      rows: row.rows,
      expiresAt: row.expiresAt.getTime(),
    }
  })

/** Edits from the history screen. Same two checks, and the expiry is untouched. */
export const updateRunRows = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      runId: z.string().min(1),
      rows: z.string().min(2).max(MAX_RESULT_BYTES),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()

    await getDb()
      .update(runRows)
      .set({ rows: data.rows })
      .where(
        and(
          eq(runRows.runId, data.runId),
          eq(runRows.userId, session.user.id),
          gt(runRows.expiresAt, new Date()),
        ),
      )

    return { ok: true }
  })
