import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Coins, PenTool } from 'lucide-react'

import { getVectorOverview } from '#/lib/server/vector'
import { useMessages } from '#/lib/i18n'

/**
 * The vectorizer's own room, built like the metadata tool's — every tool on
 * this shelf gets one, and its runs stay inside it.
 *
 * The copy was English and hardcoded while this tool was admin-only, on the
 * reasoning that translating a screen with one reader is copy that gets
 * rewritten before anyone sees it. Releasing it is exactly the moment that
 * stopped being true, so it went through the i18n pass with everything else —
 * `m.vectorizer` in `src/lib/i18n/`.
 *
 * The loader is `getVectorOverview`, which requires a session and nothing
 * more. It is also where an account that predates the trial credit gets it,
 * so the balance in this header is correct on a first visit rather than on a
 * second.
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
              {m.vectorizer.badge}
            </span>
          </div>

          <div className="text-muted-foreground ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5">
              <Coins className="size-3.5" />
              {m.vectorizer.tokens(balance)}
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
            {m.vectorizer.vectorize}
          </Link>
        </nav>
      </header>

      <Outlet />
    </div>
  )
}
