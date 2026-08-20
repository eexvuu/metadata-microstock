import { count, inArray } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { session, user } from '#/db/schema'
import { defineResource } from '#/lib/panel/define'

export const USER_ROLES = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
]

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
        await db.update(user).set({ banned: true }).where(inArray(user.id, others))
        // Better Auth only checks the flag at sign-in, so a live session would
        // outlive the ban. Ending them is what makes the button mean "out".
        await db.delete(session).where(inArray(session.userId, others))
      },
    },
    {
      name: 'unban',
      label: 'Unban',
      icon: 'check',
      roles: ['admin'],
      success: '{count} unbanned',
      handler: async (ids) => {
        await getDb()
          .update(user)
          .set({ banned: false, banReason: null, banExpires: null })
          .where(inArray(user.id, ids))
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
      handler: async (ids) => {
        await getDb()
          .update(user)
          .set({ role: 'admin' })
          .where(inArray(user.id, ids))
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
  },
})
