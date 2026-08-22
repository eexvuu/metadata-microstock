import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, gte, sum } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/index'
import { generationRun, geminiKey, session, user } from '#/db/schema'
import type { AuditEntry } from '#/lib/server/audit'
import { recordAudit } from '#/lib/server/audit'
import { requireAdmin } from '#/lib/server/session'

/**
 * The admin surface.
 *
 * Every function here starts with `requireAdmin()` — the panel's rule that
 * authorisation is re-checked on the server, applied to the hand-written
 * screens too. A non-admin session is redirected, never answered.
 *
 * One thing this module will never do: return a key. `gemini_key.ciphertext`
 * is not selected anywhere below, and the plaintext is only ever decrypted for
 * the key's own owner (`src/lib/server/gemini-keys.ts`). An admin can see that
 * someone has three keys and when they were last used; that is all.
 */

const DAY = 24 * 60 * 60 * 1000

export const getAdminOverview = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin()
    const db = getDb()
    const weekAgo = new Date(Date.now() - 7 * DAY)

    const [users] = await db.select({ value: count() }).from(user)
    const [newUsers] = await db
      .select({ value: count() })
      .from(user)
      .where(gte(user.createdAt, weekAgo))
    const [banned] = await db
      .select({ value: count() })
      .from(user)
      .where(eq(user.banned, true))
    const [runs] = await db
      .select({ value: count(), files: sum(generationRun.filesDone) })
      .from(generationRun)
    const [runsWeek] = await db
      .select({ value: count(), files: sum(generationRun.filesDone) })
      .from(generationRun)
      .where(gte(generationRun.startedAt, weekAgo))
    const [keys] = await db.select({ value: count() }).from(geminiKey)

    const recent = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(8)

    return {
      users: users?.value ?? 0,
      newUsers: newUsers?.value ?? 0,
      banned: banned?.value ?? 0,
      keys: keys?.value ?? 0,
      runs: runs?.value ?? 0,
      files: Number(runs?.files ?? 0),
      runsWeek: runsWeek?.value ?? 0,
      filesWeek: Number(runsWeek?.files ?? 0),
      recent: recent.map((row) => ({
        ...row,
        role: row.role ?? 'user',
        banned: Boolean(row.banned),
        createdAt: row.createdAt.getTime(),
      })),
    }
  },
)

export const getUserDetail = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    const db = getDb()

    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, data.id))
      .limit(1)

    if (!row) throw new Error('That account no longer exists.')

    /** Previews only — the ciphertext column is deliberately not selected. */
    const keys = await db
      .select({
        id: geminiKey.id,
        label: geminiKey.label,
        preview: geminiKey.preview,
        status: geminiKey.status,
        lastUsedAt: geminiKey.lastUsedAt,
      })
      .from(geminiKey)
      .where(eq(geminiKey.userId, data.id))
      .orderBy(desc(geminiKey.createdAt))

    const runs = await db
      .select({
        id: generationRun.id,
        tool: generationRun.tool,
        platform: generationRun.platform,
        folderName: generationRun.folderName,
        filesDone: generationRun.filesDone,
        filesTotal: generationRun.filesTotal,
        status: generationRun.status,
        startedAt: generationRun.startedAt,
      })
      .from(generationRun)
      .where(eq(generationRun.userId, data.id))
      .orderBy(desc(generationRun.startedAt))
      .limit(15)

    const [totals] = await db
      .select({ runs: count(), files: sum(generationRun.filesDone) })
      .from(generationRun)
      .where(eq(generationRun.userId, data.id))

    const [sessions] = await db
      .select({ value: count() })
      .from(session)
      .where(and(eq(session.userId, data.id), gte(session.expiresAt, new Date())))

    return {
      user: {
        ...row,
        role: row.role ?? 'user',
        banned: Boolean(row.banned),
        emailVerified: Boolean(row.emailVerified),
        createdAt: row.createdAt.getTime(),
      },
      keys: keys.map((key) => ({
        ...key,
        lastUsedAt: key.lastUsedAt?.getTime() ?? null,
      })),
      runs: runs.map((run) => ({ ...run, startedAt: run.startedAt.getTime() })),
      totals: {
        runs: totals?.runs ?? 0,
        files: Number(totals?.files ?? 0),
        keys: keys.length,
        sessions: sessions?.value ?? 0,
      },
    }
  })

export const updateUserAdmin = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(120),
      role: z.enum(['user', 'admin']),
      banned: z.boolean(),
      banReason: z.string().max(400).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin()

    // Two ways to lock yourself out of the admin area, both blocked here
    // rather than only hidden in the UI.
    if (data.id === admin.user.id && data.role !== 'admin') {
      throw new Error('You cannot remove your own admin role.')
    }
    if (data.id === admin.user.id && data.banned) {
      throw new Error('You cannot ban your own account.')
    }

    const db = getDb()

    // Read the row before touching it. The audit entries below describe a
    // change, and "banned: true" on its own says nothing about what it was.
    const [before] = await db
      .select({
        email: user.email,
        name: user.name,
        role: user.role,
        banned: user.banned,
      })
      .from(user)
      .where(eq(user.id, data.id))
      .limit(1)

    if (!before) throw new Error('That account no longer exists.')

    await db
      .update(user)
      .set({
        name: data.name,
        role: data.role,
        banned: data.banned,
        banReason: data.banned ? (data.banReason ?? null) : null,
        banExpires: null,
      })
      .where(eq(user.id, data.id))

    // The flag is only read at sign-in, so a ban has to end the live sessions
    // as well or the account keeps working until they expire.
    if (data.banned) {
      await db.delete(session).where(eq(session.userId, data.id))
    }

    const wasBanned = Boolean(before.banned)
    const wasRole = before.role ?? 'user'
    const target = {
      targetType: 'user',
      targetId: data.id,
      targetLabel: before.email,
    } as const

    const entries: AuditEntry[] = []

    if (before.name !== data.name) {
      entries.push({
        ...target,
        action: 'user.renamed',
        detail: `${before.name} → ${data.name}`,
      })
    }
    if (wasRole !== data.role) {
      entries.push({
        ...target,
        action: 'user.role',
        detail: `${wasRole} → ${data.role}`,
      })
    }
    if (!wasBanned && data.banned) {
      entries.push({
        ...target,
        action: 'user.banned',
        detail: data.banReason?.trim() || 'no reason given',
      })
    }
    if (wasBanned && !data.banned) {
      entries.push({ ...target, action: 'user.unbanned' })
    }

    // A save that changed nothing leaves no trace: an audit list padded with
    // no-ops is a list nobody reads.
    await recordAudit(admin.user.id, entries)

    return { ok: true }
  })

/** Signs an account out everywhere — the blunt instrument for a stolen laptop. */
export const revokeUserSessions = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin()
    const db = getDb()

    const [target] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, data.id))
      .limit(1)

    // Counted before the delete, because afterwards there is nothing to count
    // and "signed them out" without a number tells an admin very little.
    const [live] = await db
      .select({ value: count() })
      .from(session)
      .where(eq(session.userId, data.id))

    await db.delete(session).where(eq(session.userId, data.id))

    const ended = live?.value ?? 0

    await recordAudit(admin.user.id, {
      action: 'session.revoked',
      targetType: 'user',
      targetId: data.id,
      targetLabel: target?.email ?? data.id,
      detail: `${ended} session${ended === 1 ? '' : 's'} ended`,
    })

    return { ok: true }
  })
