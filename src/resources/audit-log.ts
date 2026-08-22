import { auditLog } from '#/db/schema'
import { defineResource } from '#/lib/panel/define'
import { AUDIT_ACTIONS } from '#/lib/server/audit'

const ACTIONS = Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({
  value,
  label,
}))

const TARGETS = [
  { value: 'user', label: 'Account' },
  { value: 'session', label: 'Session' },
  { value: 'key', label: 'Key' },
]

/**
 * The trail: who changed what, and when.
 *
 * Every action is off — create, update and delete alike. A log an admin can
 * edit from the screen that displays it is not evidence of anything, and there
 * is no legitimate reason to write a row here by hand; the only writer is
 * `recordAudit`, and the only remover is the nightly prune in `src/server.ts`.
 *
 * No join to `user`: the actor's email is denormalised into the row on purpose,
 * so an entry about a deleted account still reads properly.
 */
export const auditLogs = defineResource({
  name: 'audit',
  label: 'Audit entry',
  pluralLabel: 'Audit log',
  icon: 'archive',
  description: 'Every change an admin made, and every key an account added.',

  table: auditLog,

  searchPlaceholder: 'Search by account, target or detail…',

  columns: [
    {
      name: 'createdAt',
      label: 'When',
      column: auditLog.createdAt,
      kind: 'datetime',
      sortable: true,
    },
    {
      name: 'actorEmail',
      label: 'Actor',
      column: auditLog.actorEmail,
      searchable: true,
      primary: true,
      className: 'font-mono text-xs',
    },
    {
      name: 'action',
      label: 'Action',
      column: auditLog.action,
      kind: 'badge',
      variants: {
        'user.banned': 'destructive',
        'user.deleted': 'destructive',
        'user.role': 'default',
        'session.revoked': 'secondary',
        'key.added': 'outline',
        'key.deleted': 'outline',
      },
    },
    {
      name: 'targetLabel',
      label: 'Target',
      column: auditLog.targetLabel,
      searchable: true,
      className: 'font-mono text-xs',
    },
    {
      name: 'detail',
      label: 'Detail',
      column: auditLog.detail,
      searchable: true,
      className: 'text-muted-foreground text-xs',
    },
  ],

  filters: [
    { name: 'action', label: 'Action', column: auditLog.action, options: ACTIONS },
    {
      name: 'targetType',
      label: 'Target',
      column: auditLog.targetType,
      options: TARGETS,
    },
  ],

  defaultSort: { column: 'createdAt', dir: 'desc' },

  actions: { create: false, update: false, delete: false },
  roles: { view: ['admin'] },
})
