import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ArrowLeft, Download, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

import { BulkDownload } from '#/components/vectorizer/bulk-download'
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
import { useMessages } from '#/lib/i18n'
import { getVectorDownload, getVectorJob } from '#/lib/server/vector'

/**
 * One batch, file by file.
 *
 * It polls while there is anything left to happen, because the thing doing the
 * work is a process on another machine — there is no socket back from it, and
 * a run can take an hour if a CAPTCHA lands in the middle. The interval stops
 * the moment the job settles, so an open tab is not a permanent five-second
 * query.
 *
 * Downloads are minted on the click rather than rendered into the page: the
 * row holds an R2 object key, and the presigned URL that key turns into lives
 * fifteen minutes. A page left open overnight has no stale capabilities in it.
 */
export const Route = createFileRoute('/tools/vectorizer/jobs/$jobId')({
  loader: ({ params }) => getVectorJob({ data: { jobId: params.jobId } }),
  component: JobPage,
})

const SETTLED = ['complete', 'partial', 'failed', 'canceled']

const FILE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  done: 'default',
  running: 'secondary',
  queued: 'secondary',
  awaiting_upload: 'outline',
  failed: 'destructive',
}

function JobPage() {
  const copy = useMessages().vectorizer
  const m = copy.job
  const { job, files } = Route.useLoaderData()
  const router = useRouter()

  const settled = SETTLED.includes(job.status)

  useEffect(() => {
    if (settled) return

    const timer = setInterval(() => void router.invalidate(), 5000)
    return () => clearInterval(timer)
  }, [settled, router])

  const download = async (fileId: string, format: 'svg' | 'eps' | 'source') => {
    try {
      const { url, filename } = await getVectorDownload({ data: { fileId, format } })

      // A plain anchor with `download` cannot rename a cross-origin file, and
      // R2 will not add the header for us on a presigned GET — so the name is
      // best-effort and the bytes are what matter.
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.rel = 'noopener'
      anchor.click()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const ready = files.filter((file) => file.status === 'done').length

  return (
    <div className="space-y-8">
      <PageHead
        index={copy.index}
        title={job.label}
        action={
          <Button asChild variant="ghost" className="eyebrow">
            <Link to="/tools/vectorizer">
              <ArrowLeft className="size-3.5" />
              {m.back}
            </Link>
          </Button>
        }
      >
        {m.progress(job.filesDone, job.filesTotal)}
        {job.filesFailed ? m.refunded(job.filesFailed) : ''} ·{' '}
        {m.charged(job.tokensCharged)}
        {settled ? '' : ` · ${m.refreshing}`}
      </PageHead>

      <BulkDownload jobId={job.id} ready={ready} />

      <div className="border-(--line) border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.file}</TableHead>
              <TableHead>{copy.jobs.status}</TableHead>
              <TableHead>{m.note}</TableHead>
              <TableHead className="text-right">{m.download}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-mono text-xs">{file.filename}</TableCell>
                <TableCell>
                  <Badge variant={FILE_VARIANT[file.status] ?? 'outline'}>
                    {file.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-md truncate text-xs">
                  {file.error}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {file.status === 'done' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="eyebrow"
                        onClick={() => void download(file.id, 'source')}
                      >
                        <ImageIcon className="size-3.5" />
                        {m.original}
                      </Button>
                    ) : null}
                    {file.hasSvg ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="eyebrow"
                        onClick={() => void download(file.id, 'svg')}
                      >
                        <Download className="size-3.5" />
                        {m.svg}
                      </Button>
                    ) : null}
                    {file.hasEps ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="eyebrow"
                        onClick={() => void download(file.id, 'eps')}
                      >
                        <Download className="size-3.5" />
                        {m.eps}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
