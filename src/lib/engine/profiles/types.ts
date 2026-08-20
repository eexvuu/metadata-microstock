import type { MetadataRow, PromptContext, RunOptions } from '../types'

export interface ParseOutcome {
  row: MetadataRow
  /** Keywords had no usable separator — the runner retries once, stricter. */
  irreparable: boolean
  /** JSON had to be dug out of Gemma's chain-of-thought. */
  extracted: boolean
  /** Nothing parseable at all; row is a fallback. */
  parseFailed: boolean
  /** Title/description was rewritten to carry the bracket keywords. */
  adjustedForBrackets: string[]
}

export interface CsvTable {
  headers: string[]
  rows: string[][]
  bom: boolean
}

export interface PlatformProfile {
  id: RunOptions['platform']
  label: string
  maxKeywords: number
  csvPrefix: string
  progressFile: string
  /** What -vector/-eps means for this platform. */
  vectorExtensions: string[]
  buildPrompt(ctx: PromptContext): string
  /** Appended to the prompt on the one keyword-format retry. */
  retryInstruction: string
  parse(text: string, ctx: PromptContext, options: RunOptions): ParseOutcome
  parseFailureFallback(ctx: PromptContext, options: RunOptions): MetadataRow
  errorFallback(ctx: PromptContext, message: string, options: RunOptions): MetadataRow
  toCsv(rows: MetadataRow[], options: RunOptions): CsvTable
}
