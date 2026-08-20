import { useRef, useState } from 'react'
import { FolderOpen, HardDriveDownload, Upload } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  BrowserDirectorySource,
  directoryFromDrop,
  isSupported,
  pickDirectory,
} from '#/lib/sources/browser-directory'
import { DroppedFilesSource, filesFromDrop } from '#/lib/sources/dropped-files'
import type { FileSource } from '#/lib/sources/types'
import { mp4boxPreprocessor } from '#/lib/video/mp4box-strip'
import type { VideoPreprocessor } from '#/lib/video/types'

export interface SelectedSource {
  label: string
  /** A folder can take the CSV back; a pile of files gets a download. */
  writable: boolean
  source: FileSource
  video: VideoPreprocessor
}

/**
 * The way in.
 *
 * Dragging is the whole point: drop a folder and you get resume, a rename and
 * the CSV written next to the media; drop files and you get a download. Both
 * are one gesture, and the difference is stated on the card afterwards rather
 * than asked as a question up front.
 */
export function MediaPicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: SelectedSource | null
  onSelect: (source: SelectedSource | null) => void
  disabled: boolean
}) {
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const supportsFolders = typeof window !== 'undefined' && isSupported()

  const takeDirectory = (directory: Parameters<typeof toDirectorySource>[0]) =>
    onSelect(toDirectorySource(directory))

  const takeFiles = (files: File[]) => {
    const usable = files.filter((file) => file.size > 0)

    if (usable.length === 0) {
      setError('Nothing usable in that drop — images and videos only.')
      return
    }

    onSelect({
      label: `${usable.length} file${usable.length === 1 ? '' : 's'}`,
      writable: false,
      source: new DroppedFilesSource(usable),
      video: mp4boxPreprocessor,
    })
  }

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setOver(false)
    setError(null)
    if (disabled) return

    try {
      // A folder handle keeps every advantage, so it is tried first and the
      // file list is the fallback rather than the other way round.
      for (const item of event.dataTransfer.items) {
        if (item.kind !== 'file') continue
        const directory = await directoryFromDrop(item)
        if (directory) {
          takeDirectory(directory)
          return
        }
      }

      takeFiles(await filesFromDrop(event.dataTransfer))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const chooseFolder = async () => {
    setError(null)
    try {
      const directory = await pickDirectory()
      if (directory) takeDirectory(directory)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => void onDrop(event)}
        data-over={over ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        className="border-(--line) data-over:border-primary data-over:bg-accent/40 data-disabled:opacity-60 flex flex-col items-center justify-center gap-4 border border-dashed px-6 py-12 text-center transition-colors"
      >
        <span className="border-(--line) data-over:border-primary flex size-12 items-center justify-center border">
          <Upload
            className={over ? 'text-primary size-5' : 'text-muted-foreground size-5'}
            strokeWidth={1.5}
          />
        </span>

        <div>
          <p className="font-display text-xl font-medium">
            Drag a folder of photos here
          </p>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm text-pretty">
            Or drop loose files. Nothing is uploaded — the page reads them off
            your disk and sends each one straight to Google with your own key.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {supportsFolders ? (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => void chooseFolder()}
            >
              <FolderOpen className="size-4" />
              Choose folder
            </Button>
          ) : null}

          <Button
            variant={supportsFolders ? 'ghost' : 'outline'}
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
          >
            <HardDriveDownload className="size-4" />
            Choose files
          </Button>

          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(event) => {
              takeFiles([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
        </div>

        {!supportsFolders ? (
          <p className="text-muted-foreground max-w-md font-mono text-[0.7rem] text-pretty">
            this browser cannot open a folder — Chrome or Edge can, and then the
            CSV is written next to your media instead of downloaded
          </p>
        ) : null}
      </div>

      {selected ? (
        <div className="border-(--line) bg-card flex flex-wrap items-center gap-x-6 gap-y-2 border p-3 font-mono text-xs">
          <span className="text-primary truncate">{selected.label}</span>
          <span className="text-muted-foreground">
            {selected.writable
              ? 'folder · CSV written back, run resumes if interrupted'
              : 'files · CSV downloaded, no resume'}
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            Clear
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  )
}

function toDirectorySource(
  directory: ConstructorParameters<typeof BrowserDirectorySource>[0],
): SelectedSource {
  return {
    label: directory.name,
    writable: true,
    source: new BrowserDirectorySource(directory),
    video: mp4boxPreprocessor,
  }
}
