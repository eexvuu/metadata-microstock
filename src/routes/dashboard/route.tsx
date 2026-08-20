import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { Gauge, LayoutGrid, ShieldCheck, Sparkles } from 'lucide-react'

import { PanelIcon } from '#/components/panel/panel-icon'
import { PanelSearch } from '#/components/panel/panel-search'
import { CONTAINER } from '#/components/shell'
import { getPanelNav } from '#/lib/server/panel'

/**
 * The dashboard shell.
 *
 * Sections run across the top rather than down a rail: with the tool on its
 * own page there are only a handful of them, and a sidebar would inset this
 * content while `/tools/*` starts at the header's edge — the two would never
 * line up. Everything here shares `CONTAINER` with the header and the footer.
 *
 * The nav is server-driven: `getPanelNav` returns only the resources this
 * session's role may view, and every panel resource is admin-gated — so the
 * admin links are absent, not disabled, for an ordinary account, and the
 * bundle never mentions them. Global search is scoped the same way.
 */
export const Route = createFileRoute('/dashboard')({
  loader: () => getPanelNav(),
  component: DashboardLayout,
})

const LINK_CLASS =
  'eyebrow text-muted-foreground hover:text-foreground relative py-1 transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-[width] after:duration-300 hover:after:w-full'

const LINK_ACTIVE = 'text-foreground after:w-full'

function DashboardLayout() {
  const nav = Route.useLoaderData()
  const isAdmin = nav.length > 0

  return (
    <>
      <div className="border-(--line) border-b">
        <div
          className={`${CONTAINER} flex flex-wrap items-center gap-x-6 gap-y-3 py-3`}
        >
          <Link
            to="/dashboard"
            activeOptions={{ exact: true }}
            activeProps={{ className: LINK_ACTIVE }}
            className={LINK_CLASS}
          >
            <LayoutGrid className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
            Catalog
          </Link>

          <Link
            to="/tools/metadata"
            activeProps={{ className: LINK_ACTIVE }}
            className={LINK_CLASS}
          >
            <Sparkles className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
            Metadata
          </Link>

          <Link
            to="/dashboard/history"
            activeProps={{ className: LINK_ACTIVE }}
            className={LINK_CLASS}
          >
            <Gauge className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
            History
          </Link>

          {isAdmin ? (
            <>
              <span className="bg-(--line) hidden h-4 w-px sm:block" aria-hidden />

              <Link
                to="/dashboard/admin"
                activeOptions={{ exact: true }}
                activeProps={{ className: LINK_ACTIVE }}
                className={LINK_CLASS}
              >
                <ShieldCheck className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
                Monitoring
              </Link>

              {nav.map((item) => (
                <Link
                  key={item.name}
                  to="/dashboard/$resource"
                  params={{ resource: item.name }}
                  activeProps={{ className: LINK_ACTIVE }}
                  className={LINK_CLASS}
                >
                  <PanelIcon name={item.icon} className="mr-1.5 inline size-3.5" />
                  {item.label}
                  {item.badge === undefined ? null : (
                    <span className="text-muted-foreground/70 ml-1.5">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}

              <div className="ml-auto w-full sm:w-56">
                <PanelSearch />
              </div>
            </>
          ) : null}
        </div>
      </div>

      <main className={`${CONTAINER} py-8`}>
        <Outlet />
      </main>
    </>
  )
}
