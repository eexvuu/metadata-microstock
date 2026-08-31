import { eq } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { vectorAccount } from '#/db/schema'
import { defineResource } from '#/lib/panel/define'
import { encryptSecret } from '#/lib/server/crypto'

const STATUS = [
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
]

/**
 * The vectorizer.ai logins the workers spend, and the only place they are
 * entered.
 *
 * These are the platform's accounts, not a user's — no `tenantColumn`, so the
 * resource is admin-gated like `users` and `runs`. What they buy is
 * throughput: the limiter on vectorizer.ai is per ACCOUNT, so eight logins is
 * eight files at once and one login is one, however many workers are running.
 * `claimNextFile` hands each claim an account no other in-flight file holds,
 * which is what stops two workers sharing a rate-limit bucket.
 *
 * **The password is write-only.** `ciphertext` is a field but never a column,
 * so it is not in the panel's SELECT, does not reach the edit dialog and
 * cannot be listed, searched or sorted. `beforeSave` encrypts it on the way in
 * (AES-256-GCM, the same `ENCRYPTION_SECRET` as a Gemini key); the only code
 * that decrypts it is the claim, and the only thing it answers is a worker
 * that already presented `VECTOR_WORKER_SECRET`.
 *
 * That is also why there is no audit row here and no `revealUserKey` twin:
 * those exist because a human can read a Gemini key, and no human path to
 * this plaintext exists. Adding one would need the same three rules those
 * two were built to.
 *
 * Disabling beats deleting: a retired account still names the files it did,
 * and `status` is what the queue reads.
 */
export const vectorAccounts = defineResource({
  name: 'vector-accounts',
  label: 'Account',
  pluralLabel: 'Accounts',
  icon: 'key',
  group: 'vectorizer',
  description: 'The vectorizer.ai logins workers spend. One account, one file at a time.',

  table: vectorAccount,

  searchPlaceholder: 'Search by name or email…',

  columns: [
    {
      name: 'label',
      label: 'Name',
      column: vectorAccount.label,
      searchable: true,
      primary: true,
    },
    {
      name: 'email',
      label: 'Login',
      column: vectorAccount.email,
      searchable: true,
      className: 'font-mono text-xs',
    },
    {
      name: 'status',
      label: 'Status',
      column: vectorAccount.status,
      kind: 'badge',
      variants: { active: 'default', disabled: 'outline' },
    },
    {
      name: 'lastClaimAt',
      label: 'Last used',
      column: vectorAccount.lastClaimAt,
      kind: 'datetime',
      sortable: true,
      align: 'right',
    },
    {
      name: 'createdAt',
      label: 'Added',
      column: vectorAccount.createdAt,
      kind: 'datetime',
      sortable: true,
      align: 'right',
    },
  ],

  fields: [
    {
      name: 'label',
      label: 'Name',
      required: true,
      placeholder: 'vec-king',
      help: 'Yours to choose. It names the account in this list and nowhere else.',
    },
    {
      name: 'email',
      label: 'Login',
      required: true,
      placeholder: 'you@example.com',
      help: 'The vectorizer.ai sign-in. One row per login — two rows on one login are one rate-limit bucket, not two.',
    },
    {
      name: 'ciphertext',
      label: 'Password',
      kind: 'password',
      /**
       * NOT `required`, because the edit dialog submits every field and a
       * required one refuses to be blank — which would mean retyping the
       * password to rename an account. Blank is dropped before the UPDATE, so
       * empty means "keep what is stored"; `beforeSave` is what makes it
       * mandatory on create.
       */
      help: 'Stored encrypted and never shown again. Leave blank when editing to keep the current one.',
    },
    {
      name: 'status',
      label: 'Status',
      kind: 'select',
      required: true,
      options: STATUS,
      defaultValue: 'active',
      help: 'Disabled accounts are skipped by the queue. Files already running on one finish.',
    },
  ],

  filters: [
    { name: 'status', label: 'Status', column: vectorAccount.status, options: STATUS },
  ],

  defaultSort: { column: 'createdAt', dir: 'desc' },

  roles: { view: ['admin'], create: ['admin'], update: ['admin'], delete: ['admin'] },

  async beforeSave(values, _ctx, mode) {
    if (typeof values.email === 'string') {
      const email = values.email.trim().toLowerCase()
      values.email = email

      // Caught here rather than left to the unique index, whose message is raw
      // SQL. Two rows on one login is a real mistake with a real consequence —
      // one rate-limit bucket wearing two names — so it deserves a sentence
      // that says which row already has it.
      const [clash] = await getDb()
        .select({ label: vectorAccount.label })
        .from(vectorAccount)
        .where(eq(vectorAccount.email, email))
        .limit(1)

      if (clash && mode === 'create') {
        throw new Error(`"${clash.label}" already uses that login.`)
      }
    }

    const password = values.ciphertext

    if (typeof password === 'string' && password.length > 0) {
      values.ciphertext = await encryptSecret(password)
    } else if (mode === 'create') {
      throw new Error('A password is required — the worker signs in with it.')
    }

    return values
  },
})
