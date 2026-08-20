/**
 * Runtime-agnostic types for the metadata engine.
 *
 * Nothing in `src/lib/engine/` may import `node:*`, the DOM, or a Cloudflare
 * binding. The engine is pure logic over bytes so the same code runs in the
 * browser tab, in a Node process and (in principle) in a Worker — only the
 * FileSource and the video pre-processor differ per target.
 */

export type MediaKind = 'image' | 'video'

/** One media file, independent of where it physically lives. */
export interface MediaEntry {
  /** Name including extension, e.g. "[sunset]-a1b2.mp4". */
  name: string
  /** Opaque handle the owning FileSource uses to read the bytes back. */
  ref: unknown
  size: number
  kind: MediaKind
}

/** A finished CSV row. Shared shape; unused columns stay empty per platform. */
export interface MetadataRow {
  /** Filename as written to the CSV (vector extension applied, brackets kept). */
  filename: string
  /** Name of the source file on disk — needed for the bracket rename step. */
  sourceName: string
  title: string
  keywords: string
  category: string
  /** Shutterstock only. */
  description?: string
  editorial?: string
  mature?: string
  illustration?: string
  processedAt: string
  /** Set when the row is a fallback rather than a real model answer. */
  fallback?: 'parse' | 'error'
}

export interface PromptContext {
  name: string
  kind: MediaKind
  bracketKeywords: string[]
}

export interface RunOptions {
  platform: 'adobe' | 'shutterstock'
  /** Rewrite the CSV filename column to this extension (".ai" / ".eps"). */
  vectorExtension?: string
  maxConcurrentWorkers: number
  model: string
  /**
   * Tried once, on an alive key, when `model` has failed on every key for a
   * file — a different family answering is better than a fallback row. Quota
   * (429) never gets here: that is rotation's job, not the fallback's.
   */
  fallbackModel?: string
  /** Shutterstock column overrides. */
  editorial?: boolean
  mature?: boolean
  illustration?: boolean | null
  /** Strip brackets from filenames on disk after a complete run. */
  renameBrackets: boolean
  /**
   * Stop after the rows are generated: no rename, no CSV, progress file kept.
   * The browser sets this so the user can edit titles and keywords first and
   * call `exportRun` afterwards; the CLI path leaves it off.
   */
  deferExport?: boolean
}

export type EngineEvent =
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'scanned'; total: number; images: number; videos: number; skipped: number }
  | { type: 'file-start'; name: string; keyIndex: number }
  | { type: 'file-done'; row: MetadataRow; done: number; total: number; keyIndex: number }
  | { type: 'file-failed'; name: string; message: string; requeued: boolean }
  | { type: 'key-cooldown'; keyIndex: number; untilMs: number; consecutive429s: number }
  | { type: 'key-dead'; keyIndex: number }
  | { type: 'model-fallback'; name: string; model: string }
  | { type: 'stats'; perKey: { requests: number; dead: boolean }[] }
  | { type: 'partial'; done: number; total: number; remaining: number }
  | { type: 'finished'; csvName: string; rows: number }

export type Emit = (event: EngineEvent) => void
