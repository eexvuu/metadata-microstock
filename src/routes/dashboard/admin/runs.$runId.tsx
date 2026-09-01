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
import type { MetadataRow } from '#/lib/engine/types'
import { getRunForAdmin, revealRunMedia, revealRunRows } from '#/lib/server/admin'

/**
 * One run, from the admin side — the counts on load, the rows on request.
 *
 * The split is deliberate. Everything above the fold comes from the loader and
 * is free; the metadata itself costs a click, because that click is what
 * `revealRunRows` writes into the audit log. Loading a page nobody read the
 * rows on should not accuse an admin of reading them.
 *
 * Read-only, and there are two reveals on it now rather than one: the rows the
 * run produced, and (2026-09-01) the files it was given. Both cost a click for
 * the same reason, and both write the same kind of audit row.
 *
 * The thumbnails the contributor sees are still not here — those live in the
 * IndexedDB of the browser that did the run. What this screen draws is the
 * archived original itself, straight from R2 on a presigned URL.
 */
export const Route = createFileRoute('/dashboard/admin/runs/$runId')({
  loader: ({ params }) => getRunForAdmin({ data: { id: params.runId } }),
  component: AdminRunDetail,
})

interface RevealedFile {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  kind: string
  url: string
}

/** Empty keywords is 0, not 1 — `''.split(',')` would say otherwise. */
function countKeywords(keywords: string): number {
  return keywords.split(',').filter((keyword) => keyword.trim()).length
}

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

  /** The archived originals, on the same terms — and the same non-persistence. */
  const [files, setFiles] = useState<RevealedFile[] | null>(null)
  const [opening, setOpening] = useState(false)

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

  const openFiles = async () => {
    setOpening(true)
    try {
      setFiles(await revealRunMedia({ data: { id: runId } }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setOpening(false)
    }
  }

  /** Names need room; a number 1-21 does not. Both wrap either way. */
  const categoryWidth = run.platform === 'shutterstock' ? 'w-44' : 'w-16'

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
          The metadata this run produced, kept for 30 days after it finished.
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
          /*
           * `TableCell` is `whitespace-nowrap` by default, which a 49-keyword
           * string does not survive: the text ran straight out of its cell and
           * painted over the category next door. Keywords and titles wrap
           * here; the columns that are short by nature keep the default.
           */
          <div className="border-(--line) mt-4 overflow-x-auto border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-56">Filename</TableHead>
                  <TableHead className="w-72">Title</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead className="w-12 text-right">KW</TableHead>
                  {/*
                    Adobe's category is a number 1-21; Shutterstock's is one or
                    two names, and "Abstract,Signs/Symbols" in a column sized
                    for "12" was the second thing to run out of its cell and
                    over the neighbour. Both widths wrap now — the platform
                    only decides how much room to give it up front.
                  */}
                  <TableHead className={categoryWidth}>Cat</TableHead>
                  <TableHead className="w-44">Model</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${row.filename}-${index}`}>
                    <TableCell
                      className="truncate align-top font-mono text-xs"
                      title={row.filename}
                    >
                      {row.filename}
                      {row.fallback ? (
                        <Badge variant="destructive" className="ml-2">
                          {row.fallback}
                        </Badge>
                      ) : null}
                    </TableCell>
                    {/*
                      Adobe writes a title, Shutterstock writes a description,
                      and a Shutterstock row has no title at all — so whichever
                      one the platform produced is the row's text, and the
                      second line only appears when there really are two.
                    */}
                    <TableCell className="align-top text-sm whitespace-normal">
                      {row.title || row.description}
                      {row.title && row.description ? (
                        <span className="text-muted-foreground mt-1 block text-xs">
                          {row.description}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground align-top text-xs whitespace-normal">
                      {row.keywords}
                    </TableCell>
                    {/*
                      The count is the fastest quality read there is: a row
                      that came back with twelve keywords is a row worth
                      asking about, and it is invisible in the wall of text.
                    */}
                    <TableCell className="align-top text-right font-mono text-xs tabular-nums">
                      {countKeywords(row.keywords)}
                    </TableCell>
                    <TableCell
                      className={`${categoryWidth} align-top font-mono text-xs break-words whitespace-normal tabular-nums`}
                    >
                      {row.category}
                    </TableCell>
                    {/*
                      The one screen where a model id belongs. Everywhere the
                      contributor can see, it is scrubbed on purpose — here it
                      is the whole point: with the ladder, two rows of the same
                      run can come from different models, and support cannot
                      tell "the keywords are thin" from "that key had demoted"
                      without it. Blank for runs that predate the field.
                    */}
                    <TableCell className="text-muted-foreground align-top font-mono text-[0.7rem]">
                      {row.model ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-medium tracking-tight">
          Files
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The originals this run was given, uploaded by {run.ownerName}'s
          browser after it finished and kept for the same 30 days. Opening them
          is recorded against you, and the tool tells them an admin can do it.
          This is how "it read my photo as a dog" gets answered — a file that
          cannot be drawn here (a .ai, a ProRes master) still has a link.
        </p>

        {files === null ? (
          <div className="border-(--line) mt-4 border border-dashed py-8 text-center">
            <Button variant="outline" disabled={opening} onClick={() => void openFiles()}>
              {opening ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              Open the files
            </Button>
          </div>
        ) : files.length === 0 ? (
          <p className="border-(--line) text-muted-foreground mt-4 border border-dashed py-8 text-center font-mono text-xs">
            nothing was kept for this run
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-5">
            {files.map((file) => (
              <figure key={file.id} className="bg-card border-(--line) border">
                <MediaPreview
                  url={file.url}
                  contentType={file.contentType}
                  filename={file.filename}
                />
                <figcaption className="text-muted-foreground space-y-0.5 p-2">
                  <span
                    className="block truncate font-mono text-[0.7rem]"
                    title={file.filename}
                  >
                    {file.filename}
                  </span>
                  <span className="block font-mono text-[0.65rem]">
                    {formatBytes(file.sizeBytes)}
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
