/**
 * What each model actually costs in seconds, and whether its answer survives
 * the parser.
 *
 * Not part of the app — a bench, run by hand when the model ladder is in
 * question:
 *
 *   bun test/model-bench.ts <folder> <gemini-key.txt> [model,model,…] [runs]
 *
 * Every model gets a key of its own from the file, so one model's per-minute
 * limit cannot slow the next one down and the numbers stay comparable. It
 * calls the real API with the real prompt and the real parser, because a model
 * that answers in two seconds and writes prose instead of JSON is slower than
 * one that takes six and does not.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { bytesToBase64, generateContent } from '#/lib/engine/gemini'
import { extname, mimeTypeOf, SUPPORTED_EXTENSIONS } from '#/lib/engine/media'
import { adobeProfile } from '#/lib/engine/profiles/adobe'
import type { RunOptions } from '#/lib/engine/types'

const [folder, keyPath, modelList, runsRaw] = process.argv.slice(2)
if (!folder || !keyPath) {
  console.error('usage: bun test/model-bench.ts <folder> <gemini-key.txt> [models] [runs]')
  process.exit(1)
}

const DEFAULT_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemma-4-26b-a4b-it',
]

const models = modelList ? modelList.split(',').map((name) => name.trim()) : DEFAULT_MODELS
const runs = Number(runsRaw ?? '3')

const keys = readFileSync(keyPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))

const files = readdirSync(folder)
  .filter((name) => SUPPORTED_EXTENSIONS.includes(extname(name)))
  .sort()
  .slice(0, runs)

if (files.length === 0) {
  console.error('no readable media in that folder')
  process.exit(1)
}

const options: RunOptions = {
  platform: 'adobe',
  maxConcurrentWorkers: 1,
  model: 'bench',
  renameBrackets: false,
}

interface Sample {
  ms: number
  ok: boolean
  extracted: boolean
  irreparable: boolean
  keywords: number
  tokens: number
  error?: string
}

const results: Record<string, Sample[]> = {}

for (const [index, model] of models.entries()) {
  // One key per model: quota and the per-minute clock are both per key.
  const apiKey = keys[index % keys.length]
  const samples: Sample[] = []

  for (const name of files) {
    const bytes = new Uint8Array(readFileSync(join(folder, name)))
    const ctx = { name, kind: 'image' as const, bracketKeywords: [] }
    const started = Date.now()

    try {
      const result = await generateContent({
        apiKey,
        model,
        prompt: adobeProfile.buildPrompt(ctx),
        mimeType: mimeTypeOf(name),
        base64: bytesToBase64(bytes),
        // Same request the app makes, structured output included — without it
        // the numbers describe a pipeline nobody runs.
        responseSchema: adobeProfile.responseSchema,
      })
      const outcome = adobeProfile.parse(result.text, ctx, options)
      samples.push({
        ms: Date.now() - started,
        ok: !outcome.parseFailed,
        extracted: outcome.extracted,
        irreparable: outcome.irreparable,
        keywords: outcome.row.keywords.split(',').filter(Boolean).length,
        tokens: result.usage.totalTokenCount ?? 0,
      })
    } catch (error) {
      samples.push({
        ms: Date.now() - started,
        ok: false,
        extracted: false,
        irreparable: false,
        keywords: 0,
        tokens: 0,
        error: error instanceof Error ? error.message.slice(0, 120) : String(error),
      })
    }
  }

  results[model] = samples
  const done = samples.filter((sample) => sample.ok).length
  console.log(`${model}: ${done}/${samples.length} parsed`)
}

console.log('\nmodel                          median   min    max   parsed  extracted  keywords  tokens')
for (const [model, samples] of Object.entries(results)) {
  const good = samples.filter((sample) => !sample.error)
  const times = good.map((sample) => sample.ms).sort((a, b) => a - b)
  const median = times.length > 0 ? times[Math.floor(times.length / 2)] : 0
  const parsed = samples.filter((sample) => sample.ok).length
  const extracted = samples.filter((sample) => sample.extracted).length
  const keywords = good.length > 0
    ? Math.round(good.reduce((sum, sample) => sum + sample.keywords, 0) / good.length)
    : 0
  const tokens = good.length > 0
    ? Math.round(good.reduce((sum, sample) => sum + sample.tokens, 0) / good.length)
    : 0

  const fastest = times.length > 0 ? times[0] : 0
  const slowest = times.length > 0 ? times[times.length - 1] : 0

  console.log(
    `${model.padEnd(30)} ${String((median / 1000).toFixed(1)).padStart(6)}s ${String((fastest / 1000).toFixed(1)).padStart(5)}s ${String((slowest / 1000).toFixed(1)).padStart(6)}s ${String(parsed + '/' + samples.length).padStart(7)} ${String(extracted).padStart(10)} ${String(keywords).padStart(9)} ${String(tokens).padStart(7)}`,
  )

  for (const sample of samples) {
    if (sample.error) console.log(`   ! ${sample.error}`)
  }
}
