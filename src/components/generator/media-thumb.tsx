import { useEffect, useRef, useState } from 'react'
import { Film, Image as ImageIcon } from 'lucide-react'

import type { MediaEntry } from '#/lib/engine/types'
import { isPdfBacked, rasterizePdf } from '#/lib/image/pdf-raster'
import { useMessages } from '#/lib/i18n'
import type { FileSource } from '#/lib/sources/types'

/**
 * One frame of the contact sheet.
 *
 * The object URL is created only when the tile scrolls into view and revoked
 * when it leaves the DOM — a folder of 500 4K videos would otherwise pin every
 * file in memory at once just to draw a grid.
 */
export function MediaThumb({
  source,
  entry,
  className,
}: {
  source: FileSource
  entry: MediaEntry
  className?: string
}) {
  const m = useMessages()
  const [url, setUrl] = useState<string | null>(null)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = holder.current
    if (!node || !source.previewUrl) return

    let revoke: string | null = null
    let cancelled = false

    const observer = new IntersectionObserver(async (entries) => {
      if (!entries.some((item) => item.isIntersecting)) return
      observer.disconnect()

      // An .ai or a .pdf means nothing to an <img>, so page one is rendered
      // here too — small, because this is a tile.
      const resolved = isPdfBacked(entry.name)
        ? await thumbnailFromPdf(source, entry)
        : await source.previewUrl!(entry)

      if (cancelled) {
        if (resolved) URL.revokeObjectURL(resolved)
        return
      }
      revoke = resolved
      setUrl(resolved)
    })

    observer.observe(node)

    return () => {
      cancelled = true
      observer.disconnect()
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [source, entry])

  return (
    <div
      ref={holder}
      className={`border-(--line) bg-muted relative overflow-hidden border ${className ?? ''}`}
    >
      {url ? (
        entry.kind === 'video' ? (
          <video
            src={url}
            muted
            playsInline
            preload="metadata"
            // Metadata alone paints nothing; nudging past zero makes the
            // browser decode one frame, which is the whole point of a tile.
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = 0.1
            }}
            className="size-full object-cover"
          />
        ) : (
          <img src={url} alt="" loading="lazy" className="size-full object-cover" />
        )
      ) : (
        <span className="text-muted-foreground/50 flex size-full items-center justify-center">
          {entry.kind === 'video' ? (
            <Film className="size-5" strokeWidth={1.5} />
          ) : (
            <ImageIcon className="size-5" strokeWidth={1.5} />
          )}
        </span>
      )}

      {entry.kind === 'video' ? (
        <span className="eyebrow bg-background/75 text-foreground absolute right-1 bottom-1 px-1 py-px text-[0.55rem]">
          {m.picker.videoBadge}
        </span>
      ) : null}
    </div>
  )
}

async function thumbnailFromPdf(
  source: FileSource,
  entry: MediaEntry,
): Promise<string | null> {
  try {
    const jpeg = await rasterizePdf(await source.readBytes(entry), 512)
    return URL.createObjectURL(new Blob([jpeg.slice().buffer as ArrayBuffer], { type: 'image/jpeg' }))
  } catch (error) {
    // A vector that will not open still belongs in the queue — the run reports
    // the reason properly, so the tile stays blank and the console carries the
    // detail for whoever is debugging a stubborn file.
    console.warn(`[stockflow] no thumbnail for ${entry.name}:`, error)
    return null
  }
}

/** The pre-run view: what the tool is about to work through. */
export function MediaGrid({
  source,
  entries,
  limit = 24,
}: {
  source: FileSource
  entries: MediaEntry[]
  limit?: number
}) {
  const m = useMessages()
  const shown = entries.slice(0, limit)
  const rest = entries.length - shown.length

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
        {shown.map((entry) => (
          <figure key={entry.name} className="min-w-0">
            <MediaThumb source={source} entry={entry} className="aspect-square" />
            <figcaption className="text-muted-foreground mt-1 truncate font-mono text-[0.6rem]">
              {entry.name}
            </figcaption>
          </figure>
        ))}
      </div>

      {rest > 0 ? (
        <p className="text-muted-foreground font-mono text-xs">
          {m.picker.more(rest)}
        </p>
      ) : null}
    </div>
  )
}
