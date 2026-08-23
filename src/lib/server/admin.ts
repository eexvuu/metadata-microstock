import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, gt, gte, sum } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/index'
import { generationRun, geminiKey, runRows, session, user } from '#/db/schema'
import type { AuditEntry } from '#/lib/server/audit'
import { recordAudit } from '#/lib/server/audit'
import { decryptSecret } from '#/lib/server/crypto'
import { requireAdmin } from '#/lib/server/session'

/**
 * The admin surface.
 *
 * Every function here starts with `requireAdmin()` — the panel's rule that
 * authorisation is re-checked on the server, applied to the hand-written
 * screens too. A non-admin session is redirected, never answered.
 *
 * Two functions here return something the owner would call theirs:
 * `revealUserKey` (the plaintext of a Gemini key) and `revealRunRows` (the
 * metadata a run produced). Both exist so support can answer "it does not work
 * for me" without asking anyone to send their credential or their results over
 * a chat, and both are built the same way: they are the only paths to that data
 * outside the owner's own session, they write an audit row BEFORE they answer,
 * and the copy shown to users says an admin can do it. Every other screen here
 * sees previews and counts and nothing more.
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

    // The join is for the Open button and nothing else: whether the rows are
    // still there, never the rows themselves. Those cost a deliberate click on
    // the run's own screen, and that click is audited.
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
        resultExpiresAt: runRows.expiresAt,
      })
      .from(generationRun)
      .leftJoin(runRows, eq(runRows.runId, generationRun.id))
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
      runs: runs.map((run) => ({
        ...run,
        startedAt: run.startedAt.getTime(),
        // An expired result is the same as no result to everything upstream;
        // the row only survives until the nightly prune reaches it.
        resultExpiresAt:
          run.resultExpiresAt && run.resultExpiresAt.getTime() > Date.now()
            ? run.resultExpiresAt.getTime()
            : null,
      })),
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

/**
 * The row all three key actions below need: the key, and the email of whoever
 * owns it. Shared so a reveal, a disable and a delete cannot describe the same
 * key differently in the audit log.
 *
 * No owner filter — that is the point of an admin screen — which is exactly why
 * every caller records what it did.
 */
async function keyWithOwner(id: string) {
  const db = getDb()

  const [row] = await db
    .select({
      id: geminiKey.id,
      userId: geminiKey.userId,
      preview: geminiKey.preview,
      status: geminiKey.status,
      ciphertext: geminiKey.ciphertext,
    })
    .from(geminiKey)
    .where(eq(geminiKey.id, id))
    .limit(1)

  if (!row) throw new Error('That key no longer exists.')

  const [owner] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1)

  return { ...row, ownerEmail: owner?.email ?? row.userId }
}

/**
 * The plaintext of one key, to the admin looking at the account that owns it.
 *
 * This exists because "the app does not work for me" is almost always a dead or
 * exhausted Gemini key, and the alternative — asking the user to send their key
 * over — is worse for them than an admin reading it from a screen that records
 * the reading.
 *
 * The order below is the whole safety of it: decrypt, then write the audit row,
 * then answer. If the audit write fails the key never leaves, because a reveal
 * nobody can account for later is exactly what this must not become.
 */
export const revealUserKey = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ key: string }> => {
    const admin = await requireAdmin()
    const row = await keyWithOwner(data.id)

    // Throws on a key encrypted under a rotated ENCRYPTION_SECRET. Nothing is
    // recorded in that case, because nothing was revealed.
    const key = await decryptSecret(row.ciphertext)

    await recordAudit(admin.user.id, {
      action: 'key.revealed',
      targetType: 'key',
      targetId: row.id,
      targetLabel: row.preview,
      detail: `owner ${row.ownerEmail}`,
    })

    return { key }
  })

/**
 * Park a key without destroying it.
 *
 * The usual support case: one key of several has run out of quota, and the
 * owner's runs keep slowing down while rotation tries it. Disabling drops it
 * out of `getDecryptedKeys`, which is what the engine asks for, and the owner
 * can still see it in their own dialog.
 */
