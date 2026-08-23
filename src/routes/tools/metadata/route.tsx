import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, History, KeyRound, Sparkles } from 'lucide-react'

import { KeysDialog } from '#/components/generator/keys-dialog'
import { useMessages } from '#/lib/i18n'
import { listGeminiKeys } from '#/lib/server/gemini-keys'

/**
 * The metadata tool's own shell.
 *
 * Every tool on the shelf gets one of these rather than borrowing the
 * dashboard's: a tool's history, its settings and the keys it spends belong to
 * the tool, and the moment a second tool exists a shared `/dashboard/history`
 * would mix two kinds of run in one table. The dashboard is the shelf; this is
 * the room.
 *
 * Keys are loaded here, once, because both screens under it want the same
 * answer — and `router.invalidate()` from the dialog refreshes them for both.
 */
export const Route = createFileRoute('/tools/metadata')({
  loader: () => listGeminiKeys(),
  component: MetadataShell,
})

const LINK_CLASS =
  'eyebrow text-muted-foreground hover:text-foreground relative py-1 transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-[width] after:duration-300 hover:after:w-full'

const LINK_ACTIVE = 'text-foreground after:w-full'

function MetadataShell() {
  const m = useMessages()
  const keys = Route.useLoaderData()
  const active = keys.filter((key) => key.status === 'active').length

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
              {m.nav.metadata}
            </h1>
            <span className="border-primary/40 text-primary border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase">
              {m.catalog.free}
            </span>
          </div>

          <div className="text-muted-foreground ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
            <span>{m.tool.keyCount(active)}</span>
            <KeysDialog keys={keys}>
              <button
                type="button"
                className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
              >
                <KeyRound className="size-3" />
                {m.tool.keysButton}
              </button>
            </KeysDialog>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            to="/tools/metadata"
            activeOptions={{ exact: true }}
            activeProps={{ className: LINK_ACTIVE }}
            className={LINK_CLASS}
          >
            <Sparkles className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
            {m.tool.tabGenerate}
          </Link>
          <Link
            to="/tools/metadata/history"
            activeProps={{ className: LINK_ACTIVE }}
            className={LINK_CLASS}
          >
            <History className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
            {m.tool.tabHistory}
          </Link>
        </nav>
      </header>

      <Outlet />
    </div>
  )
}
