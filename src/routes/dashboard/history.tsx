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
  const runs = Route.useLoaderData()
  const files = runs.reduce((total, run) => total + run.filesDone, 0)

  return (
    <div className="space-y-8">
      <PageHead index="Account" title="History">
        {runs.length === 0
          ? 'Nothing yet — add a Gemini key and point the metadata tool at a folder.'
          : `${files} file${files === 1 ? '' : 's'} across your last ${runs.length} run${runs.length === 1 ? '' : 's'}, reported by the browser that did the work.`}
      </PageHead>

      {runs.length === 0 ? (
        <div className="border-(--line) flex flex-col items-center gap-4 border border-dashed py-14">
          <p className="text-muted-foreground font-mono text-xs">
            no runs recorded
          </p>
          <Button asChild size="sm">
            <Link to="/dashboard/generate" className="eyebrow">
              <Sparkles className="size-4" />
              Open the metadata tool
            </Link>
          </Button>
        </div>
      ) : (
        <div className="border-(--line) overflow-x-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folder</TableHead>
                <TableHead className="w-32">Platform</TableHead>
                <TableHead className="w-28">Files</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-44">Started</TableHead>
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
                        ({run.fallbacks} fallback)
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[run.status] ?? 'secondary'}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {new Date(run.startedAt).toLocaleString()}
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
