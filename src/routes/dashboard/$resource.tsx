import { Link, createFileRoute } from '@tanstack/react-router'

import { ResourceScreen } from '#/components/panel/resource-screen'
import { Button } from '#/components/ui/button'
import { panelSearchSchema } from '#/lib/panel/search'
import type { PanelSearch } from '#/lib/panel/search'
import { listResource } from '#/lib/server/panel'

/**
 * Every list screen in the app, in one route.
 *
 * The search-param contract is the same one the rest of the kit uses — Zod
 * validated, typed, entirely in the URL — but generic, so `?q=`, `?sort=`,
 * `?dir=`, `?page=` and `?filters=` work identically on every resource. The
 * server checks each of those against the resource's own allowlist before any
 * of it reaches SQL.
 */
export const Route = createFileRoute('/dashboard/$resource')({
  validateSearch: panelSearchSchema,
  /** `edit` is left out: opening a dialog is not a different list. */
  loaderDeps: ({ search }) => ({ ...search, edit: undefined }),
  loader: ({ params, deps }) =>
    listResource({ data: { resource: params.resource, search: deps } }),
  component: ResourcePage,
  notFoundComponent: ResourceNotFound,
})

function ResourcePage() {
  const result = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <ResourceScreen
      result={result}
      search={search}
      onSearch={(patch: Partial<PanelSearch>, options?: { replace?: boolean }) => {
        void navigate({
          search: (prev) => ({ ...prev, page: 1, ...patch }),
          /** Filter changes replace history; paging is worth a back button. */
          replace: options?.replace ?? patch.page === undefined,
        })
      }}
    />
  )
}

function ResourceNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <p className="font-medium">This panel does not exist</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        Either the resource was never registered in{' '}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">
          src/resources/index.ts
        </code>
        , or your role cannot open it.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/dashboard">Back to overview</Link>
      </Button>
    </div>
  )
}
