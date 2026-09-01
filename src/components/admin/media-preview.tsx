import { AlertTriangle, Download, FileText, Film } from 'lucide-react'
import { useState } from 'react'

/**
 * One revealed file, drawn as well as a browser can draw it.
 *
 * The admin screens both hand out presigned R2 URLs, and both meet the same
 * three shapes. What a tile must never do is look like it is still loading
 * when it is not, so every case ends in something: a picture, a player, or a
 * card with the filename and a link.
 *
 * - **Raster and SVG** go in an `<img>`. SVG included: this is a preview, not
 *   the model's input, and the browser draws it perfectly well.
 * - **`.ai` and `.pdf`** arrive as `application/pdf`, which an `<img>` cannot
 *   read. The tool rasterises those with pdf.js for the contributor; loading
 *   pdf.js into the admin panel to redraw a file support is about to download
 *   anyway is not worth the bundle, so they get the card.
 * - **Video** goes in a `<video>` — and for exactly the files most likely to
 *   need support, that is a blank frame: this repo measured Chrome refusing
 *   ProRes on every path there is. `onError` is what turns that into the card
 *   instead of a black rectangle.
 *
 * A URL whose object the lifecycle rule has already reclaimed 404s the same
 * way, and lands in the same place. That is the trade of putting retention on
 * the bucket, and the card says so rather than pretending.
 */
export function MediaPreview({
  url,
  contentType,
  filename,
}: {
  url: string
  contentType: string
  filename: string
}) {
  const [failed, setFailed] = useState(false)

  const isVideo = contentType.startsWith('video/')
  const drawable =
    contentType.startsWith('image/') && contentType !== 'application/pdf'

  if (failed || (!drawable && !isVideo)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="bg-muted/40 text-muted-foreground hover:text-foreground flex aspect-square flex-col items-center justify-center gap-2 p-4 text-center"
      >
        {failed ? (
          <AlertTriangle className="size-5" />
        ) : isVideo ? (
          <Film className="size-5" />
        ) : (
          <FileText className="size-5" />
        )}
        <span className="font-mono text-[0.65rem] break-all">
          {failed ? 'this browser cannot show it' : contentType}
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[0.65rem]">
          <Download className="size-3" />
          open
        </span>
      </a>
    )
  }

  if (isVideo) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        muted
        playsInline
        className="bg-muted/40 aspect-square w-full object-contain"
        onError={() => setFailed(true)}
      >
        <track kind="captions" />
      </video>
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt={filename}
        loading="lazy"
        className="bg-muted/40 aspect-square w-full object-contain"
        onError={() => setFailed(true)}
      />
    </a>
  )
}

/** Bytes as a human reads them. Two tiles wide is all the room there is. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}
