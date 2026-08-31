import { Link, createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AlertTriangle, ArrowRight, Loader2, Play, X } from 'lucide-react'
import { toast } from 'sonner'

import { ImagePicker } from '#/components/vectorizer/image-picker'
import { PageHead } from '#/components/page-head'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { useMessages } from '#/lib/i18n'
import { createVectorJob, startVectorJob } from '#/lib/server/vector'

/**
 * Drop images, pay tokens, wait for a worker.
 *
 * The upload does NOT go through our server. `createVectorJob` hands back one
 * presigned R2 URL per file and the browser PUTs to each of them directly —
 * see `src/lib/server/r2.ts` for why that is the rule and not an optimisation.
 * Four at a time, because this is a home connection uploading artwork, not a
 * datacentre.
 *
 * The batch is charged when the job is created and refunded per file that
 * never arrives or never works. That ordering is deliberate: charging after
 * the upload would mean a batch that cannot be paid for is discovered after
 * somebody waited ten minutes for it to upload.
 */
export const Route = createFileRoute('/tools/vectorizer/')({
  component: VectorizePage,
})

const shell = getRouteApi('/tools/vectorizer')

type LedgerCopy = ReturnType<typeof useMessages>['vectorizer']['ledger']

/**
 * `reason` arrives as the word the ledger stores. A locale has a phrase for
 * each one it knows about and the raw value is the fallback, so a reason added
 * to the database before it is added to the dictionary reads oddly rather than
 * rendering an empty column.
 */
function reasonLabel(copy: LedgerCopy, reason: string): string {
  return reason in copy ? copy[reason as keyof LedgerCopy] : reason
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  complete: 'default',
  running: 'secondary',
  queued: 'secondary',
  uploading: 'outline',
  partial: 'secondary',
  failed: 'destructive',
}

/** One at a time is slower than the link; twenty at a time is slower than four. */
const UPLOAD_CONCURRENCY = 4

