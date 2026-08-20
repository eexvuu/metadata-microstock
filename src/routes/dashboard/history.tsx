import { Link, createFileRoute } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'

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
import { useLocale, useMessages } from '#/lib/i18n'
import { listRuns } from '#/lib/server/runs'

/**
 * Your own runs, newest first, capped at 25 by the server function.
 *
 * The counts are reported by the browser that did the work — see the warning
 * at the top of `src/lib/server/runs.ts` before building anything that trusts
 * them for billing.
 */
export const Route = createFileRoute('/dashboard/history')({
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
