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
          label: label.trim() || `${files.length} image${files.length === 1 ? '' : 's'}`,
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
            else toast.error(`${next.filename}: upload failed (${response.status})`)
          } catch (error) {
            toast.error(`${next.filename}: ${error instanceof Error ? error.message : 'upload failed'}`)
          }

          setProgress((current) => ({ ...current, done: current.done + 1 }))
        }
      }

      await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, lane))

      const result = await startVectorJob({ data: { jobId: job.jobId, uploaded } })

      if (result.refunded) {
        toast.warning(
          `${result.refunded} file${result.refunded === 1 ? '' : 's'} did not upload — ${result.refunded} token${result.refunded === 1 ? '' : 's'} refunded.`,
        )
      }

      if (result.queued === 0) {
        toast.error('Nothing was uploaded, so nothing was queued.')
      } else {
        toast.success(`${result.queued} file${result.queued === 1 ? '' : 's'} queued.`)
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
      <PageHead index="Vectorizer" title="Images to SVG and EPS">
        Raster art in, 4000 px SVG and EPS out — the same settings the CLI uses
        for microstock. One image costs one token, and a file that does not come
        back gives its token back. Every finished file keeps all three: your
        original, the SVG and the EPS.
      </PageHead>

      {overview.storageReady ? null : (
        <p className="border-destructive/40 text-destructive flex items-start gap-2 border p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Storage is not configured on this server, so nothing can be uploaded.
          Set the <code className="font-mono text-xs">R2_*</code> variables — see{' '}
          <code className="font-mono text-xs">.env.example</code>.
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
                  Name this batch
                </Label>
                <Input
                  id="vector-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={`${files.length} image${files.length === 1 ? '' : 's'}`}
                  disabled={busy}
                  maxLength={120}
                />
              </div>

              <div className="text-muted-foreground font-mono text-xs">
                {files.length} file{files.length === 1 ? '' : 's'} · {cost} token
                {cost === 1 ? '' : 's'} · {overview.balance} available
              </div>

              <Button
                className="eyebrow ml-auto"
                disabled={busy || !affordable || !overview.storageReady}
                onClick={submit}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {busy ? `Uploading ${progress.done}/${progress.total}` : 'Queue batch'}
              </Button>
            </div>

            {affordable ? null : (
              <p className="text-destructive font-mono text-xs">
                This batch costs {cost} and the balance is {overview.balance}. An admin can add
                tokens from the Tokens screen in the panel.
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
                    aria-label={`Remove ${file.name}`}
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
        <h2 className="font-display text-xl font-medium tracking-tight">Batches</h2>

        {overview.jobs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing queued yet. Drop some images above.
          </p>
        ) : (
          <div className="border-(--line) border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Done</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Created</TableHead>
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
                          Open
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
          <p className="eyebrow text-muted-foreground">Recent token activity</p>
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
                <span className="w-14">{entry.reason}</span>
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
