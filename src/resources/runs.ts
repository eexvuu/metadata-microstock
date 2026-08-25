import { eq } from 'drizzle-orm'

import { generationRun, user } from '#/db/schema'
import { defineResource } from '#/lib/panel/define'

const STATUS = [
  { value: 'complete', label: 'Complete' },
  { value: 'partial', label: 'Partial' },
  { value: 'running', label: 'Running' },
  { value: 'error', label: 'Error' },
]

const PLATFORMS = [
  { value: 'adobe', label: 'Adobe Stock' },
  { value: 'shutterstock', label: 'Shutterstock' },
]

/**
 * Every tool run on the platform — the admin's usage view.
 *
 * Read-only on purpose: these rows are reported by the browser that did the
 * work (see the warning at the top of `src/lib/server/runs.ts`), so editing one
 * would be editing a measurement. Global, therefore admin-gated like `users`.
 */
export const runs = defineResource({
  name: 'runs',
  label: 'Run',
  pluralLabel: 'Runs',
  icon: 'play',
  description: 'Every tool run reported by a signed-in browser.',

  table: generationRun,
  joins: [{ table: user, on: eq(generationRun.userId, user.id) }],

  searchPlaceholder: 'Search by folder name…',

  /**
   * The counts are in the row; the metadata is not. Opening a run is how an
   * admin gets from "500 files, 12 fallbacks" to the titles that came out —
   * and the route is where the reveal is audited, so the link has to exist.
   */
  detailPath: '/dashboard/admin/runs/$runId',

  columns: [
    {
      name: 'folderName',
      label: 'Folder',
      column: generationRun.folderName,
      searchable: true,
      primary: true,
      className: 'font-mono text-xs',
    },
    { name: 'account', label: 'Account', column: user.email },
    { name: 'tool', label: 'Tool', column: generationRun.tool, kind: 'badge' },
    {
      name: 'platform',
      label: 'Platform',
      column: generationRun.platform,
      kind: 'badge',
      variants: { adobe: 'secondary', shutterstock: 'outline' },
    },
    {
      name: 'filesDone',
      label: 'Files',
      column: generationRun.filesDone,
      kind: 'number',
      sortable: true,
      align: 'right',
    },
    {
      name: 'status',
      label: 'Status',
      column: generationRun.status,
      kind: 'badge',
      variants: {
        complete: 'default',
        partial: 'secondary',
        running: 'secondary',
        error: 'destructive',
      },
    },
    {
      name: 'startedAt',
      label: 'Started',
      column: generationRun.startedAt,
      kind: 'datetime',
      sortable: true,
      align: 'right',
    },
  ],

  filters: [
    {
      name: 'status',
      label: 'Status',
      column: generationRun.status,
      options: STATUS,
    },
    {
      name: 'platform',
      label: 'Platform',
      column: generationRun.platform,
      options: PLATFORMS,
    },
  ],

  defaultSort: { column: 'startedAt', dir: 'desc' },

  actions: { create: false, update: false, delete: false },
  roles: { view: ['admin'] },
})
