/**
 * The wire format between a resource definition (server) and the generic
 * admin UI (client).
 *
 * Everything here is plain JSON. That is the whole trick behind this panel:
 * resource definitions live in `src/resources/`, are imported ONLY from
 * server functions, and reach the browser as data. The client bundle grows by
 * zero bytes when you add your tenth resource — and your Drizzle tables,
 * column names and authorisation rules never ship to the browser.
 */

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'ghost'

/**
 * Icons the sidebar and the action buttons can render. Keep the list small —
 * every entry is bundled whether a resource uses it or not.
 */
/**
 * Which tool a resource's screen belongs to.
 *
 * The nav groups by this and the screen header prints it, because "Runs" and
 * "Batches" sitting side by side say nothing about which tool wrote them —
 * every tool on this shelf owns its own space, and its admin screens are no
 * exception. A resource with no group is platform-wide (accounts, the audit
 * log) and renders flat.
 *
 * The values are keys into `m.nav`, so a new group needs a line of copy per
 * locale and the type stops a typo from silently rendering nothing.
 */
export type PanelGroup = 'metadata' | 'vectorizer'

export type PanelIcon =
  | 'folder'
  | 'users'
  | 'credit-card'
  | 'mail'
  | 'layers'
  | 'gauge'
  | 'play'
  | 'pause'
  | 'archive'
  | 'check'
  | 'send'
  | 'key'

export type PanelOption = { value: string; label: string }

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'switch'
  | 'date'
  /** Same value as `text`, masked on screen. For a credential being typed in. */
  | 'password'
  /**
   * A row in another table, searched by typing. Writes that row's id and shows
   * a human label — the panel's answer to "which account?" being a question
   * about an email and an answer about a UUID.
   */
  | 'reference'

/** One input in the create/edit dialog. */
export type PanelField = {
  name: string
  label: string
  kind: FieldKind
  required: boolean
  options?: PanelOption[]
  placeholder?: string
  help?: string
  min?: number
  max?: number
  defaultValue?: string | number | boolean | null
  /** A field can be create-only (immutable afterwards) or edit-only. */
  on: { create: boolean; update: boolean }
}

/** One hit in a `reference` field's dropdown. Ids and labels, never columns. */
export type PanelReferenceOption = {
  value: string
  label: string
  /** The second line — an email under a name, a status under a title. */
  detail?: string | null
}

export type ColumnKind = 'text' | 'badge' | 'number' | 'boolean' | 'date' | 'datetime'

/** One column in the list table. */
export type PanelColumn = {
  name: string
  label: string
  kind: ColumnKind
  sortable: boolean
  align?: 'right'
  className?: string
  /** For `badge` columns: value -> badge variant. */
  variants?: Record<string, BadgeVariant>
  /** The column that names a record in dialogs and confirmations. */
  primary?: boolean
}

/** A dropdown filter above the table. `all` is added by the engine. */
export type PanelFilter = {
  name: string
  label: string
  options: PanelOption[]
}

export type PanelAction = 'view' | 'create' | 'update' | 'delete'

/**
 * A custom action a resource declares, beyond create/update/delete.
 *
 * Deliberately NOT part of `PanelAction`: those four are the engine's own
 * verbs and every resource has them. These are yours — "Archive", "Resend
 * invite", "Mark paid" — and the browser only ever learns their name, so the
 * handler stays on the server with everything else that matters.
 */
export type PanelCustomAction = {
  name: string
  label: string
  icon?: PanelIcon
  variant?: 'default' | 'destructive'
  /** Absent runs on click; present asks first, in the same dialog delete uses. */
  confirm?: { title?: string; description: string; confirmLabel?: string }
  /** Where the button shows up. A row-only action skips the bulk bar. */
  on: { row: boolean; bulk: boolean }
  /** Success toast. `{count}` becomes the number of rows the action ran on. */
  success?: string
}

/**
 * A link from a row to a per-record route the app already has, e.g.
 * `/dashboard/admin/users/$userId`. `param` is the segment name the row id
 * fills in — derived once at definition time so the browser never parses it.
 */
export type PanelDetail = {
  to: string
  param: string
  label: string
}

/** Everything the generic UI needs to render one resource. */
export type PanelResourceMeta = {
  name: string
  label: string
  pluralLabel: string
  icon: PanelIcon
  group?: PanelGroup
  description?: string
  columns: PanelColumn[]
  fields: PanelField[]
  filters: PanelFilter[]
  searchable: boolean
  searchPlaceholder: string
  defaultSort: { column: string; dir: 'asc' | 'desc' }
  /** Only the ones this user's role may run — the rest never reach the browser. */
  rowActions: PanelCustomAction[]
  /**
   * A hand-written page for one record, if the resource has one. The panel
   * generates no such page — this is only the way to it, so the route on the
   * other end enforces its own access.
   */
  detail?: PanelDetail
  /** Resolved for the CURRENT user — the server enforces the same rules. */
  can: Record<PanelAction, boolean>
}

export type PanelNavItem = {
  name: string
  label: string
  icon: PanelIcon
  /** Which tool owns this screen. Absent = platform-wide. */
  group?: PanelGroup
  description?: string
  /** Opt-in count next to the sidebar link. One COUNT per dashboard load. */
  badge?: number
}

/** One global-search result. `detail` is the second column, for context. */
export type PanelSearchHit = {
  id: string
  title: string
  detail?: string
}

/** Global search returns results grouped by resource, the way Filament does. */
export type PanelSearchGroup = {
  resource: string
  label: string
  icon: PanelIcon
  /**
   * Whether picking a hit can open its edit dialog.
   *
   * False for a read-only resource, and for a role that may look but not
   * touch — those hits go to the filtered list instead. Filament has a view
   * page to fall back on; this panel does not, and an edit dialog with no
   * fields in it is worse than no dialog.
   */
  editable: boolean
  hits: PanelSearchHit[]
}

/**
 * What a cell may hold. Deliberately narrow: server functions serialise their
 * return value, and `unknown` is not provably serialisable — TanStack Start
 * rejects it at the type level, which is a feature worth keeping.
 */
export type PanelValue = string | number | boolean | Date | null

export type PanelRecord = { id: string } & Record<string, PanelValue>

export type PanelListResult = {
  meta: PanelResourceMeta
  items: PanelRecord[]
  total: number
  page: number
  pageCount: number
  pageSize: number
}

export type PanelStat = {
  name: string
  label: string
  icon: PanelIcon
  total: number
  /** Optional breakdown from the resource's first filter, e.g. by status. */
  breakdown: { label: string; value: number }[]
}
