import { getTableColumns } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'

import type {
  BadgeVariant,
  ColumnKind,
  FieldKind,
  PanelAction,
  PanelColumn,
  PanelCustomAction,
  PanelDetail,
  PanelField,
  PanelFilter,
  PanelIcon,
  PanelOption,
  PanelResourceMeta,
} from '#/lib/panel/types'

/**
 * `defineResource` — one file per resource, the way Filament does it with a
 * Resource class. You point at a Drizzle table, list the columns the table
 * should show and the fields the form should edit, and the panel generates
 * the list, the search, the filters, the sorting, the pagination, the
 * create/edit dialog and the (bulk) delete.
 *
 * IMPORTANT: this module — and everything under `src/resources/` — is
 * SERVER-ONLY. Import it from `src/lib/server/panel.ts` and nowhere else. The
 * Drizzle column references below are what make owner scoping and sort/filter
 * allowlists possible, and they must not reach the browser.
 */

export type ResourceContext = {
  userId: string
  roles: string[]
}

export type ResourceColumnInput = {
  /** Key used in the JSON row and in `?sort=` — keep it stable. */
  name: string
  label: string
  column: AnySQLiteColumn
  kind?: ColumnKind
  sortable?: boolean
  /** Included in the free-text search (`LIKE %q%`). */
  searchable?: boolean
  align?: 'right'
  className?: string
  variants?: Record<string, BadgeVariant>
  /** Names a record in the edit dialog and delete confirmation. */
  primary?: boolean
}

export type ResourceFieldInput = {
  /** Must match a property on the resource's table. */
  name: string
  label: string
  kind?: FieldKind
  required?: boolean
  options?: PanelOption[]
  placeholder?: string
  help?: string
  min?: number
  max?: number
  defaultValue?: string | number | boolean | null
  /** Defaults to editable in both dialogs. */
  on?: { create?: boolean; update?: boolean }
}

export type ResourceFilterInput = {
  name: string
  label: string
  column: AnySQLiteColumn
  options: PanelOption[]
}

/**
 * A custom action — Filament's `Action::make('archive')`, in this kit's terms.
 *
 * The handler runs on the server and receives only ids the engine has already
 * re-selected under this resource's own scope, so a hand-crafted request
 * cannot hand your handler rows the caller may not touch. Throw inside it to abort: the
 * message becomes the user's toast, exactly like `beforeDelete`.
 */
export type ResourceActionInput = {
  /** Sent by the client and looked up here. Keep it stable — it is the URL. */
  name: string
  label: string
  icon?: PanelIcon
  variant?: 'default' | 'destructive'
  confirm?: { title?: string; description: string; confirmLabel?: string }
  /** Defaults to both the row menu and the bulk bar. */
  on?: { row?: boolean; bulk?: boolean }
  /** Which roles may run it. Undefined = anyone who can view. */
  roles?: readonly string[]
  /** Success toast; `{count}` is replaced with the number of rows. */
  success?: string
  handler: (ids: string[], ctx: ResourceContext) => void | Promise<void>
}

