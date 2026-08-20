import type { ProgressRecord } from '#/lib/engine/progress'
import type { MediaEntry } from '#/lib/engine/types'

/**
 * Where the media actually lives. This is the only seam between targets: a
 * dropped folder arrives as a File System Access directory handle, loose files
 * arrive as a plain File list, and the engine never learns which.
 */
export interface FileSource {
  /** Used for the CSV filename, e.g. metadata_<folderName>_<timestamp>.csv. */
  readonly folderName: string
  /**
   * False when the source cannot write back — loose files dropped on the page
   * have no folder to write into, so the UI hands the CSV over as a download
   * and skips both the progress file and the bracket rename.
   */
  readonly writable: boolean
  /** Every media file the engine can process. */
  listMedia(): Promise<MediaEntry[]>
  /** Every filename in the folder — the vector-counterpart check needs this. */
  listAllNames(): Promise<string[]>
  readBytes(entry: MediaEntry): Promise<Uint8Array>
  writeText(name: string, text: string): Promise<void>
  rename(entry: MediaEntry, newName: string): Promise<void>
  readJson<T>(name: string): Promise<T | null>
  writeJson(name: string, data: unknown): Promise<void>
  remove(name: string): Promise<void>
  /**
   * An object URL for the review grid. Optional because it only makes sense in
   * a browser; callers must revoke what they get back.
   */
  previewUrl?(entry: MediaEntry): Promise<string | null>
}

/**
 * The on-disk progress file. Deliberately the same shape the CLI writes, so a
 * run started in the terminal can be finished in the browser and vice versa.
 */
export interface ProgressFile {
  folderPath: string
  vectorMode: boolean
  startedAt: string
  results: ProgressRecord[]
}
