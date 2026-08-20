import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/index'
import { generationRun } from '#/db/schema'
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

export const listRuns = createServerFn({ method: 'GET' }).handler(
  async (): Promise<RunSummary[]> => {
    const session = await readSession()
    if (!session) return []

    const rows = await getDb()
      .select()
      .from(generationRun)
      .where(eq(generationRun.userId, session.user.id))
      .orderBy(desc(generationRun.startedAt))
      .limit(25)

    return rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      model: row.model,
      folderName: row.folderName,
      sourceMode: row.sourceMode,
      filesTotal: row.filesTotal,
      filesDone: row.filesDone,
      fallbacks: row.fallbacks,
      status: row.status,
      startedAt: row.startedAt.getTime(),
      finishedAt: row.finishedAt?.getTime() ?? null,
    }))
  },
)