export type ResourceInput = {
  /** URL segment: /dashboard/<name>. */
  name: string
  label: string
  pluralLabel: string
  icon: PanelIcon
  description?: string
  /** The table rows are written to. Joined tables are read-only. */
  table: SQLiteTable
  /** Defaults to `table.id`. */
  idColumn?: AnySQLiteColumn
  /**
   * The owner key. Every read and every write is scoped to it using the user
   * id from the SESSION. Omit it only for tables an admin screen is meant to
   * see whole — and then guard the resource with `roles: { view: ['admin'] }`.
   */
  tenantColumn?: AnySQLiteColumn
  joins?: { table: SQLiteTable; on: SQL }[]
  columns: ResourceColumnInput[]
  fields?: ResourceFieldInput[]
  filters?: ResourceFilterInput[]
  defaultSort: { column: string; dir: 'asc' | 'desc' }
  searchPlaceholder?: string
  /** Turn actions off entirely — `create: false` for read-only resources. */
  actions?: Partial<Record<PanelAction, boolean>>
  /** Your own actions, on top of create/update/delete. */
  rowActions?: ResourceActionInput[]
  /** Which roles may perform an action. Undefined = anyone signed in. */
  roles?: Partial<Record<PanelAction, readonly string[]>>
  /**
   * A route to one record, with the id as its only param — e.g.
   * `/dashboard/admin/users/$userId`. The panel adds the link; it does not
   * generate the page, and the link is NOT a guard: that route re-checks the
   * role for itself, like every other route in the app.
   */
  detailPath?: string
  /** What the link is called in the row menu. Defaults to "Open". */
  detailLabel?: string
  /** Show a counter on the dashboard overview. Defaults to true. */
  stats?: boolean
  /**
   * Show a row count next to the sidebar link. Off by default on purpose:
   * it is one COUNT per dashboard load, and D1's free tier bills row reads.
   */
  badge?: boolean
  /** Extra column values stamped on insert (id and tenant are automatic). */
  onCreate?: (ctx: ResourceContext) => Record<string, unknown>
  /** Throw here to block a delete — the message reaches the user's toast. */
  beforeDelete?: (ids: string[], ctx: ResourceContext) => void | Promise<void>
}

export type Resource = ReturnType<typeof defineResource>

