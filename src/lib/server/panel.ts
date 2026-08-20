import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '#/db/index'
import type { ResourceContext } from '#/lib/panel/define'
import { buildFormSchema } from '#/lib/panel/form-schema'
import * as query from '#/lib/panel/query'
import { SEARCH_MIN, panelSearchSchema } from '#/lib/panel/search'
import type {
  PanelAction,
  PanelNavItem,
  PanelSearchGroup,
  PanelStat,
} from '#/lib/panel/types'
import { requireSession, rolesOf } from '#/lib/server/session'
import { findResource, resources } from '#/resources/index'

/**
 * The panel's entire client-server surface: nine server functions, no matter
 * how many resources you define.
 *
 * This is also the ONLY module that imports `src/resources/` — which is what
 * keeps Drizzle tables, column allowlists and role rules out of the browser
 * bundle. TanStack Start compiles server function bodies (and their imports)
 * out of the client build; the browser is left with the JSON meta.
 */

/**
 * Session + roles, resolved once per request.
 *
 * Deliberately NOT `requireAdmin()`: the dashboard layout loads the nav on
 * every page, and bouncing ordinary users out of their own dashboard would be
 * the result. Authorisation happens per resource instead — every panel
 * resource declares `roles: { view: ['admin'] }`, so a non-admin gets an empty
 * nav and a notFound() from `authorize()` on anything they try to call.
 */
async function panelContext() {
  const session = await requireSession()

  const ctx: ResourceContext = {
    userId: session.user.id,
    roles: rolesOf(session.user.role),
  }

  return { db: getDb(), ctx }
}

/**
 * Resolve a resource and authorise the action in one step.
 *
 * A resource the user may not view is a 404, not a 403 — no reason to confirm
 * that a screen exists to someone who cannot open it.
 */
function authorize(name: string, ctx: ResourceContext, action: PanelAction) {
  const resource = findResource(name)
  const can = resource?.can(ctx.roles)

  if (!resource || !can?.view) {
    throw notFound()
  }

  if (!can[action]) {
    throw new Error(
      `Your role cannot ${action} ${resource.pluralLabel.toLowerCase()}.`,
    )
  }

  return resource
}

/** Zod failures become one readable sentence rather than a stack trace. */
function parseForm<T extends z.ZodType>(schema: T, input: unknown) {
  const result = schema.safeParse(input)

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Invalid input')
  }

  return result.data as Record<string, unknown>
}

/** Sidebar. Resources the user cannot view never reach the browser. */
export const getPanelNav = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PanelNavItem[]> => {
    const { db, ctx } = await panelContext()

    const visible = resources.filter((resource) => resource.can(ctx.roles).view)

    return Promise.all(
      visible.map(async (resource) => ({
        name: resource.name,
        label: resource.pluralLabel,
        icon: resource.icon,
        description: resource.description,
        /** Only for resources that asked — each badge is its own COUNT. */
        badge: resource.badge
          ? await query.countRecords(db, resource, ctx)
          : undefined,
      })),
    )
  },
)

/** Overview widgets: one grouped query per resource. */
export const getPanelOverview = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PanelStat[]> => {
    const { db, ctx } = await panelContext()

    const visible = resources.filter(
      (resource) => resource.stats && resource.can(ctx.roles).view,
    )

    return Promise.all(
      visible.map(async (resource) => {
        const filter = resource.filters[0]

        if (!filter) {
          return {
            name: resource.name,
            label: resource.pluralLabel,
            icon: resource.icon,
            total: await query.countRecords(db, resource, ctx),
            breakdown: [],
          }
        }

        const counts = await query.countByFilter(db, resource, filter.name, ctx)

        return {
          name: resource.name,
          label: resource.pluralLabel,
          icon: resource.icon,
          total: Object.values(counts).reduce((sum, value) => sum + value, 0),
          breakdown: filter.options
            .map((option) => ({
              label: option.label,
              value: counts[option.value] ?? 0,
            }))
            .filter((entry) => entry.value > 0),
        }
      }),
    )
  },
)

