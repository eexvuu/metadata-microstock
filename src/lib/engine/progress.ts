import type { MetadataRow, RunOptions } from './types'

/**
 * The CLI's `.metadata-progress.json` / `.shutterstock-progress.json` records,
 * as written by gemma/index.js. The web app reads and writes the same shape so
 * a run interrupted in the terminal resumes in the browser and vice versa —
 * which is the whole reason progress lives in the folder rather than in
 * IndexedDB.
 */
export interface ProgressRecord {
  filename: string
  filepath: string
  title?: string
  description?: string
  keywords: string
  category?: string
  categories?: string
  illustration?: string
  processed_at: string
}

export function toProgressRecord(row: MetadataRow, platform: RunOptions['platform']): ProgressRecord {
  const base = {
    filename: row.filename,
    // The CLI stores an absolute path here and uses it only for the rename
    // step. The browser has no paths, so the name is the honest answer.
    filepath: row.sourceName,
    keywords: row.keywords,
    processed_at: row.processedAt,
  }

  if (platform === 'shutterstock') {
    return {
      ...base,
      description: row.description ?? '',
      categories: row.category,
      illustration: row.illustration ?? 'no',
    }
  }
  return { ...base, title: row.title, description: row.description ?? '', category: row.category }
}

export function fromProgressRecord(
  record: ProgressRecord,
  platform: RunOptions['platform'],
): MetadataRow {
  return {
    filename: record.filename,
    sourceName: record.filepath.split(/[\\/]/).pop() ?? record.filename,
    title: record.title ?? '',
    description: record.description ?? '',
    keywords: record.keywords,
    category:
      platform === 'shutterstock' ? (record.categories ?? '') : (record.category ?? '1'),
    illustration: record.illustration,
    processedAt: record.processed_at,
  }
}
