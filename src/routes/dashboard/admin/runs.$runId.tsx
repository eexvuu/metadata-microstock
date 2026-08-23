import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Eye, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
import type { MetadataRow } from '#/lib/engine/types'
import { getRunForAdmin, revealRunRows } from '#/lib/server/admin'

/**
 * One run, from the admin side — the counts on load, the rows on request.
 *
 * The split is deliberate. Everything above the fold comes from the loader and
 * is free; the metadata itself costs a click, because that click is what
 * `revealRunRows` writes into the audit log. Loading a page nobody read the
 * rows on should not accuse an admin of reading them.
 *
 * Read-only, and it has no thumbnails: previews live in the IndexedDB of the
 * browser that did the run and were never ours to serve.
 */
export const Route = createFileRoute('/dashboard/admin/runs/$runId')({
  loader: ({ params }) => getRunForAdmin({ data: { id: params.runId } }),
  component: AdminRunDetail,
})

function parseRows(json: string): MetadataRow[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as MetadataRow[]) : []
  } catch {
    return []
  }
}

function AdminRunDetail() {
  const run = Route.useLoaderData()
  const { runId } = Route.useParams()

  /** Revealed rows. Never in the loader, never persisted. */
  const [rows, setRows] = useState<MetadataRow[] | null>(null)
  const [revealing, setRevealing] = useState(false)

  const reveal = async () => {
    setRevealing(true)
    try {
      const { rows: json } = await revealRunRows({ data: { id: runId } })
      setRows(parseRows(json))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setRevealing(false)
    }
  }

  const days = run.resultExpiresAt
    ? Math.ceil((run.resultExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))
    : 0

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/dashboard/admin/users/$userId"
          params={{ userId: run.userId }}
          className="text-muted-foreground hover:text-foreground eyebrow inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="size-3" />
          {run.ownerName}
        </Link>
      </div>

      <PageHead
        index="Run"
        title={run.folderName}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{run.platform}</Badge>
            <Badge
              variant={
                run.status === 'complete'
                  ? 'default'
                  : run.status === 'error'
                    ? 'destructive'
                    : 'secondary'
              }
            >
              {run.status}
            </Badge>
          </div>
        }
      >
        <span className="font-mono text-xs">{run.ownerEmail}</span> ·{' '}
        {new Date(run.startedAt).toLocaleString()} · {run.tool}
      </PageHead>

      <dl className="border-(--line) grid grid-cols-2 gap-px border lg:grid-cols-4">
        {[
          ['Files done', `${run.filesDone}/${run.filesTotal}`],
          ['Fallbacks', run.fallbacks],
          ['Model', run.model],
          [
            'Result',
            run.resultExpiresAt
              ? `${days} day${days === 1 ? '' : 's'} left`
              : 'gone',
          ],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-card p-5">
            <dt className="eyebrow text-muted-foreground">{label}</dt>
            <dd className="mt-3 truncate font-mono text-sm">{value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="font-display text-xl font-medium tracking-tight">
          Result
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The metadata this run produced, kept for seven days after it finished.
          Opening it is recorded against you in the audit log, and{' '}
          {run.ownerName} is told in the tool that an admin can do this. Nothing
          here is editable — a wrong title is theirs to fix, on their own screen.
        </p>

        {!run.resultExpiresAt ? (
          <p className="border-(--line) text-muted-foreground mt-4 border border-dashed py-8 text-center font-mono text-xs">
            no rows kept for this run — expired, or the run never finished
          </p>
        ) : rows === null ? (
          <div className="border-(--line) mt-4 border border-dashed py-8 text-center">
            <Button variant="outline" disabled={revealing} onClick={() => void reveal()}>
              {revealing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              Open the result
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="border-(--line) text-muted-foreground mt-4 border border-dashed py-8 text-center font-mono text-xs">
            the saved rows could not be read
          </p>
        ) : (
          <div className="border-(--line) mt-4 overflow-x-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-64">Filename</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead className="w-20">Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${row.filename}-${index}`}>
                    <TableCell className="max-w-64 truncate font-mono text-xs">
                      {row.filename}
                      {row.fallback ? (
                        <Badge variant="destructive" className="ml-2">
                          {row.fallback}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.title}
                      {row.description ? (
                        <span className="text-muted-foreground mt-1 block text-xs">
                          {row.description}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-96 text-xs">
                      {row.keywords}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {row.category}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
