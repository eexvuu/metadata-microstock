import { eq } from 'drizzle-orm'

import { user, vectorJob } from '#/db/schema'
import { defineResource } from '#/lib/panel/define'

const STATUS = [
  { value: 'uploading', label: 'Uploading' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'complete', label: 'Complete' },
  { value: 'partial', label: 'Partial' },
  { value: 'failed', label: 'Failed' },
]

/**
 * Every vectorize batch on the platform.
 *
 * Read-only, but for the opposite reason `runs` is. Those counts come from a
 * browser and editing one would be editing a measurement; these are written by
 * the queue, and the tokens came off the same numbers — editing one would be
 * editing an invoice. Either way the answer is the same: look, do not touch.
 *
 * The per-file rows are not a resource. They are queue state with a lease and
 * a refund attached to them, and a hand-edit would desynchronise a worker from
 * the ledger. The tool's own batch screen is where files are read.
 */
export const vectorJobs = defineResource({
  name: 'vector-jobs',
  /**
   * "Batch", not "Vector batch": the group already says Vectorizer, and the
   * URL segment (`vector-jobs`) is what has to stay stable, not the label.
   */
  label: 'Batch',
  pluralLabel: 'Batches',
  icon: 'layers',
  group: 'vectorizer',
  description: 'Every batch sent to the vectorize worker.',

  table: vectorJob,
  joins: [{ table: user, on: eq(vectorJob.userId, user.id) }],

  searchPlaceholder: 'Search by batch name…',

  columns: [
    {
      name: 'label',
      label: 'Batch',
      column: vectorJob.label,
      searchable: true,
      primary: true,
      className: 'font-mono text-xs',
    },
    /** "Owner", not "Account" — in this group an account is a vectorizer.ai login. */
    { name: 'account', label: 'Owner', column: user.email },
    {
      name: 'status',
      label: 'Status',
      column: vectorJob.status,
      kind: 'badge',
      variants: {
        complete: 'default',
        partial: 'secondary',
        running: 'secondary',
        queued: 'secondary',
        uploading: 'outline',
        failed: 'destructive',
      },
    },
    {
      name: 'filesDone',
      label: 'Done',
      column: vectorJob.filesDone,
      kind: 'number',
      sortable: true,
      align: 'right',
    },
    {
      name: 'filesFailed',
      label: 'Failed',
      column: vectorJob.filesFailed,
      kind: 'number',
      sortable: true,
      align: 'right',
    },
    {
      name: 'tokensCharged',
      label: 'Tokens',
      column: vectorJob.tokensCharged,
      kind: 'number',
      sortable: true,
      align: 'right',
    },
    {
      name: 'createdAt',
      label: 'Created',
      column: vectorJob.createdAt,
      kind: 'datetime',
      sortable: true,
      align: 'right',
    },
  ],

  filters: [{ name: 'status', label: 'Status', column: vectorJob.status, options: STATUS }],

  defaultSort: { column: 'createdAt', dir: 'desc' },

  actions: { create: false, update: false, delete: false },
  roles: { view: ['admin'] },
})
