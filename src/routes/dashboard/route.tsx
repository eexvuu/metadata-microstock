import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { ChevronDown, LayoutGrid, ShieldCheck } from 'lucide-react'

import { PanelIcon } from '#/components/panel/panel-icon'
import { PanelSearch } from '#/components/panel/panel-search'
import { CONTAINER } from '#/components/shell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useMessages } from '#/lib/i18n'
import type { PanelGroup, PanelNavItem } from '#/lib/panel/types'
import { getPanelNav } from '#/lib/server/panel'

/**
 * The dashboard shell.
 *
 * Sections run across the top rather than down a rail: with every tool on its
 * own page there are only a handful of them, and a sidebar would inset this
 * content while `/tools/*` starts at the header's edge — the two would never
 * line up. Everything here shares `CONTAINER` with the header and the footer.
 *
 * No tool is linked from here. The dashboard is the shelf and the account; a
 * tool's own screens hang off its own shell (`/tools/<name>`), so this nav
 * does not grow a link every time a tool ships.
 *
 * The nav is server-driven: `getPanelNav` returns only the resources this
 * session's role may view, and every panel resource is admin-gated — so the
 * admin links are absent, not disabled, for an ordinary account, and the
 * bundle never mentions them. Global search is scoped the same way.
 *
 * It is grouped by TOOL, because a flat row stopped answering the only
 * question it was being asked. "Runs" and "Batches" side by side say nothing
 * about which tool wrote them, and the count kept growing — every tool that
 * ships brings its own admin screens. So the platform-wide screens stay flat
 * and each tool collapses into one menu named after itself: the row stops
 * growing per tool, and a screen's owner is the label above it rather than a
 * prefix repeated on every entry.
 */
export const Route = createFileRoute('/dashboard')({
  loader: () => getPanelNav(),
  component: DashboardLayout,
})

const LINK_CLASS =
  'eyebrow text-muted-foreground hover:text-foreground relative py-1 transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-[width] after:duration-300 hover:after:w-full'

const LINK_ACTIVE = 'text-foreground after:w-full'

/** Groups in the order the registry first mentions them — one menu each. */
function groupsOf(nav: PanelNavItem[]) {
  const groups: { key: PanelGroup; items: PanelNavItem[] }[] = []

  for (const item of nav) {
    if (!item.group) continue
    const existing = groups.find((group) => group.key === item.group)
    if (existing) existing.items.push(item)
    else groups.push({ key: item.group, items: [item] })
  }

  return groups
}

function DashboardLayout() {
  const m = useMessages()
  const nav = Route.useLoaderData()
  const isAdmin = nav.length > 0
  const { pathname } = useLocation()

  const flat = nav.filter((item) => !item.group)
  const groups = groupsOf(nav)

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
            {m.nav.catalog}
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
                {m.nav.monitoring}
              </Link>

              {flat.map((item) => (
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

              {groups.length > 0 ? (
                <span className="bg-(--line) hidden h-4 w-px sm:block" aria-hidden />
              ) : null}

              {groups.map((group) => {
                // The trigger is not a link, so it cannot use activeProps —
                // it lights up when the open screen is one of its own.
                const open = group.items.some(
                  (item) => pathname === `/dashboard/${item.name}`,
                )

                return (
                  <DropdownMenu key={group.key}>
                    <DropdownMenuTrigger
                      className={`${LINK_CLASS} ${open ? LINK_ACTIVE : ''} inline-flex items-center outline-none`}
                    >
                      {m.nav[group.key]}
                      <ChevronDown className="ml-1 size-3" strokeWidth={1.5} />
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="start" className="min-w-44">
                      {group.items.map((item) => (
                        <DropdownMenuItem key={item.name} asChild>
                          <Link
                            to="/dashboard/$resource"
                            params={{ resource: item.name }}
                            className="cursor-pointer"
                          >
                            <PanelIcon name={item.icon} className="size-3.5" />
                            {item.label}
                            {item.badge === undefined ? null : (
                              <span className="text-muted-foreground/70 ml-auto">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              })}

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