function VectorizePage() {
  const m = useMessages().vectorizer
  const router = useRouter()
  const overview = shell.useLoaderData()

  const [files, setFiles] = useState<File[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const cost = files.length
  const affordable = cost > 0 && cost <= overview.balance

  const submit = async () => {
    setBusy(true)
    setProgress({ done: 0, total: files.length })

    try {
      const job = await createVectorJob({
        data: {
          label: label.trim() || m.batch.placeholder(files.length),
          files: files.map((file) => ({
            filename: file.name,
            contentType: file.type as 'image/png',
            sizeBytes: file.size,
          })),
        },
      })

      const byName = new Map(files.map((file) => [file.name, file]))
      const uploaded: string[] = []
      const queue = [...job.uploads]

      // A worker per slot pulling from one queue, rather than chunks: a folder
      // of mixed sizes finishes when the last file does, not when the slowest
      // chunk does.
      const lane = async () => {
        for (;;) {
          const next = queue.shift()
          if (!next) return

          const file = byName.get(next.filename)
          if (!file) continue

          try {
            const response = await fetch(next.url, {
              method: 'PUT',
              body: file,
              headers: { 'Content-Type': next.contentType },
            })

            if (response.ok) uploaded.push(next.fileId)
            else
              toast.error(
                m.batch.uploadFailed(
                  next.filename,
                  m.batch.uploadFailedStatus(response.status),
                ),
              )
          } catch (error) {
            toast.error(
              m.batch.uploadFailed(
                next.filename,
                error instanceof Error ? error.message : m.batch.uploadFailedPlain,
              ),
            )
          }

          setProgress((current) => ({ ...current, done: current.done + 1 }))
        }
      }

      await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, lane))

      const result = await startVectorJob({ data: { jobId: job.jobId, uploaded } })

      if (result.refunded) {
        toast.warning(m.toast.refunded(result.refunded))
      }

      if (result.queued === 0) {
        toast.error(m.toast.nothingQueued)
      } else {
        toast.success(m.toast.queued(result.queued))
        setFiles([])
        setLabel('')
      }

      await router.invalidate()
      if (result.queued) router.navigate({ to: '/tools/vectorizer/jobs/$jobId', params: { jobId: job.jobId } })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHead index={m.index} title={m.title}>
        {m.lead(overview.trial)}
      </PageHead>

      <p className="text-muted-foreground border-(--line) border-l-2 pl-4 text-sm text-pretty">
        {m.queueNote}
      </p>

      {overview.storageReady ? null : (
        <p className="border-destructive/40 text-destructive flex items-start gap-2 border p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {m.storageMissing}
        </p>
      )}

      <section className="space-y-4">
        <ImagePicker
          accepted={overview.accepted}
          maxBytes={overview.maxFileBytes}
          maxFiles={overview.maxFiles}
          files={files}
          onChange={setFiles}
          disabled={busy || !overview.storageReady}
        />

        {files.length ? (
          <div className="border-(--line) space-y-4 border p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-56 grow space-y-1.5">
                <Label htmlFor="vector-label" className="eyebrow text-muted-foreground">
                  {m.batch.label}
                </Label>
                <Input
                  id="vector-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={m.batch.placeholder(files.length)}
                  disabled={busy}
                  maxLength={120}
                />
              </div>

              <div className="text-muted-foreground font-mono text-xs">
                {m.batch.cost(files.length, cost, overview.balance)}
              </div>

              <Button
                className="eyebrow ml-auto"
                disabled={busy || !affordable || !overview.storageReady}
                onClick={submit}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {busy ? m.batch.uploading(progress.done, progress.total) : m.batch.queue}
              </Button>
            </div>

            {affordable ? null : (
              <p className="text-destructive font-mono text-xs">
                {m.batch.cantAfford(cost, overview.balance)}
              </p>
            )}

            <ul className="text-muted-foreground grid gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file) => (
                <li key={file.name} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setFiles(files.filter((entry) => entry.name !== file.name))}
                    className="hover:text-foreground"
                    aria-label={m.batch.remove(file.name)}
                  >
                    <X className="size-3" />
                  </button>
                  <span className="truncate">{file.name}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium tracking-tight">
          {m.jobs.heading}
        </h2>

        {overview.jobs.length === 0 ? (
          <p className="text-muted-foreground text-sm">{m.jobs.empty}</p>
        ) : (
          <div className="border-(--line) border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.jobs.batch}</TableHead>
                  <TableHead>{m.jobs.status}</TableHead>
                  <TableHead className="text-right">{m.jobs.done}</TableHead>
                  <TableHead className="text-right">{m.jobs.failed}</TableHead>
                  <TableHead className="text-right">{m.jobs.tokens}</TableHead>
                  <TableHead className="text-right">{m.jobs.created}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.label}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[job.status] ?? 'outline'}>{job.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {job.filesDone}/{job.filesTotal}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{job.filesFailed}</TableCell>
                    <TableCell className="text-right tabular-nums">{job.tokensCharged}</TableCell>
                    <TableCell className="text-muted-foreground text-right font-mono text-xs">
                      {new Date(job.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm" className="eyebrow">
                        <Link to="/tools/vectorizer/jobs/$jobId" params={{ jobId: job.id }}>
                          {m.jobs.open}
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {overview.ledger.length ? (
        <section className="border-(--line) space-y-2 border p-4">
          <p className="eyebrow text-muted-foreground">{m.ledger.heading}</p>
          <ul className="text-muted-foreground space-y-1 font-mono text-xs">
            {overview.ledger.slice(0, 8).map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3">
                <span
                  className={
                    entry.delta > 0 ? 'text-primary w-10 tabular-nums' : 'w-10 tabular-nums'
                  }
                >
                  {entry.delta > 0 ? '+' : ''}
                  {entry.delta}
                </span>
                <span className="w-28">{reasonLabel(m.ledger, entry.reason)}</span>
                <span className="grow truncate">{entry.note}</span>
                <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
