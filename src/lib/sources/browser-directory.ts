import { kindOf, SUPPORTED_EXTENSIONS, extname } from '#/lib/engine/media'
import type { MediaEntry } from '#/lib/engine/types'
import { canStrip } from '#/lib/video/mp4box-strip'
import type { FileSource } from './types'

/**
 * File System Access API. Chrome and Edge only — Firefox and Safari have the
 * read half but not `showDirectoryPicker`, which is checked in `isSupported()`
 * so the UI can say so instead of failing at click time.
 *
 * These types are hand-declared because lib.dom does not ship them yet.
 */
export interface FileSystemWritable {
  write(data: BufferSource | Blob | string): Promise<void>
  close(): Promise<void>
}

export interface FileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritable>
}

export interface DirectoryHandle {
  kind: 'directory'
  name: string
  values(): AsyncIterableIterator<FileHandle | DirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite'
      id?: string
      startIn?: string
    }) => Promise<DirectoryHandle>
  }
}

export function isSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/**
 * A folder dropped on the page. Chrome and Edge expose the same handle the
 * picker returns, so a dropped folder is fully writable — that is why the drop
 * zone accepts folders as the happy path rather than a pile of files.
 */
export async function directoryFromDrop(
  item: DataTransferItem,
): Promise<DirectoryHandle | null> {
  const withHandle = item as DataTransferItem & {
    getAsFileSystemHandle?: () => Promise<{ kind: string } | null>
  }

  if (typeof withHandle.getAsFileSystemHandle !== 'function') return null

  const handle = await withHandle.getAsFileSystemHandle()
  if (!handle || handle.kind !== 'directory') return null

  const directory = handle as unknown as DirectoryHandle
  // Dropped handles start read-only; the CSV write needs the upgrade.
  if (directory.requestPermission) {
    await directory.requestPermission({ mode: 'readwrite' })
  }

  return directory
}

export async function pickDirectory(): Promise<DirectoryHandle | null> {
  if (!isSupported()) throw new Error('This browser has no File System Access API')
  try {
    // readwrite up front: the CSV is written back into the same folder, and
    // asking twice is a second permission prompt the user has to answer.
    return await window.showDirectoryPicker!({ mode: 'readwrite', id: 'microstock-media' })
  } catch (error) {
    // AbortError = the user closed the picker; anything else is real.
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

export class BrowserDirectorySource implements FileSource {
  private handles = new Map<string, FileHandle>()

  /** A real folder: the CSV, the progress file and renames all land in it. */
  readonly writable = true

  constructor(private directory: DirectoryHandle) {}

  get folderName(): string {
    return this.directory.name
  }

  private async index(): Promise<Map<string, FileHandle>> {
    if (this.handles.size > 0) return this.handles
    for await (const entry of this.directory.values()) {
      if (entry.kind === 'file') this.handles.set(entry.name, entry)
    }
    return this.handles
  }

  async listAllNames(): Promise<string[]> {
    return [...(await this.index()).keys()]
  }

  async listMedia(): Promise<MediaEntry[]> {
    const handles = await this.index()
    const entries: MediaEntry[] = []

    for (const [name, handle] of handles) {
      if (!SUPPORTED_EXTENSIONS.includes(extname(name))) continue
      const kind = kindOf(name)
      if (!kind) continue
      // Gemma refuses any audio track and only MP4/M4V/MOV can be remuxed in
      // the tab, so the rest never enter the queue.
      if (kind === 'video' && !canStrip(name)) continue
      const file = await handle.getFile()
      entries.push({ name, ref: handle, size: file.size, kind })
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name))
  }

  async readBytes(entry: MediaEntry): Promise<Uint8Array> {
    const file = await (entry.ref as FileHandle).getFile()
    return new Uint8Array(await file.arrayBuffer())
  }

  async writeText(name: string, text: string): Promise<void> {
    const handle = await this.directory.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
  }

  /**
   * The File System Access API has no rename. Copy-then-delete is the only
   * option, which is why the bracket rename is opt-in in the UI: on a folder of
   * 4K videos it rewrites every file.
   */
  async rename(entry: MediaEntry, newName: string): Promise<void> {
    const source = entry.ref as FileHandle
    const file = await source.getFile()
    const target = await this.directory.getFileHandle(newName, { create: true })
    const writable = await target.createWritable()
    await writable.write(file)
    await writable.close()
    await this.directory.removeEntry(entry.name)
    this.handles.delete(entry.name)
    this.handles.set(newName, target)
  }

  async readJson<T>(name: string): Promise<T | null> {
    try {
      const handle = await this.directory.getFileHandle(name)
      const file = await handle.getFile()
      return JSON.parse(await file.text()) as T
    } catch {
      return null
    }
  }

  async writeJson(name: string, data: unknown): Promise<void> {
    await this.writeText(name, JSON.stringify(data, null, 2))
  }

  async previewUrl(entry: MediaEntry): Promise<string | null> {
    const file = await (entry.ref as FileHandle).getFile()
    return URL.createObjectURL(file)
  }

  async remove(name: string): Promise<void> {
    try {
      await this.directory.removeEntry(name)
    } catch {
      // Already gone — the CLI ignores this too.
    }
  }
}
