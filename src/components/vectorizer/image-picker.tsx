import { useRef, useState } from 'react'
import { ImageUp, Upload } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { useMessages } from '#/lib/i18n'

/**
 * The way in: drop raster art, get a list.
 *
 * Deliberately not the metadata tool's `MediaPicker`. That one picks a
 * *directory handle*, because its whole contract is writing a CSV back next to
 * the media and resuming from a progress file on disk. Nothing here writes to
 * anyone's disk — the files go to R2 and the vectors come back as downloads —
 * so a plain file selection is the honest shape, and forking the folder picker
 * to ignore half of what it returns would be the near-duplicate AGENTS.md
 * warns about.
 */
export function ImagePicker({
  accepted,
  maxBytes,
  maxFiles,
  files,
  onChange,
  disabled,
}: {
  accepted: string[]
  maxBytes: number
  maxFiles: number
  files: File[]
  onChange: (files: File[]) => void
  disabled: boolean
}) {
  const m = useMessages().vectorizer.picker
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)

  const take = (incoming: File[]) => {
    const bad: string[] = []
    const good: File[] = []

    for (const file of incoming) {
      if (!accepted.includes(file.type)) {
        bad.push(m.notRaster(file.name))
      } else if (file.size > maxBytes) {
        bad.push(m.tooBig(file.name, Math.round(maxBytes / 1024 / 1024)))
      } else if (file.size === 0) {
        bad.push(m.empty(file.name))
      } else {
        good.push(file)
      }
    }

    // Two rejections, not one. Same NAME twice is the folder dropped twice,
    // the usual accident. Same STEM — `foo.png` and `foo.jpg` — is rarer and
    // worse: both would be saved as `foo.svg` and `foo.eps` in the download
    // folder, and the second would silently overwrite the first after the
    // tokens for both had been spent.
    const merged = [...files]
    const stem = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase()

    for (const file of good) {
      if (merged.some((existing) => existing.name === file.name)) continue

      const clash = merged.find((existing) => stem(existing.name) === stem(file.name))
      if (clash) {
        bad.push(m.sameStem(file.name, clash.name))
        continue
      }

      merged.push(file)
    }

    if (merged.length > maxFiles) {
      bad.push(m.onlyFirst(maxFiles))
    }

    setRejected(bad)
    onChange(merged.slice(0, maxFiles))
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          if (!disabled) take(Array.from(event.dataTransfer.files))
        }}
        className={`border-(--line) flex flex-col items-center gap-3 border border-dashed px-6 py-12 text-center transition-colors ${
          over ? 'border-primary bg-primary/5' : ''
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <ImageUp className="text-muted-foreground size-7" strokeWidth={1.25} />
        <p className="text-sm">{m.drop}</p>
        <p className="text-muted-foreground font-mono text-xs">
          {m.hint(Math.round(maxBytes / 1024 / 1024))}
        </p>

        <input
          ref={input}
          type="file"
          multiple
          accept={accepted.join(',')}
          className="hidden"
          onChange={(event) => {
            take(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />

        <Button
          type="button"
          variant="outline"
          className="eyebrow mt-1"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Upload className="size-4" />
          {m.choose}
        </Button>
      </div>

      {rejected.length ? (
        <ul className="text-destructive space-y-1 font-mono text-xs">
          {rejected.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
