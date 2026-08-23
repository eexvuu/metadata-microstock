import { useRef, useState } from 'react'
import { FolderOpen, HardDriveDownload, Upload } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { useMessages } from '#/lib/i18n'
import {
  BrowserDirectorySource,
  directoryFromHandle,
  isSupported,
  pickDirectory,
  type DirectoryHandle,
} from '#/lib/sources/browser-directory'
import {
  DroppedFilesSource,
  captureDrop,
  filesFromCapture,
  type DropCapture,
} from '#/lib/sources/dropped-files'
import type { FileSource } from '#/lib/sources/types'
import { mp4boxPreprocessor } from '#/lib/video/mp4box-strip'
import type { VideoPreprocessor } from '#/lib/video/types'

export interface SelectedSource {
  label: string
  /** A folder can take the CSV back; a pile of files gets a download. */
  writable: boolean
  source: FileSource
  video: VideoPreprocessor
  /**
   * The handle behind a folder, kept so an unfinished run can be remembered
   * and reopened later. Absent for loose files, and for the Firefox/Safari
   * drop path — neither of which can be resumed anyway.
   */
  directory?: DirectoryHandle
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
  const m = useMessages()
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const supportsFolders = typeof window !== 'undefined' && isSupported()

  const takeDirectory = (directory: DirectoryHandle) =>
    onSelect(directorySource(directory))

  const takeFiles = (files: File[]) => {
    const usable = files.filter((file) => file.size > 0)

    if (usable.length === 0) {
      setError(m.picker.nothingUsable)
      return
    }

    onSelect({
      label: m.picker.fileCount(usable.length),
      writable: false,
      source: new DroppedFilesSource(usable),
      video: mp4boxPreprocessor,
    })
  }

  /**
   * Synchronous on purpose. `event.dataTransfer` is only readable while the
   * drop event is being dispatched, so the whole drop is captured first and
   * resolved afterwards — awaiting inside the handler used to leave an empty
   * item list and reject a perfectly good JPG.
   */
  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setOver(false)
    setError(null)
    if (disabled) return

    void resolveDrop(captureDrop(event.dataTransfer))
  }

  const resolveDrop = async (capture: DropCapture) => {
    try {
      // A folder handle keeps every advantage, so it wins when there is one.
      for (const pending of capture.handles) {
        const directory = await directoryFromHandle(await pending.catch(() => null))
        if (directory) {
          takeDirectory(directory)
          return
        }
      }

      takeFiles(await filesFromCapture(capture))
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
        onDrop={onDrop}
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
          <p className="font-display text-xl font-medium">{m.picker.title}</p>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm text-pretty">
            {m.picker.body}
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
              {m.picker.chooseFolder}
            </Button>
          ) : null}

          <Button
            variant={supportsFolders ? 'ghost' : 'outline'}
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
          >
            <HardDriveDownload className="size-4" />
            {m.picker.chooseFiles}
          </Button>

          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/*,.svg,.ai,.pdf"
            className="hidden"
            onChange={(event) => {
              takeFiles([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
        </div>

        {!supportsFolders ? (
          <p className="text-muted-foreground max-w-md font-mono text-[0.7rem] text-pretty">
            {m.picker.noFolderSupport}
          </p>
        ) : null}
      </div>

      {selected ? (
        <div className="border-(--line) bg-card flex flex-wrap items-center gap-x-6 gap-y-2 border p-3 font-mono text-xs">
          <span className="text-primary truncate">{selected.label}</span>
          <span className="text-muted-foreground">
            {selected.writable ? m.picker.folderMode : m.picker.filesMode}
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            {m.picker.clear}
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  )
}

/**
 * Exported because the resume card builds the same selection from a handle it
 * pulled out of IndexedDB rather than from a gesture on this component.
 */
export function directorySource(directory: DirectoryHandle): SelectedSource {
  return {
    label: directory.name,
    writable: true,
    source: new BrowserDirectorySource(directory),
    video: mp4boxPreprocessor,
    directory,
  }
}
