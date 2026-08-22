import { eq } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { auditLog, user } from '#/db/schema'

/**
 * The trail behind every action that changes what somebody can do or reach.
 *
 * Written AFTER the action it describes: the action is the truth, this is the
 * record of it. A failure here throws rather than being swallowed — an audit
 * log with silent gaps is worse than no audit log at all, because it invites a
 * trust it has not earned.
 *
 * Two rules for anything added below. Nothing secret goes in: a Gemini key may
 * appear only as its `previewOf()` form. And nothing is ever updated or
 * deleted from application code — the panel resource is read-only, and the
 * only writer is the nightly prune in `src/server.ts`.
 */

/**
 * The vocabulary. The panel's filter options are generated from this map, so
 * adding an action here is all it takes to make it filterable.
 */
export const AUDIT_ACTIONS = {
  'user.renamed': 'Renamed',
  'user.role': 'Role changed',
  'user.banned': 'Banned',
  'user.unbanned': 'Unbanned',
  'user.deleted': 'Account deleted',
  'session.revoked': 'Sessions revoked',
  'key.added': 'Key added',
  'key.deleted': 'Key deleted',
  'key.revealed': 'Key revealed to an admin',
} as const

export type AuditAction = keyof typeof AUDIT_ACTIONS

export interface AuditEntry {
  action: AuditAction
  targetType: 'user' | 'session' | 'key'
  targetId?: string | null
  /** How a human recognises the target: an email, a key preview. */
  targetLabel?: string | null
  /** One sentence of what changed — "user → admin", "3 sessions ended". */
  detail?: string | null
}

/**
 * `actorId` comes from the session, never from a request field — the same rule
 * the panel and the key store follow. The email is resolved here rather than
 * threaded through every caller, and copied into the row so a later account
 * deletion cannot quietly rewrite history.
 */
export async function recordAudit(
  actorId: string,
  entries: AuditEntry | AuditEntry[],
): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries]
  if (list.length === 0) return

  const db = getDb()

  const [actor] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, actorId))
    .limit(1)

  await db.insert(auditLog).values(
    list.map((entry) => ({
      id: crypto.randomUUID(),
      actorId,
      // The id is what stays true when the email cannot be resolved.
      actorEmail: actor?.email ?? actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      detail: entry.detail ?? null,
    })),
  )
}
