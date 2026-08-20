import type { ProgressRecord } from '#/lib/engine/progress'
import type { MediaEntry } from '#/lib/engine/types'

/**
 * Where the media actually lives. This is the only seam between the two
 * targets: the browser build hands the engine a directory handle from the File
 * System Access API, the local build hands it a folder on disk reached through
 * the companion Node server. The engine itself never learns which.
 */
export interface FileSource {
  /** Used for the CSV filename, e.g. metadata_<folderName>_<timestamp>.csv. */
  readonly folderName: string
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
