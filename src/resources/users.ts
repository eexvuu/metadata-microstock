import { count, inArray } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { session, user } from '#/db/schema'
import { defineResource } from '#/lib/panel/define'
import { recordAudit } from '#/lib/server/audit'

export const USER_ROLES = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
]

/**
 * The email of every id in the list, so an audit entry can name the account it
 * is about. A row action only ever receives ids, and an id stops meaning
 * anything the moment the account is gone.
 */
async function labelsFor(ids: string[]): Promise<Map<string, string>> {
  const rows = await getDb()
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.id, ids))

  return new Map(rows.map((row) => [row.id, row.email]))
}

/**
 * Every account on the platform.
 *
 * No owner column: this screen is meant to see the whole table, which is
 * exactly why every action on it is gated to `admin` — the panel refuses on
 * the server, not only in the UI. Nothing here can reach anyone's API keys:
 * the ciphertext lives in another table and is never selected.
 */
export const users = defineResource({
  name: 'users',
  label: 'User',
  pluralLabel: 'Users',
  icon: 'users',
  description: 'Everyone with a Stockflow account.',

  table: user,

  searchPlaceholder: 'Search by name or email…',

  columns: [
    {
      name: 'name',
      label: 'Name',
      column: user.name,
      sortable: true,
      searchable: true,
      primary: true,
      className: 'font-medium',
    },
    { name: 'email', label: 'Email', column: user.email, searchable: true },
    {
      name: 'role',
      label: 'Role',
      column: user.role,
      kind: 'badge',
      variants: { admin: 'default', user: 'secondary' },
    },
    { name: 'banned', label: 'Banned', column: user.banned, kind: 'boolean' },
    {
      name: 'createdAt',
      label: 'Signed up',
      column: user.createdAt,
      kind: 'date',
      sortable: true,
      align: 'right',
    },
  ],

  /** Accounts are created by signing up, never from here — hence no create. */
  fields: [
    { name: 'name', label: 'Name', required: true, max: 120 },
    {
      name: 'role',
      label: 'Role',
      kind: 'select',
      required: true,
      defaultValue: 'user',
      options: USER_ROLES,
      help: 'An admin sees this screen and everyone on it.',
    },
    {
      name: 'banReason',
      label: 'Ban reason',
      placeholder: 'Abuse, chargeback, …',
      help: 'A note for other admins — the user never sees it.',
    },
  ],

  filters: [
    { name: 'role', label: 'Role', column: user.role, options: USER_ROLES },
  ],

  defaultSort: { column: 'createdAt', dir: 'desc' },

  actions: { create: false },
  roles: { view: ['admin'], update: ['admin'], delete: ['admin'] },
  badge: true,

  rowActions: [
    {
      name: 'ban',
      label: 'Ban',
      icon: 'pause',
      variant: 'destructive',
      roles: ['admin'],
      confirm: {
        description:
          'A banned account keeps its data but cannot sign in. Reversible.',
        confirmLabel: 'Ban',
      },
      success: '{count} banned',
      handler: async (ids, ctx) => {
        // Banning yourself locks you out of the screen you are standing on.
        const others = ids.filter((id) => id !== ctx.userId)
        if (others.length === 0) {
          throw new Error('You cannot ban your own account.')
        }
        const db = getDb()
        const labels = await labelsFor(others)
        await db.update(user).set({ banned: true }).where(inArray(user.id, others))
        // Better Auth only checks the flag at sign-in, so a live session would
        // outlive the ban. Ending them is what makes the button mean "out".
        await db.delete(session).where(inArray(session.userId, others))

        await recordAudit(
          ctx.userId,
          others.map((id) => ({
            action: 'user.banned' as const,
            targetType: 'user' as const,
            targetId: id,
            targetLabel: labels.get(id) ?? id,
            detail: 'banned from the users list',
          })),
        )
      },
    },
    {
      name: 'unban',
      label: 'Unban',
      icon: 'check',
      roles: ['admin'],
      success: '{count} unbanned',
      handler: async (ids, ctx) => {
        const labels = await labelsFor(ids)
        await getDb()
          .update(user)
          .set({ banned: false, banReason: null, banExpires: null })
          .where(inArray(user.id, ids))

        await recordAudit(
          ctx.userId,
          ids.map((id) => ({
            action: 'user.unbanned' as const,
            targetType: 'user' as const,
            targetId: id,
            targetLabel: labels.get(id) ?? id,
          })),
        )
      },
    },
    {
      name: 'promote',
      label: 'Make admin',
      icon: 'check',
      roles: ['admin'],
      confirm: {
        description:
          'An admin can see every account and every run on the platform.',
        confirmLabel: 'Make admin',
      },
      success: '{count} promoted',
      handler: async (ids, ctx) => {
        const labels = await labelsFor(ids)
        await getDb()
          .update(user)
          .set({ role: 'admin' })
          .where(inArray(user.id, ids))

        await recordAudit(
          ctx.userId,
          ids.map((id) => ({
            action: 'user.role' as const,
            targetType: 'user' as const,
            targetId: id,
            targetLabel: labels.get(id) ?? id,
            // 'made admin', not 'user → admin': the action never reads the
            // prior role, and a false transition is worse here than no detail.
            detail: 'made admin',
          })),
        )
      },
    },
  ],

  /** Deleting an account cascades its keys and its run history, and is final. */
  beforeDelete: async (ids, ctx) => {
    if (ids.includes(ctx.userId)) {
      throw new Error('You cannot delete the account you are signed in with.')
    }

    const [total] = await getDb().select({ value: count() }).from(user)

    if ((total?.value ?? 0) - ids.length < 1) {
      throw new Error('There has to be one account left.')
    }

    // Recorded here rather than after the delete, because the emails only
    // exist while the rows do — and an entry that cannot name the account it
    // erased is not worth writing. The guards above have already run, so this
    // describes a deletion the panel is about to carry out.
    const labels = await labelsFor(ids)

    await recordAudit(
      ctx.userId,
      ids.map((id) => ({
        action: 'user.deleted' as const,
        targetType: 'user' as const,
        targetId: id,
        targetLabel: labels.get(id) ?? id,
        detail: 'keys and run history cascaded',
      })),
    )
  },
})