export const listResource = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ resource: z.string(), search: panelSearchSchema }),
  )
  .handler(async ({ data }) => {
    const { db, ctx } = await panelContext()
    const resource = authorize(data.resource, ctx, 'view')

    const result = await query.listRecords(db, resource, data.search, ctx)

    return { meta: resource.meta(ctx.roles), ...result }
  })

/**
 * One record by id — the fallback behind `?edit=`.
 *
 * Deliberately separate from the list rather than folded into it: `edit` is
 * kept out of the route's loader deps so clicking Edit on a visible row opens
 * instantly, and only a link from somewhere else — global search, a bookmark —
 * pays for a fetch.
 */
export const getResourceRecord = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ resource: z.string(), id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db, ctx } = await panelContext()
    const resource = authorize(data.resource, ctx, 'view')

    return query.getRecord(db, resource, data.id, ctx)
  })

export const createResource = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ resource: z.string(), data: z.record(z.string(), z.unknown()) }),
  )
  .handler(async ({ data }) => {
    const { db, ctx } = await panelContext()
    const resource = authorize(data.resource, ctx, 'create')

    const values = parseForm(
      buildFormSchema(resource.fields, 'create'),
      data.data,
    )

    return query.insertRecord(db, resource, values, ctx)
  })

export const updateResource = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      resource: z.string(),
      id: z.string().min(1),
      data: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(async ({ data }) => {
    const { db, ctx } = await panelContext()
    const resource = authorize(data.resource, ctx, 'update')

    const values = parseForm(
      buildFormSchema(resource.fields, 'update'),
      data.data,
    )

    return query.updateRecord(db, resource, data.id, values, ctx)
  })

export const deleteResource = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      resource: z.string(),
      ids: z.array(z.string().min(1)).min(1).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const { db, ctx } = await panelContext()
    const resource = authorize(data.resource, ctx, 'delete')

    return query.deleteRecords(db, resource, data.ids, ctx)
  })

/**
 * Every custom action, through one door.
 *
 * The client sends a NAME, never a function or a query. That name is looked up
 * in the resource's own map, the role is re-checked here rather than trusted
 * from `meta.rowActions`, and the handler is handed only ids the engine has
 * re-selected under this resource's scope — so an action author gets to write
 * the interesting part and none of the dangerous part.
 */
export const runResourceAction = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      resource: z.string(),
      action: z.string().min(1),
      ids: z.array(z.string().min(1)).min(1).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const { db, ctx } = await panelContext()
    const resource = authorize(data.resource, ctx, 'view')

    const action = resource.actionMap[data.action]

    /** An action that does not exist and one you may not run look identical. */
    if (!action || !resource.canRun(action, ctx.roles)) {
      throw new Error(
        `Your role cannot run that action on ${resource.pluralLabel.toLowerCase()}.`,
      )
    }

    const ids = await query.verifyIds(db, resource, data.ids, ctx)

    if (ids.length === 0) {
      throw new Error('Those rows no longer exist.')
    }

    await action.handler(ids, ctx)

    return { count: ids.length }
  })

/**
 * Global search — Filament's ⌘K palette.
 *
 * One query per resource the caller may view, five hits each, all of it behind
 * the same scope filter and the same `searchable` allowlist the list screens
 * use. A resource with no searchable column simply is not searched.
 */
export const searchPanel = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ q: z.string() }))
  .handler(async ({ data }): Promise<PanelSearchGroup[]> => {
    const term = data.q.trim()
    if (term.length < SEARCH_MIN) return []

    const { db, ctx } = await panelContext()

    const searchable = resources.filter(
      (resource) =>
        resource.can(ctx.roles).view && resource.searchColumns.length > 0,
    )

    const groups = await Promise.all(
      searchable.map(async (resource) => {
        const rows = await query.searchRecords(db, resource, term, ctx)

        return {
          resource: resource.name,
          label: resource.pluralLabel,
          icon: resource.icon,
          editable:
            resource.can(ctx.roles).update &&
            resource.fields.some((field) => field.on.update),
          hits: rows.map((row) => ({
            id: row.id,
            title: row.title ?? row.id,
            detail: row.detail ?? undefined,
          })),
        }
      }),
    )

    return groups.filter((group) => group.hits.length > 0)
  })
