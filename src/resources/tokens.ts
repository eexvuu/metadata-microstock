import { eq } from 'drizzle-orm'

import { tokenLedger, user } from '#/db/schema'
import { defineResource } from '#/lib/panel/define'

const REASONS = [
  { value: 'grant', label: 'Grant' },
  { value: 'spend', label: 'Spend' },
  { value: 'refund', label: 'Refund' },
  { value: 'adjust', label: 'Adjust' },
]

/**
 * The token ledger, and the only screen that can put tokens on an account.
 *
 * Create is ON, update and delete are OFF, and that asymmetry is the whole
 * design: the ledger is append-only (see `src/db/schema.ts`), a balance is the
 * sum of its rows, and a row you can edit is a balance that can be rewritten
 * after the fact. Granting is therefore *writing a row*, which is why the form
 * asks for a user id and a delta rather than for a new balance.
 *
 * A negative delta is how tokens are taken back — the same row, the same
 * audit trail, no second code path.
 *
 * Global, so admin-gated like `users` and `runs`. There is no user-facing
 * version of this screen: an ordinary account sees its own balance and its
 * last few entries inside the tool, and nothing else.
 */
export const tokens = defineResource({
  name: 'tokens',
  label: 'Token entry',
  pluralLabel: 'Tokens',
  icon: 'credit-card',
  description: 'Every token granted, spent or refunded. Append-only.',

  table: tokenLedger,
  joins: [{ table: user, on: eq(tokenLedger.userId, user.id) }],

  searchPlaceholder: 'Search the note…',

  columns: [
    { name: 'account', label: 'Account', column: user.email, primary: true },
    {
      name: 'delta',
      label: 'Delta',
      column: tokenLedger.delta,
      kind: 'number',
      sortable: true,
      align: 'right',
    },
    {
      name: 'reason',
      label: 'Reason',
      column: tokenLedger.reason,
      kind: 'badge',
      variants: {
        grant: 'default',
        refund: 'secondary',
        spend: 'outline',
        adjust: 'destructive',
      },
    },
    {
      name: 'note',
      label: 'Note',
      column: tokenLedger.note,
      searchable: true,
      className: 'font-mono text-xs',
    },
    { name: 'actorEmail', label: 'Granted by', column: tokenLedger.actorEmail },
    {
      name: 'createdAt',
      label: 'When',
      column: tokenLedger.createdAt,
      kind: 'datetime',
      sortable: true,
      align: 'right',
    },
  ],

  fields: [
    {
      name: 'userId',
      label: 'Account id',
      required: true,
      help: 'The user id from the Users screen — not the email.',
    },
    {
      name: 'delta',
      label: 'Tokens',
      kind: 'number',
      required: true,
      help: 'Positive to grant, negative to take back. One token buys one image.',
    },
    {
      name: 'reason',
      label: 'Reason',
      kind: 'select',
      required: true,
      options: REASONS,
      defaultValue: 'grant',
    },
    { name: 'note', label: 'Note', placeholder: 'Why this entry exists' },
    {
      name: 'actorEmail',
      label: 'Granted by',
      placeholder: 'your@email',
      help: 'Who authorised it. Copied in rather than joined, like the audit log.',
    },
  ],

  filters: [
    { name: 'reason', label: 'Reason', column: tokenLedger.reason, options: REASONS },
  ],

  defaultSort: { column: 'createdAt', dir: 'desc' },

  actions: { create: true, update: false, delete: false },
  roles: { view: ['admin'], create: ['admin'] },
})
