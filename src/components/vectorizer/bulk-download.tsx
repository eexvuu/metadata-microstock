import { useState } from 'react'
import { FileArchive, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '#/components/ui/button'
import { useMessages } from '#/lib/i18n'
import { crc32, zipBlob } from '#/lib/vectorizer/zip'
import type { ZipEntry } from '#/lib/vectorizer/zip'
import { getVectorJobDownloads } from '#/lib/server/vector'

/**
 * Download a whole batch as one zip, three files per image.
 *
 * This replaces a folder picker, and the reasoning that chose the picker is
 * worth keeping rather than deleting: a zip was rejected because it would need
 * a dependency and would hold an entire batch in the tab before writing a byte.
 * Both objections were real, and neither survives contact with how this one is
 * built. `src/lib/vectorizer/zip.ts` is fifty lines of arithmetic because the
 * entries are stored rather than compressed, and the parts it assembles are the
 * `Blob`s `fetch` already handed us — the browser keeps those in its own blob
 * storage and pages them to disk, so the JS heap holds one file per lane and
 * not two hundred.
 *
 * What it buys: every browser. The picker was Chrome and Edge only, so Firefox
 * and Safari had no way to take a batch except one file at a time. It also
 * fixes the naming: a presigned R2 URL is cross-origin and `download` cannot
 * rename it, which is why the per-row buttons are best-effort — a blob URL is
 * same-origin and the names inside the archive are simply what we wrote.
 */

/** Four transfers at once: past this a home connection is the limit, not us. */
const FETCH_CONCURRENCY = 4

export function BulkDownload({ jobId, ready }: { jobId: string; ready: number }) {
  const m = useMessages().vectorizer.bulk
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  if (ready === 0) return null

  const save = async () => {
    setBusy(true)
    setDone(0)

    try {
      const batch = await getVectorJobDownloads({ data: { jobId } })

      if (batch.files.length === 0) {
        toast.error(m.nothingReady)
        return
      }

      // All three, and the original is one of them: the point of taking a batch
      // is having what you sent next to what came back, so a later re-upload or
      // a rejection from a stock site can be checked against the file that
      // actually went in.
      //
      // The batch name is a folder inside the archive rather than a flat list,
      // so two batches that both hold a `flower.png` unpack side by side.
      const wanted = batch.files.flatMap((file) =>
        (
          [
            [file.filename, file.source],
            [file.svgName, file.svg],
            [file.epsName, file.eps],
          ] as const
        )
          .filter((pair): pair is readonly [string, string] => pair[1] !== null)
          .map(([name, url]) => ({ name: `${batch.folder}/${name}`, url })),
      )

      // Fetched in parallel, placed by index: a zip's central directory records
      // where each entry starts, so the order has to be the one we planned and
      // not the order the network happened to finish in.
      const entries = new Array<ZipEntry | null>(wanted.length).fill(null)
      const queue = wanted.map((item, index) => ({ ...item, index }))
      let failed = 0
      let files = 0

      const lane = async () => {
        for (;;) {
          const item = queue.shift()
          if (!item) return

          try {
            const response = await fetch(item.url)
            if (!response.ok) throw new Error(m.r2Answered(response.status))

            // The CRC is the one thing that needs the real bytes. Read them,
            // hash them, and keep only the blob — the buffer is collectable
            // before the next file in this lane starts.
            const body = await response.blob()
            const bytes = new Uint8Array(await body.arrayBuffer())

            entries[item.index] = {
              name: item.name,
              crc: crc32(bytes),
              size: bytes.length,
              body,
            }
          } catch (error) {
            failed++
            toast.error(
              m.fileFailed(
                item.name,
                error instanceof Error ? error.message : m.couldNotDownload,
              ),
            )
          }

          // Progress is counted in images, which is what the button promises.
          files++
          setDone(Math.min(ready, Math.ceil(files / 3)))
        }
      }

      await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, lane))

      const packed = entries.filter((entry): entry is ZipEntry => entry !== null)
      if (packed.length === 0) {
        toast.error(m.nothingDownloaded)
        return
      }

      const url = URL.createObjectURL(zipBlob(packed))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${batch.folder}.zip`
      anchor.rel = 'noopener'
      // In the document rather than detached: Chrome fires a click on either,
      // but the browsers this change exists for are historically the ones that
      // ignore a click on an anchor that is not in the tree.
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      // Revoking immediately would race the download the click just started;
      // a minute is longer than the browser needs to read a blob it owns.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)

      if (failed) {
        toast.warning(m.someFailed(packed.length, failed))
      } else {
        toast.success(m.saved(batch.files.length, packed.length, batch.folder))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button className="eyebrow" disabled={busy} onClick={save}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileArchive className="size-4" />}
        {busy ? m.zipping(done, ready) : m.button}
      </Button>
      <span className="text-muted-foreground font-mono text-xs">
        {m.summary(ready, ready * 3)}
      </span>
    </div>
  )
}
