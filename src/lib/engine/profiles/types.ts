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

/**
 * What the model is told to return, in Google's structured-output dialect.
 *
 * Narrow on purpose — every field of every profile is a string, and the
 * descriptions are what keep the answer as rich as the prompt asks for. A
 * schema with bare types costs keywords: Gemma writes 33 with one and 42 with
 * these, measured on the same three images.
 */
export interface ResponseSchema {
  type: 'OBJECT'
  properties: Record<string, { type: 'STRING'; description: string }>
  required: string[]
  propertyOrdering: string[]
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
  /**
   * Sent as `generationConfig.responseSchema`. This is the single biggest
   * lever on how long a run takes: without it Gemma writes ten thousand
   * characters of reasoning around the JSON and takes 86s a file; with it the
   * same model answers in 6s. Models that reject it are detected once per run
   * and asked again without it.
   */
  responseSchema: ResponseSchema
  /** Appended to the prompt on the one keyword-format retry. */
  retryInstruction: string
  parse(text: string, ctx: PromptContext, options: RunOptions): ParseOutcome
  parseFailureFallback(ctx: PromptContext, options: RunOptions): MetadataRow
  errorFallback(ctx: PromptContext, message: string, options: RunOptions): MetadataRow
  toCsv(rows: MetadataRow[], options: RunOptions): CsvTable
}
