import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Coins, PenTool } from 'lucide-react'

import { getVectorOverview } from '#/lib/server/vector'
import { useMessages } from '#/lib/i18n'

/**
 * The vectorizer's own room, built like the metadata tool's — every tool on
 * this shelf gets one, and its runs stay inside it.
 *
 * The copy is English and hardcoded, unlike the metadata tool. That matches
 * `src/routes/dashboard/admin/*`, and for the same reason: this screen has one
 * audience, and translating a tool that is not released yet is copy that will
 * be rewritten before anyone reads it. Publishing this tool means an i18n pass,
 * and that is the point at which the wording is worth settling.
 *
 * The loader is `getVectorOverview`, which starts with `requireAdmin()`. That
 * redirect is the gate — a non-admin who types the URL lands on their own
 * dashboard, and never learns the route resolves.
 */
export const Route = createFileRoute('/tools/vectorizer')({
  loader: () => getVectorOverview(),
  component: VectorizerShell,
})

const LINK_CLASS =
  'eyebrow text-muted-foreground hover:text-foreground relative py-1 transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-[width] after:duration-300 hover:after:w-full'

const LINK_ACTIVE = 'text-foreground after:w-full'

function VectorizerShell() {
  const m = useMessages()
  const { balance } = Route.useLoaderData()

  return (
    <div className="space-y-6">
      <header className="border-(--line) space-y-4 border-b pb-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            to="/dashboard"
            className="text-muted-foreground hover:text-foreground eyebrow inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="size-3" />
            {m.nav.tools}
          </Link>

          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-2xl leading-none font-medium tracking-tight">
              Vectorizer
            </h1>
            <span className="border-primary/40 text-primary border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase">
              admin only
            </span>
          </div>

          <div className="text-muted-foreground ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5">
              <Coins className="size-3.5" />
              {balance} token{balance === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            to="/tools/vectorizer"
            activeOptions={{ exact: true }}
            activeProps={{ className: LINK_ACTIVE }}
            className={LINK_CLASS}
          >
            <PenTool className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
            Vectorize
          </Link>
        </nav>
      </header>

      <Outlet />
    </div>
  )
}
