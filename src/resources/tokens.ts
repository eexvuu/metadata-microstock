import { eq } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { tokenLedger, user } from '#/db/schema'
import { defineResource } from '#/lib/panel/define'

const REASONS = [
  { value: 'signup', label: 'Signup' },
  { value: 'grant', label: 'Grant' },
  { value: 'spend', label: 'Spend' },
  { value: 'refund', label: 'Refund' },
  { value: 'adjust', label: 'Adjust' },
]

/**
 * What the form offers, which is not the same list.
 *
 * `signup` is the trial credit and there is a partial unique index that allows
 * exactly one per account — an admin picking it from a dropdown would get a
 * constraint error instead of a row, and "the database said no" is a worse
 * answer than not offering it. A human adding tokens is granting.
 */
const WRITABLE_REASONS = REASONS.filter((reason) => reason.value !== 'signup')

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
 * Most rows here are now written by the machine rather than by an admin: every
 * account gets a `signup` entry the first time it is seen, and the queue writes
 * `spend` and `refund` as batches move. This screen is where somebody tops an
 * account up past its trial, and where the rest of it can be read.
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
  group: 'vectorizer',
  description: 'Every token granted, spent or refunded. Append-only.',

  table: tokenLedger,
  joins: [{ table: user, on: eq(tokenLedger.userId, user.id) }],

  searchPlaceholder: 'Search the note…',

  columns: [
    /** "Owner", not "Account" — in this group an account is a vectorizer.ai login. */
    { name: 'account', label: 'Owner', column: user.email, primary: true },
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
        signup: 'default',
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
      /**
       * Writes `user_id`, but nobody types one: this is a picker over the user
       * table, searched by email or name. The id is an implementation detail
       * of the ledger, and asking an admin to go and fetch one was the whole
       * complaint.
       */
      name: 'userId',
      label: 'Account',
      kind: 'reference',
      required: true,
      placeholder: 'Search by email or name…',
      reference: {
        table: user,
        value: user.id,
        label: user.email,
        detail: user.name,
        search: [user.email, user.name],
      },
      help: 'Start typing an email. A pasted user id still works.',
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
      options: WRITABLE_REASONS,
      defaultValue: 'grant',
    },
    { name: 'note', label: 'Note', placeholder: 'Why this entry exists' },
    /**
     * `actorEmail` is NOT a field. It used to be one, and asking an admin to
     * type their own address made "who authorised this" a claim rather than a
     * fact — the one column in an append-only ledger that must not be. It is
     * stamped from the session in `beforeSave` instead.
     */
  ],

  filters: [
    { name: 'reason', label: 'Reason', column: tokenLedger.reason, options: REASONS },
  ],

  defaultSort: { column: 'createdAt', dir: 'desc' },

  actions: { create: true, update: false, delete: false },
  roles: { view: ['admin'], create: ['admin'] },

  /**
   * The picker sends an id, so the first half of this is a backstop rather
   * than the normal path — but it is the half that matters: a hand-crafted
   * request, or a pasted email, both land here and both are resolved and
   * verified before anything is written. A mistyped id used to insert a row
   * against an account that does not exist, and a balance belonging to nobody
   * is worse than a rejected form.
   *
   * The second half is not a backstop. `actorEmail` is stamped from the
   * session because it is the one column in an append-only ledger that has to
   * be a fact rather than a claim.
   */
  async beforeSave(values, ctx) {
    const typed = String(values.userId ?? '').trim()

    const [target] = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(typed.includes('@') ? eq(user.email, typed.toLowerCase()) : eq(user.id, typed))
      .limit(1)

    if (!target) {
      throw new Error(`No account matches "${typed}".`)
    }

    values.userId = target.id

    const [actor] = await getDb()
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, ctx.userId))
      .limit(1)

    values.actorEmail = actor?.email ?? ctx.userId

    return values
  },
})
