import { Link, createFileRoute } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'

import { PageHead } from '#/components/page-head'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { purgeThumbnails } from '#/lib/generator/thumbnails'
import { useLocale, useMessages } from '#/lib/i18n'
import { listRuns } from '#/lib/server/runs'

/**
 * Your own runs, newest first, capped at 25 by the server function.
 *
 * The counts are reported by the browser that did the work — see the warning
 * at the top of `src/lib/server/runs.ts` before building anything that trusts
 * them for billing.
 *
 * A run whose result is still saved links to it. The rest show why they do
 * not, rather than a dead column: seven days is short enough that someone will
 * meet the edge, and "expired" is a better answer than an empty cell.
 */
export const Route = createFileRoute('/tools/metadata/history')({
  loader: () => listRuns(),
  component: HistoryPage,
})

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  complete: 'default',
  running: 'secondary',
  partial: 'secondary',
  error: 'destructive',
}

function HistoryPage() {
  const m = useMessages()
  const { tag } = useLocale()
  const runs = Route.useLoaderData()
  const files = runs.reduce((total, run) => total + run.filesDone, 0)

  /*
   * The one place that knows both halves: which runs the server still has, and
   * what this browser is holding for them. Thumbnails for anything expired or
   * gone are dropped here rather than lingering until the origin is cleared.
   */
  useEffect(() => {
    void purgeThumbnails(runs.map((run) => run.id)).catch((error: unknown) => {
      console.warn('[stockflow] could not purge stored previews:', error)
    })
  }, [runs])

  return (
    <div className="space-y-8">
      <PageHead index={m.history.index} title={m.history.title}>
        {runs.length === 0
          ? m.history.empty
          : m.history.summary(files, runs.length)}
      </PageHead>

      {runs.length === 0 ? (
        <div className="border-(--line) flex flex-col items-center gap-4 border border-dashed py-14">
          <p className="text-muted-foreground font-mono text-xs">
            {m.history.noRuns}
          </p>
          <Button asChild size="sm">
            <Link to="/tools/metadata" className="eyebrow">
              <Sparkles className="size-4" />
              {m.history.openTool}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="border-(--line) overflow-x-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.history.columns.folder}</TableHead>
                <TableHead className="w-32">
                  {m.history.columns.platform}
                </TableHead>
                <TableHead className="w-28">{m.history.columns.files}</TableHead>
                <TableHead className="w-28">
                  {m.history.columns.status}
                </TableHead>
                <TableHead className="w-44">
                  {m.history.columns.started}
                </TableHead>
                <TableHead className="w-32 text-right">
                  {m.history.columns.result}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="max-w-64 truncate font-mono text-xs">
                    {run.folderName}
                  </TableCell>
                  <TableCell className="text-sm capitalize">
                    {run.platform}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {run.filesDone}/{run.filesTotal}
                    {run.fallbacks > 0 ? (
                      <span className="text-destructive ml-1">
                        {m.history.fallbacks(run.fallbacks)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[run.status] ?? 'secondary'}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {new Date(run.startedAt).toLocaleString(tag)}
                  </TableCell>
                  <TableCell className="text-right">
                    {run.resultExpiresAt ? (
                      <Link
                        to="/tools/metadata/history/$runId"
                        params={{ runId: run.id }}
                        className="text-primary eyebrow hover:underline"
                      >
                        {m.history.open}
                        <span className="text-muted-foreground ml-1.5 font-mono text-[0.6rem] normal-case">
                          {m.history.expiresIn(
                            Math.ceil(
                              (run.resultExpiresAt - Date.now()) /
                                (24 * 60 * 60 * 1000),
                            ),
                          )}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/60 font-mono text-[0.65rem]">
                        {m.history.expired}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {runs.length > 0 ? (
        <p className="text-muted-foreground max-w-2xl text-sm">
          {m.history.resultsNote}
        </p>
      ) : null}
    </div>
  )
}
