import { useState } from 'react'
import { FolderDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '#/components/ui/button'
import { isSupported, pickDirectory } from '#/lib/sources/browser-directory'
import type { DirectoryHandle } from '#/lib/sources/browser-directory'
import { getVectorJobDownloads } from '#/lib/server/vector'

/**
 * Save a whole batch into a folder, three files per image.
 *
 * This reuses the metadata tool's directory seam rather than inventing one —
 * `pickDirectory()` and the `DirectoryHandle` type in
 * `src/lib/sources/browser-directory.ts` are the same File System Access
 * wrapper that writes a CSV next to somebody's media. What differs is the
 * direction: metadata reads a folder and writes one file into it; this writes
 * many and reads none.
 *
 * A zip was the obvious alternative and is the wrong one here. It would need a
 * dependency, and it would hold an entire batch — two hundred originals plus
 * their vectors — in the tab's memory before writing a byte. This holds one
 * file per lane instead, so a 200-file save costs four files of memory rather
 * than four hundred.
 *
 * Chrome and Edge only, like the metadata folder picker. Firefox and Safari
 * have no `showDirectoryPicker`, so the button says so instead of failing on
 * click, and the per-row buttons still work one file at a time.
 */

/** Four transfers at once: past this a home connection is the limit, not us. */
const SAVE_CONCURRENCY = 4

interface Saveable {
  filename: string
  source: string
  svg: string | null
  eps: string | null
  svgName: string
  epsName: string
}

export function BulkDownload({ jobId, ready }: { jobId: string; ready: number }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const supported = typeof window !== 'undefined' && isSupported()

  if (ready === 0) return null

  if (!supported) {
    return (
      <p className="text-muted-foreground font-mono text-xs">
        Saving a whole batch needs Chrome or Edge — this browser has no folder
        picker. The per-file buttons below still work.
      </p>
    )
  }

  const save = async () => {
    let directory: DirectoryHandle | null = null

    try {
      // The picker must be the first thing the click does: it only opens
      // inside a user gesture, and awaiting the server first would spend that
      // gesture on a fetch and have the browser refuse the picker.
      directory = await pickDirectory()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      return
    }

    if (!directory) return

    setBusy(true)
    setDone(0)

    try {
      const batch = await getVectorJobDownloads({ data: { jobId } })

      if (batch.files.length === 0) {
        toast.error('Nothing finished in this batch yet.')
        return
      }

      const folder = await directory.getDirectoryHandle(batch.folder, { create: true })

      const queue: Saveable[] = [...batch.files]
      let failed = 0

      const lane = async () => {
        for (;;) {
          const file = queue.shift()
          if (!file) return

          // All three, and the original is one of them: the point of saving a
          // batch is having what you sent next to what came back, so a later
          // re-upload or a rejection from a stock site can be checked against
          // the file that actually went in.
          const wanted: [string, string | null][] = [
            [file.filename, file.source],
            [file.svgName, file.svg],
            [file.epsName, file.eps],
          ]

          for (const [name, url] of wanted) {
            if (!url) continue

            try {
              const response = await fetch(url)
              if (!response.ok) throw new Error(`R2 answered ${response.status}`)

              const handle = await folder.getFileHandle(name, { create: true })
              const writable = await handle.createWritable()
              await writable.write(await response.blob())
              await writable.close()
            } catch (error) {
              failed++
              toast.error(`${name}: ${error instanceof Error ? error.message : 'could not save'}`)
            }
          }

          setDone((current) => current + 1)
        }
      }

      await Promise.all(Array.from({ length: SAVE_CONCURRENCY }, lane))

      if (failed) {
        toast.warning(`Saved to ${batch.folder}, but ${failed} file${failed === 1 ? '' : 's'} failed.`)
      } else {
        toast.success(
          `Saved ${batch.files.length} image${batch.files.length === 1 ? '' : 's'} — ${batch.files.length * 3} files in ${batch.folder}.`,
        )
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
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderDown className="size-4" />}
        {busy ? `Saving ${done}/${ready}` : 'Save all to a folder'}
      </Button>
      <span className="text-muted-foreground font-mono text-xs">
        {ready} image{ready === 1 ? '' : 's'} · {ready * 3} files (original + SVG + EPS)
      </span>
    </div>
  )
}
