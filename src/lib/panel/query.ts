import { and, asc, count, desc, eq, inArray, like, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { AppDatabase } from '#/db/index'
import type { Resource, ResourceContext } from '#/lib/panel/define'
import { FILTER_ALL, PAGE_SIZE, REFERENCE_LIMIT, SEARCH_LIMIT } from '#/lib/panel/search'
import type { PanelSearch } from '#/lib/panel/search'
import type { PanelRecord } from '#/lib/panel/types'

/**
 * The generic query layer. Every clause is built from the resource's declared
 * columns, never from raw request input:
 *
 *   - the tenant filter comes from the SESSION, and is applied to reads,
 *     updates and deletes alike
 *   - `?sort=` is looked up in the resource's sortable map — an unknown value
 *     falls back to the default instead of reaching SQL
 *   - `?filters[x]=` is looked up in the filter map, same deal
 *
 * That allowlisting is the whole security model of the panel. Add a column to
 * a resource and it becomes filterable; leave it out and it is unreachable.
 */

/** The base SELECT with the resource's joins applied. */
function selectFrom(db: AppDatabase, resource: Resource, selection: Record<string, unknown>) {
  let query = db
    .select(selection as never)
    .from(resource.table)
    .$dynamic()

  for (const join of resource.joins) {
    query = query.leftJoin(join.table, join.on)
  }

  return query
}

/** Owner scoping: a resource with an owner column only ever sees its own rows. */
function tenantFilter(resource: Resource, ctx: ResourceContext) {
  return resource.tenantColumn ? eq(resource.tenantColumn, ctx.userId) : undefined
}

function buildWhere(
  resource: Resource,
  search: PanelSearch,
  ctx: ResourceContext,
) {
  const filters: (SQL | undefined)[] = [tenantFilter(resource, ctx)]

  for (const [name, value] of Object.entries(search.filters ?? {})) {
    const column = resource.filterable[name]
    if (!column || value === FILTER_ALL || value === '') continue
    filters.push(eq(column, value))
  }

  if (search.q && resource.searchColumns.length > 0) {
    const term = `%${search.q}%`
    filters.push(
      or(...resource.searchColumns.map((column) => like(column, term))),
    )
  }

  return and(...filters.filter(Boolean))
}

/**
 * The subset of `ids` that really exists inside the caller's scope.
 *
 * Everything else in this file scopes by tenant inside the statement itself.
 * Custom action handlers cannot: they are your code, and they get an array of
 * strings that arrived from a browser. So they get this array instead — one
 * round trip to make "these are my rows" true before your handler assumes it.
 */
export async function verifyIds(
  db: AppDatabase,
  resource: Resource,
  ids: string[],
  ctx: ResourceContext,
) {
  const rows = await db
    .select({ id: resource.idColumn })
    .from(resource.table)
    .where(
      and(
        ...[inArray(resource.idColumn, ids), tenantFilter(resource, ctx)].filter(
          Boolean,
        ),
      ),
    )

  return rows.map((row) => String(row.id))
}

/** One record by id, for the `?edit=` deep link. Joins and tenant apply. */
export async function getRecord(
  db: AppDatabase,
  resource: Resource,
  id: string,
  ctx: ResourceContext,
) {
  const [row] = await selectFrom(db, resource, resource.selection)
    .where(
      and(
        ...[eq(resource.idColumn, id), tenantFilter(resource, ctx)].filter(
          Boolean,
        ),
      ),
    )
    .limit(1)

  return (row as PanelRecord | undefined) ?? null
}

/**
 * The rows a `reference` field may offer.
 *
 * The browser sends a field NAME; the columns come from the resource's own
 * `references` map, which never leaves the server. So a request can ask "what
 * can this field see" and cannot ask "what is in that other table".
 *
 * Passing `value` looks up exactly one row instead of searching — that is how
 * an edit dialog turns a stored id back into the label a human recognises.
 */
export async function lookupReference(
  db: AppDatabase,
  resource: Resource,
  field: string,
  input: { q?: string; value?: string },
) {
  const reference = resource.references[field]
  if (!reference) return []

  const selection: Record<string, unknown> = {
    value: reference.value,
    label: reference.label,
  }
  if (reference.detail) selection.detail = reference.detail

  const where = input.value
    ? eq(reference.value, input.value)
    : or(...reference.search.map((column) => like(column, `%${input.q ?? ''}%`)))

  const rows = await db
    .select(selection as never)
    .from(reference.table)
    .where(where)
    .limit(input.value ? 1 : REFERENCE_LIMIT)

  return rows as { value: string; label: string | null; detail?: string | null }[]
}

/** A handful of hits for the ⌘K palette. Same allowlist as the search box. */
export async function searchRecords(
  db: AppDatabase,
  resource: Resource,
  term: string,
  ctx: ResourceContext,
) {
  const title = resource.titleColumn
  if (!title || resource.searchColumns.length === 0) return []

  const selection: Record<string, unknown> = {
    id: resource.idColumn,
    title: title.column,
  }
  if (resource.detailColumn) {
    selection.detail = resource.detailColumn.column
  }

  const rows = await selectFrom(db, resource, selection)
    .where(
      and(
        ...[
          tenantFilter(resource, ctx),
          or(
            ...resource.searchColumns.map((column) => like(column, `%${term}%`)),
          ),
        ].filter(Boolean),
      ),
    )
    .limit(SEARCH_LIMIT)

  return rows as { id: string; title: string | null; detail?: string | null }[]
}

export async function listRecords(
  db: AppDatabase,
  resource: Resource,
  search: PanelSearch,
  ctx: ResourceContext,
) {
  const where = buildWhere(resource, search, ctx)

  const sortName =
    search.sort && resource.sortable[search.sort]
      ? search.sort
      : resource.defaultSort.column
  const dir = search.dir ?? resource.defaultSort.dir
  const sortColumn = resource.sortable[sortName]!
  const orderBy = dir === 'asc' ? asc(sortColumn) : desc(sortColumn)

  const [rows, [totals]] = await Promise.all([
    selectFrom(db, resource, resource.selection)
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((search.page - 1) * PAGE_SIZE),
    selectFrom(db, resource, { value: count() }).where(where),
  ])

  const total = (totals as { value: number } | undefined)?.value ?? 0

  return {
    items: rows as PanelRecord[],
    total,
    page: search.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    pageSize: PAGE_SIZE,
  }
}

/** Row count per resource, for the overview widgets. */
export async function countRecords(
  db: AppDatabase,
  resource: Resource,
  ctx: ResourceContext,
  extra?: SQL,
) {
  const where = and(
    ...[tenantFilter(resource, ctx), extra].filter(Boolean),
  )

  const [row] = await selectFrom(db, resource, { value: count() }).where(where)

  return (row as { value: number } | undefined)?.value ?? 0
}

/**
 * One grouped count per resource for the overview widgets, instead of one
 * query per option. The dashboard is the most-hit page in the app — on D1's
 * free plan, row reads are the budget you actually run out of.
 */
export async function countByFilter(
  db: AppDatabase,
  resource: Resource,
  filterName: string,
  ctx: ResourceContext,
) {
  const column = resource.filterable[filterName]
  if (!column) return {}

  const rows = await selectFrom(db, resource, { key: column, value: count() })
    .where(and(...[tenantFilter(resource, ctx)].filter(Boolean)))
    .groupBy(column)

  const counts: Record<string, number> = {}
  for (const row of rows as { key: string | null; value: number }[]) {
    counts[row.key ?? ''] = row.value
  }

  return counts
}

/**
 * Form values -> column values.
 *
 * Only declared fields survive, so an extra key in the request body cannot
 * write to a column the resource never exposed. The Drizzle column's own
 * `dataType` drives the conversion, which is what lets a `date` field write to
 * a timestamp column without the resource having to say so.
 */
export function toColumnValues(
  resource: Resource,
  data: Record<string, unknown>,
) {
  const values: Record<string, unknown> = {}

  for (const field of resource.fields) {
    if (!(field.name in data)) continue

    const column = resource.writable[field.name]
    const raw = data[field.name]
    if (!column) continue

    if (raw === '' || raw === undefined) {
      if (!column.notNull) values[field.name] = null
      continue
    }

    values[field.name] =
      column.dataType === 'date' ? new Date(raw as string) : raw
  }

  return values
}

/**
 * The resource's own last word on what gets written. Runs after the field
 * allowlist, so a hook can only ever see columns the resource declared.
 */
async function applyBeforeSave(
  resource: Resource,
  values: Record<string, unknown>,
  ctx: ResourceContext,
  mode: 'create' | 'update',
) {
  return resource.beforeSave ? await resource.beforeSave(values, ctx, mode) : values
}

export async function insertRecord(
  db: AppDatabase,
  resource: Resource,
  data: Record<string, unknown>,
  ctx: ResourceContext,
) {
  const values: Record<string, unknown> = {
    ...(resource.onCreate?.(ctx) ?? {}),
    ...(await applyBeforeSave(resource, toColumnValues(resource, data), ctx, 'create')),
  }

  if (resource.tenantKey) {
    values[resource.tenantKey] = ctx.userId
  }

  if (values[resource.idKey] === undefined) {
    values[resource.idKey] = crypto.randomUUID()
  }

  await db.insert(resource.table).values(values as never)

  return { id: values[resource.idKey] as string }
}

export async function updateRecord(
  db: AppDatabase,
  resource: Resource,
  id: string,
  data: Record<string, unknown>,
  ctx: ResourceContext,
) {
  const values = await applyBeforeSave(
    resource,
    toColumnValues(resource, data),
    ctx,
    'update',
  )

  /** Nothing editable in the payload — treat as a no-op, not an error. */
  if (Object.keys(values).length === 0) return { id }

  await db
    .update(resource.table)
    .set(values as never)
    .where(
      and(
        ...[eq(resource.idColumn, id), tenantFilter(resource, ctx)].filter(
          Boolean,
        ),
      ),
    )

  return { id }
}

export async function deleteRecords(
  db: AppDatabase,
  resource: Resource,
  ids: string[],
  ctx: ResourceContext,
) {
  /** `beforeDelete` is your code — hand it rows we have already vouched for. */
  const owned = await verifyIds(db, resource, ids, ctx)
  if (owned.length === 0) return { deleted: 0 }

  await resource.beforeDelete?.(owned, ctx)

  await db.delete(resource.table).where(
    and(
      ...[inArray(resource.idColumn, owned), tenantFilter(resource, ctx)].filter(
        Boolean,
      ),
    ),
  )

  return { deleted: owned.length }
}
