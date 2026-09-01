import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Eye, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { MediaPreview, formatBytes } from '#/components/admin/media-preview'
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
import { getVectorJobForAdmin, revealVectorFiles } from '#/lib/server/admin'

/**
 * One vectorize batch, from the admin side.
 *
 * The twin of `runs.$runId.tsx`, and built to the same split: the loader
 * carries the counts and each file's queue state — status, attempts, the one
 * line a worker left — because that answers most support questions on its own.
 * "It vectorized it wrong" is the question that needs the pictures, and those
 * cost a click, because the click is what `revealVectorFiles` writes into the
 * audit log.
 *
 * The batch screen the owner has is not this: they get a zip. Here the three
 * objects are three links, because an admin is looking at one file, not saving
 * two hundred.
 */
export const Route = createFileRoute('/dashboard/admin/vector-jobs/$jobId')({
  loader: ({ params }) => getVectorJobForAdmin({ data: { id: params.jobId } }),
  component: AdminVectorJob,
})

interface RevealedFile {
  id: string
  filename: string
  contentType: string
  source: string
  svg: string | null
  eps: string | null
}

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  done: 'default',
  complete: 'default',
  running: 'secondary',
  queued: 'secondary',
  partial: 'secondary',
  awaiting_upload: 'outline',
  uploading: 'outline',
  failed: 'destructive',
  expired: 'destructive',
}

function AdminVectorJob() {
  const job = Route.useLoaderData()
  const { jobId } = Route.useParams()

  /** Revealed files. Never in the loader, never persisted. */
  const [files, setFiles] = useState<RevealedFile[] | null>(null)
  const [opening, setOpening] = useState(false)

  const open = async () => {
    setOpening(true)
    try {
      setFiles(await revealVectorFiles({ data: { id: jobId } }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/dashboard/admin/users/$userId"
          params={{ userId: job.userId }}
          className="text-muted-foreground hover:text-foreground eyebrow inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="size-3" />
          {job.ownerName}
        </Link>
      </div>

      <PageHead
        index="Batch"
        title={job.label}
        action={
          <Badge variant={STATUS_VARIANTS[job.status] ?? 'secondary'}>
            {job.status}
          </Badge>
        }
      >
        <span className="font-mono text-xs">{job.ownerEmail}</span> ·{' '}
        {new Date(job.createdAt).toLocaleString()}
      </PageHead>

      <dl className="border-(--line) grid grid-cols-2 gap-px border lg:grid-cols-4">
        {[
          ['Done', `${job.filesDone}/${job.filesTotal}`],
          ['Failed', job.filesFailed],
          ['Tokens charged', job.tokensCharged],
          [
            'Finished',
            job.finishedAt ? new Date(job.finishedAt).toLocaleString() : '—',
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
          Queue
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          What the worker made of each file. `attempts` past one means a worker
          died holding it or the trace failed and it went back on the queue;
          past the limit it is refunded and the original is deleted.
        </p>

        <div className="border-(--line) mt-4 overflow-x-auto border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-72">Filename</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-20 text-right">Size</TableHead>
                <TableHead className="w-16 text-right">Tries</TableHead>
                <TableHead className="w-20">Out</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell
                    className="truncate align-top font-mono text-xs"
                    title={file.filename}
                  >
                    {file.filename}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={STATUS_VARIANTS[file.status] ?? 'secondary'}>
                      {file.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top text-right font-mono text-xs tabular-nums">
                    {formatBytes(file.sizeBytes)}
                  </TableCell>
                  <TableCell className="align-top text-right font-mono text-xs tabular-nums">
                    {file.attempts}
                  </TableCell>
                  <TableCell className="text-muted-foreground align-top font-mono text-[0.7rem]">
                    {[file.hasSvg ? 'svg' : null, file.hasEps ? 'eps' : null]
                      .filter(Boolean)
                      .join(' ') || '—'}
                  </TableCell>
                  {/*
                    A worker's line, wrapped: `TableCell` is nowrap by default
                    and a vectorizer.ai message runs well past its column.
                  */}
                  <TableCell className="text-muted-foreground align-top text-xs whitespace-normal">
                    {file.error ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-medium tracking-tight">
          Artwork
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          What went in and what came back, for as long as the bucket keeps them
          — 30 days from the batch. Opening them is recorded against you, and
          the tool tells {job.ownerName} an admin can do it. A tile that will
          not draw is a file R2 has already reclaimed, or one this browser
          cannot render; the link still works either way.
        </p>

        {files === null ? (
          <div className="border-(--line) mt-4 border border-dashed py-8 text-center">
            <Button variant="outline" disabled={opening} onClick={() => void open()}>
              {opening ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              Open the artwork
            </Button>
          </div>
        ) : files.length === 0 ? (
          <p className="border-(--line) text-muted-foreground mt-4 border border-dashed py-8 text-center font-mono text-xs">
            this batch has no files
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-5">
            {files.map((file) => (
              <figure key={file.id} className="bg-card border-(--line) border">
                <MediaPreview
                  url={file.source}
                  contentType={file.contentType}
                  filename={file.filename}
                />
                <figcaption className="text-muted-foreground space-y-1 p-2">
                  <span
                    className="block truncate font-mono text-[0.7rem]"
                    title={file.filename}
                  >
                    {file.filename}
                  </span>
                  <span className="flex gap-2 font-mono text-[0.65rem]">
                    {file.svg ? (
                      <a
                        href={file.svg}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground underline"
                      >
                        svg
                      </a>
                    ) : null}
                    {file.eps ? (
                      <a
                        href={file.eps}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground underline"
                      >
                        eps
                      </a>
                    ) : null}
                    {!file.svg && !file.eps ? <span>no output</span> : null}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