export const setUserKeyStatus = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ id: z.string().min(1), status: z.enum(['active', 'disabled']) }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin()
    const row = await keyWithOwner(data.id)

    if (row.status === data.status) return { ok: true }

    await getDb()
      .update(geminiKey)
      .set({ status: data.status })
      .where(eq(geminiKey.id, row.id))

    await recordAudit(admin.user.id, {
      action: data.status === 'active' ? 'key.enabled' : 'key.disabled',
      targetType: 'key',
      targetId: row.id,
      targetLabel: row.preview,
      detail: `owner ${row.ownerEmail}`,
    })

    return { ok: true }
  })

/**
 * Remove someone else's key.
 *
 * Final and not recoverable: the ciphertext is the only copy this app holds,
 * so the owner has to paste the key again afterwards. Prefer disabling unless
 * the key is genuinely dead — the audit row cannot bring it back.
 */
export const deleteUserKey = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin()
    const row = await keyWithOwner(data.id)

    await getDb().delete(geminiKey).where(eq(geminiKey.id, row.id))

    await recordAudit(admin.user.id, {
      action: 'key.deleted',
      targetType: 'key',
      targetId: row.id,
      targetLabel: row.preview,
      detail: `removed by an admin — owner ${row.ownerEmail}`,
    })

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

/**
 * The run, and who owns it — everything about a run except what it produced.
 *
 * Deliberately split from `revealRunRows` below. A loader runs again on every
 * navigation and every `router.invalidate()`, and an audit trail padded with
 * rows nobody chose to create is a trail nobody reads. So the screen loads from
 * here, and reading the rows costs a click.
 */
async function runWithOwner(id: string) {
  const db = getDb()

  const [row] = await db
    .select({
      id: generationRun.id,
      userId: generationRun.userId,
      tool: generationRun.tool,
      platform: generationRun.platform,
      model: generationRun.model,
      folderName: generationRun.folderName,
      filesTotal: generationRun.filesTotal,
      filesDone: generationRun.filesDone,
      fallbacks: generationRun.fallbacks,
      status: generationRun.status,
      startedAt: generationRun.startedAt,
      finishedAt: generationRun.finishedAt,
      resultExpiresAt: runRows.expiresAt,
    })
    .from(generationRun)
    .leftJoin(runRows, eq(runRows.runId, generationRun.id))
    .where(eq(generationRun.id, id))
    .limit(1)

  if (!row) throw new Error('That run no longer exists.')

  const [owner] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1)

  return {
    ...row,
    ownerName: owner?.name ?? row.userId,
    ownerEmail: owner?.email ?? row.userId,
  }
}

export const getRunForAdmin = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    const run = await runWithOwner(data.id)

    const expires = run.resultExpiresAt?.getTime() ?? null

    return {
      ...run,
      startedAt: run.startedAt.getTime(),
      finishedAt: run.finishedAt?.getTime() ?? null,
      resultExpiresAt: expires && expires > Date.now() ? expires : null,
    }
  })

/**
 * The rows one run produced, to the admin looking at it.
 *
 * The same bargain as `revealUserKey`: "the titles come out wrong" is a support
 * question that cannot be answered without seeing the titles, and the
 * alternative — asking a contributor to paste a CSV into a chat — is worse for
 * them than an admin opening a screen that records the opening. Read-only:
 * `updateRunRows` stays scoped to the owner's own session, because fixing
 * somebody's metadata for them is not support, it is editing their work.
 *
 * The order is the safety, as it is for a key: find the rows, fail if there are
 * none, then write the audit row, then answer. An expired result is refused
 * here even though the row survives until the nightly prune reaches it — seven
 * days is what the contributor was told, and an admin does not get a longer
 * window than the owner.
 */
export const revealRunRows = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ rows: string }> => {
    const admin = await requireAdmin()
    const run = await runWithOwner(data.id)

    const db = getDb()
    const [saved] = await db
      .select({ rows: runRows.rows })
      .from(runRows)
      .where(and(eq(runRows.runId, run.id), gt(runRows.expiresAt, new Date())))
      .limit(1)

    // Nothing was revealed, so nothing is recorded.
    if (!saved) throw new Error('That result has expired or was never saved.')

    await recordAudit(admin.user.id, {
      action: 'run.revealed',
      targetType: 'run',
      targetId: run.id,
      targetLabel: run.folderName,
      detail: `owner ${run.ownerEmail}`,
    })

    return { rows: saved.rows }
  })