export function defineResource(input: ResourceInput) {
  const tableColumns = getTableColumns(input.table) as Record<
    string,
    AnySQLiteColumn
  >

  const idColumn = input.idColumn ?? tableColumns.id
  if (!idColumn) {
    throw new Error(`Resource "${input.name}": no id column`)
  }

  /** Property name on the table for a column reference, e.g. userId. */
  function keyOf(column: AnySQLiteColumn) {
    const entry = Object.entries(tableColumns).find(
      ([, candidate]) => candidate === column,
    )
    return entry?.[0]
  }

  const columns: PanelColumn[] = input.columns.map((column) => ({
    name: column.name,
    label: column.label,
    kind: column.kind ?? 'text',
    sortable: column.sortable ?? false,
    align: column.align,
    className: column.className,
    variants: column.variants,
    primary: column.primary,
  }))

  const fields: PanelField[] = (input.fields ?? []).map((field) => ({
    name: field.name,
    label: field.label,
    kind: field.kind ?? 'text',
    required: field.required ?? false,
    options: field.options,
    placeholder: field.placeholder,
    help: field.help,
    min: field.min,
    max: field.max,
    defaultValue: field.defaultValue,
    on: {
      create: field.on?.create ?? true,
      update: field.on?.update ?? true,
    },
  }))

  const filters: PanelFilter[] = (input.filters ?? []).map((filter) => ({
    name: filter.name,
    label: filter.label,
    options: filter.options,
  }))

  /** name -> column, for the SELECT list. `id` is always present. */
  const selection: Record<string, AnySQLiteColumn> = { id: idColumn }
  for (const column of input.columns) {
    selection[column.name] = column.column
  }

  const sortable: Record<string, AnySQLiteColumn> = {}
  for (const column of input.columns) {
    if (column.sortable) sortable[column.name] = column.column
  }

  const filterable: Record<string, AnySQLiteColumn> = {}
  for (const filter of input.filters ?? []) {
    filterable[filter.name] = filter.column
  }

  const searchColumns = input.columns
    .filter((column) => column.searchable)
    .map((column) => column.column)

  /** Field name -> the table column it writes to. Unknown fields are refused. */
  const writable: Record<string, AnySQLiteColumn> = {}
  for (const field of input.fields ?? []) {
    const column = tableColumns[field.name]
    if (!column) {
      throw new Error(
        `Resource "${input.name}": field "${field.name}" has no matching column on the table`,
      )
    }
    writable[field.name] = column
  }

  const actions: Record<PanelAction, boolean> = {
    view: input.actions?.view ?? true,
    create: input.actions?.create ?? fields.some((field) => field.on.create),
    update: input.actions?.update ?? fields.some((field) => field.on.update),
    delete: input.actions?.delete ?? true,
  }

  /**
   * The one `$param` in the detail path. Resolved here so a typo is an import
   * error rather than a link that navigates nowhere.
   */
  let detail: PanelDetail | undefined
  if (input.detailPath) {
    const param = /\$(\w+)/.exec(input.detailPath)?.[1]
    if (!param) {
      throw new Error(
        `Resource "${input.name}": detailPath "${input.detailPath}" has no $param for the record id`,
      )
    }
    detail = {
      to: input.detailPath,
      param,
      label: input.detailLabel ?? 'Open',
    }
  }

  if (!sortable[input.defaultSort.column]) {
    throw new Error(
      `Resource "${input.name}": defaultSort column "${input.defaultSort.column}" is not sortable`,
    )
  }

  /** Action name -> definition. The client sends a name; nothing else is run. */
  const actionMap: Record<string, ResourceActionInput> = {}
  for (const action of input.rowActions ?? []) {
    if (actionMap[action.name]) {
      throw new Error(
        `Resource "${input.name}": two actions are called "${action.name}"`,
      )
    }
    actionMap[action.name] = action
  }

  /**
   * The column that names a record — in a delete confirmation, and as the
   * title of a global-search hit. `detail` is whatever comes next, for the
   * "Acme migration · Active" second line.
   */
  const titleColumn =
    input.columns.find((column) => column.primary) ?? input.columns[0]
  const detailColumn = input.columns.find(
    (column) => column !== titleColumn && (column.kind ?? 'text') === 'text',
  )

  /** What a user with these roles may do. Enforced on every mutation. */
  function can(roles: string[]): Record<PanelAction, boolean> {
    const allowed = (action: PanelAction) => {
      if (!actions[action]) return false
      const required = input.roles?.[action]
      if (!required) return true
      return roles.some((role) => required.includes(role))
    }

    return {
      view: allowed('view'),
      create: allowed('create'),
      update: allowed('update'),
      delete: allowed('delete'),
    }
  }

  /**
   * A custom action carries its own role list, independent of update/delete —
   * "Archive" is not "Delete", and a resource with no editable fields can
   * still have one.
   */
  function canRun(action: ResourceActionInput, roles: string[]) {
    return !action.roles || roles.some((role) => action.roles!.includes(role))
  }

  return {
    ...input,
    idColumn,
    idKey: keyOf(idColumn) ?? 'id',
    tenantKey: input.tenantColumn ? keyOf(input.tenantColumn) : undefined,
    joins: input.joins ?? [],
    stats: input.stats ?? true,
    badge: input.badge ?? false,
    actions,
    actionMap,
    columns,
    fields,
    filters,
    selection,
    sortable,
    filterable,
    searchColumns,
    titleColumn,
    detailColumn,
    detail,
    writable,
    tableColumns,

    /** What this user may do — resolved per request, enforced server-side. */
    can,
    canRun,

    /** The JSON the browser receives. Column references stay behind. */
    meta(roles: string[]): PanelResourceMeta {
      return {
        name: input.name,
        label: input.label,
        pluralLabel: input.pluralLabel,
        icon: input.icon,
        description: input.description,
        columns,
        fields,
        filters,
        searchable: searchColumns.length > 0,
        searchPlaceholder: input.searchPlaceholder ?? 'Search…',
        defaultSort: input.defaultSort,
        /** An action this role cannot run is not a disabled button — it is absent. */
        rowActions: (input.rowActions ?? [])
          .filter((action) => canRun(action, roles))
          .map(
            (action): PanelCustomAction => ({
              name: action.name,
              label: action.label,
              icon: action.icon,
              variant: action.variant,
              confirm: action.confirm,
              on: {
                row: action.on?.row ?? true,
                bulk: action.on?.bulk ?? true,
              },
              success: action.success,
            }),
          ),
        detail,
        can: can(roles),
      }
    },
  }
}
