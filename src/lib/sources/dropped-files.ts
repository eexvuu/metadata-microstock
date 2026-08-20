import { kindOf, SUPPORTED_EXTENSIONS, extname } from '#/lib/engine/media'
import type { MediaEntry } from '#/lib/engine/types'
import { isPdfBacked, looksLikePdf } from '#/lib/image/pdf-raster'
import { canStrip } from '#/lib/video/mp4box-strip'
import type { FileSource } from './types'

/**
 * Loose files, dropped on the page or picked with a plain file input.
 *
 * The easy way in: no folder permission prompt, no File System Access API, so
 * it works in every browser. The trade-off is that there is nowhere to write —
 * no progress file, so no resume; no rename; and the CSV is handed back as a
 * download instead of landing next to the media.
 *
 * `writable: false` is how the engine and the UI learn that without either of
 * them special-casing this class.
 */
export class DroppedFilesSource implements FileSource {
  readonly writable = false

  private files: File[]

  constructor(files: File[]) {
    this.files = [...files].sort((a, b) => a.name.localeCompare(b.name))
  }

  get folderName(): string {
    // Used for the CSV filename. Dropped files have no folder, and "selection"
    // reads better in `metadata_selection_2026-08-20.csv` than an empty string.
    return 'selection'
  }

  async listAllNames(): Promise<string[]> {
    return this.files.map((file) => file.name)
  }

  async listMedia(): Promise<MediaEntry[]> {
    const entries: MediaEntry[] = []

    for (const file of this.files) {
      if (!SUPPORTED_EXTENSIONS.includes(extname(file.name))) continue
      const kind = kindOf(file.name)
      if (!kind) continue
      if (kind === 'video' && !canStrip(file.name)) continue
      if (isPdfBacked(file.name) && !(await this.isReadablePdf(file))) continue
      entries.push({ name: file.name, ref: file, size: file.size, kind })
    }

    return entries
  }

  async readBytes(entry: MediaEntry): Promise<Uint8Array> {
    return new Uint8Array(await (entry.ref as File).arrayBuffer())
  }

  private async isReadablePdf(file: File): Promise<boolean> {
    return looksLikePdf(new Uint8Array(await file.slice(0, 1024).arrayBuffer()))
  }

  async previewUrl(entry: MediaEntry): Promise<string | null> {
    return URL.createObjectURL(entry.ref as File)
  }

  /*
   * The write half of the interface is inert rather than throwing: the runner
   * saves progress after every file and the UI exports at the end, and neither
   * should have to ask what kind of source it is holding. `writable` is the
   * flag they check when the difference actually matters to the user.
   */
  async writeText(): Promise<void> {}
  async writeJson(): Promise<void> {}
  async rename(): Promise<void> {}
  async remove(): Promise<void> {}

  async readJson<T>(): Promise<T | null> {
    return null
  }
}

/**
 * What a drop is worth, grabbed while it is still worth anything.
 *
 * The drag data store is only readable during the `drop` event: the moment the
 * handler awaits, `dataTransfer.items` is empty and `getAsFile()` returns null.
 * So everything is taken synchronously here — the handle promises are *started*
 * rather than awaited — and the slow half happens afterwards on objects that
 * outlive the event.
 */
export interface DropCapture {
  /** One per item: a File System Access handle where the browser offers it. */
  handles: Promise<{ kind: string } | null>[]
  entries: (FileSystemEntry | null)[]
  files: File[]
}

export function captureDrop(transfer: DataTransfer): DropCapture {
  const items = [...transfer.items].filter((item) => item.kind === 'file')

  return {
    handles: items.map((item) => {
      const withHandle = item as DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<{ kind: string } | null>
      }
      return typeof withHandle.getAsFileSystemHandle === 'function'
        ? withHandle.getAsFileSystemHandle()
        : Promise.resolve(null)
    }),
    entries: items.map((item) => item.webkitGetAsEntry?.() ?? null),
    files: items.map((item) => item.getAsFile()).filter((file): file is File => Boolean(file)),
  }
}

/** Every file in the drop, walking into folders the entry API can still read. */
export async function filesFromCapture(capture: DropCapture): Promise<File[]> {
  const files: File[] = []

  for (const entry of capture.entries) {
    if (!entry?.isDirectory) continue
    files.push(...(await readDirectoryEntry(entry as FileSystemDirectoryEntry)))
  }

  // Loose files come from the synchronous capture; a dropped folder yields no
  // usable File there, which is why the directory walk runs first.
  files.push(...capture.files.filter((file) => file.size > 0))

  return files
}

/**
 * The legacy drag-and-drop entry API, used only as the fallback when
 * `getAsFileSystemHandle` is missing (Firefox, Safari) — it can read a dropped
 * folder but never write back to it.
 */
async function readDirectoryEntry(
  directory: FileSystemDirectoryEntry,
): Promise<File[]> {
  const reader = directory.createReader()
  const files: File[] = []

  const readBatch = () =>
    new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )

  // readEntries returns at most 100 entries per call, so it has to be drained.
  for (;;) {
    const batch = await readBatch()
    if (batch.length === 0) break

    for (const entry of batch) {
      if (!entry.isFile) continue
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      )
      files.push(file)
    }
  }

  return files
}
