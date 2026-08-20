import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { Gauge, KeyRound, LayoutGrid, ShieldCheck, Sparkles } from 'lucide-react'

import { PanelIcon } from '#/components/panel/panel-icon'
import { PanelSearch } from '#/components/panel/panel-search'
import { getPanelNav } from '#/lib/server/panel'

/**
 * The app shell.
 *
 * The sidebar is server-driven: `getPanelNav` returns only the resources this
 * session's role may view, and every panel resource is admin-gated — so the
 * Admin group is absent, not disabled, for an ordinary account, and the bundle
 * never mentions it. Global search is scoped the same way.
 */
export const Route = createFileRoute('/dashboard')({
  loader: () => getPanelNav(),
  component: DashboardLayout,
})

/*
 * Nav items are index entries, not buttons: no pill, no rounding. The active
 * one is marked with a rule in the margin, the way a contact sheet is marked.
 */
const LINK_CLASS =
  'text-muted-foreground hover:text-foreground hover:border-(--line-strong) border-l border-transparent flex items-center gap-2.5 py-1.5 pl-3 text-sm transition-colors'

const LINK_ACTIVE = 'text-foreground border-primary font-medium'

function DashboardLayout() {
  const nav = Route.useLoaderData()
  const isAdmin = nav.length > 0

  return (
    <div className="mx-auto flex w-full max-w-[100rem] gap-12 px-4 py-8 sm:px-8">
      <aside className="hidden w-48 shrink-0 lg:block">
        <div className="sticky top-24 space-y-6">
          {isAdmin ? <PanelSearch /> : null}

          <nav className="space-y-6">
            <div className="space-y-0.5">
              <p className="eyebrow text-muted-foreground/60 mb-2 pl-3">Tools</p>

              <Link
                to="/dashboard"
                activeOptions={{ exact: true }}
                activeProps={{ className: LINK_ACTIVE }}
                className={LINK_CLASS}
              >
                <LayoutGrid className="size-4" strokeWidth={1.5} />
                Catalog
              </Link>

              <Link
                to="/tools/metadata"
                activeProps={{ className: LINK_ACTIVE }}
                className={LINK_CLASS}
              >
                <Sparkles className="size-4" strokeWidth={1.5} />
                Metadata
              </Link>
            </div>

            <div className="space-y-0.5">
              <p className="eyebrow text-muted-foreground/60 mb-2 pl-3">
                Account
              </p>

              <Link
                to="/dashboard/keys"
                activeProps={{ className: LINK_ACTIVE }}
                className={LINK_CLASS}
              >
                <KeyRound className="size-4" strokeWidth={1.5} />
                API keys
              </Link>

              <Link
                to="/dashboard/history"
                activeProps={{ className: LINK_ACTIVE }}
                className={LINK_CLASS}
              >
                <Gauge className="size-4" strokeWidth={1.5} />
                History
              </Link>
            </div>

            {/*
              Present only for admins — `getPanelNav` returns an empty list for
              everyone else, so there is nothing to render and nothing to leak.
            */}
            {isAdmin ? (
              <div className="space-y-0.5">
                <p className="eyebrow text-muted-foreground/60 mb-2 pl-3">
                  Admin
                </p>

                <Link
                  to="/dashboard/admin"
                  activeOptions={{ exact: true }}
                  activeProps={{ className: LINK_ACTIVE }}
                  className={LINK_CLASS}
                >
                  <ShieldCheck className="size-4" strokeWidth={1.5} />
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
                    <PanelIcon name={item.icon} className="size-4" />
                    {item.label}
                    {item.badge === undefined ? null : (
                      <span className="border-(--line) text-muted-foreground ml-auto border px-1 font-mono text-[0.6rem] tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ) : null}
          </nav>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
