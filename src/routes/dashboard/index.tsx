import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, KeyRound, Sparkles } from 'lucide-react'

import { PageHead } from '#/components/page-head'
import { Button } from '#/components/ui/button'
import { useLocale, useMessages } from '#/lib/i18n'
import { listGeminiKeys } from '#/lib/server/gemini-keys'
import { listRuns } from '#/lib/server/runs'

/**
 * The catalog.
 *
 * Stockflow is a shelf of tools, not one app with a dashboard — so the first
 * screen after signing in is the shelf, with the state that decides whether a
 * tool can run (keys) sitting right next to it.
 */
export const Route = createFileRoute('/dashboard/')({
  loader: async () => ({
    keys: await listGeminiKeys(),
    runs: await listRuns(),
  }),
  component: CatalogPage,
})

function CatalogPage() {
  const m = useMessages()
  const { tag } = useLocale()
  const { keys, runs } = Route.useLoaderData()
  const activeKeys = keys.filter((key) => key.status === 'active').length
  const files = runs.reduce((total, run) => total + run.filesDone, 0)

  return (
    <div className="space-y-8">
      <PageHead index={m.catalog.index} title={m.catalog.title}>
        {m.catalog.lead}
      </PageHead>

      <div className="grid gap-px sm:grid-cols-2">
        <article className="border-(--line) bg-card group border p-6">
          <div className="flex items-center justify-between">
            <Sparkles className="text-primary size-5" strokeWidth={1.5} />
            <span className="border-primary/40 text-primary border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase">
              {m.catalog.free}
            </span>
          </div>

          <h2 className="font-display mt-5 text-2xl font-medium">
            {m.nav.metadata}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm text-pretty">
            {m.catalog.metadataBody}
          </p>

          <dl className="text-muted-foreground mt-5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[0.7rem]">
            <div className="flex gap-1.5">
              <dt>{m.catalog.statRuns}</dt>
              <dd className="text-foreground tabular-nums">{runs.length}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{m.catalog.statFiles}</dt>
              <dd className="text-foreground tabular-nums">{files}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{m.catalog.statKeys}</dt>
              <dd className="text-foreground tabular-nums">{activeKeys}</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild className="eyebrow">
              <Link to="/tools/metadata">
                {m.catalog.open}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {activeKeys === 0 ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-xs">
                <KeyRound className="size-3.5" />
                {m.catalog.needKey}
              </span>
            ) : null}
          </div>
        </article>

        <article className="border-(--line) border border-dashed p-6">
          <div className="flex items-center justify-between">
            <span className="border-(--line) text-muted-foreground flex size-5 items-center justify-center border font-mono text-[0.6rem]">
              +
            </span>
            <span className="eyebrow text-muted-foreground/60">
              {m.catalog.planned}
            </span>
          </div>

          <h2 className="font-display text-muted-foreground mt-5 text-2xl font-medium">
            {m.catalog.nextTitle}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm text-pretty">
            {m.catalog.nextBody}
          </p>
        </article>
      </div>

      {runs.length > 0 ? (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-medium tracking-tight">
              {m.catalog.lastRun}
            </h2>
            <Link
              to="/dashboard/history"
              className="text-muted-foreground hover:text-primary eyebrow inline-flex items-center gap-1.5"
            >
              {m.catalog.fullHistory}
              <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="border-(--line) bg-card mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 border p-4 font-mono text-xs">
            <span className="text-foreground truncate">
              {runs[0].folderName}
            </span>
            <span className="text-muted-foreground capitalize">
              {runs[0].platform}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {m.catalog.files(runs[0].filesDone, runs[0].filesTotal)}
            </span>
            <span className="text-primary">{runs[0].status}</span>
            <span className="text-muted-foreground ml-auto">
              {new Date(runs[0].startedAt).toLocaleString(tag)}
            </span>
          </div>
        </section>
      ) : null}
    </div>
  )
}
