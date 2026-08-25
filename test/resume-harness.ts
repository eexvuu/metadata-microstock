/**
 * Interruption/resume harness for the engine — no API key, no network.
 *
 * Mocks the Gemini endpoint, so the only thing under test is what the runner
 * does when a run stops halfway: what lands in the progress file, and what a
 * second run makes of it.
 *
 *   bun test/resume-harness.ts <folder> kill   3   # die as file 4 starts
 *   bun test/resume-harness.ts <folder> finish
 *   bun test/resume-harness.ts <folder> abort      # Stop button on the last file
 *   bun test/resume-harness.ts <folder> ladder 3   # daily quota gone after 3
 *   bun test/resume-harness.ts <folder> noschema   # a model that refuses structured output
 *   bun test/resume-harness.ts <folder> ratelimit  # key 1's fast rung is rate-limited
 *
 * `ratelimit` is two tests in one, and KEYS decides which: with keys to spare
 * the worker swaps to one of them, and with KEYS=1 there is nobody to swap
 * with, so it borrows the deep rung instead of sitting out the minute.
 *
 * KEYS and WORKERS override the pool, which is how the worker setting is
 * checked: the mock reports the peak number of requests in flight at once.
 */
import { KeyPool } from '#/lib/engine/keys'
import { adobeProfile } from '#/lib/engine/profiles/adobe'
import { exportRun, runFolder } from '#/lib/engine/runner'
import type { EngineEvent } from '#/lib/engine/types'
import { passthroughPreprocessor } from '#/lib/video/types'
import { NodeDirectorySource } from './node-directory'

const [folder, mode = 'finish', killAfterRaw = '3'] = process.argv.slice(2)
if (!folder) {
  console.error('usage: bun test/resume-harness.ts <folder> [kill|finish|abort] [killAfter]')
  process.exit(1)
}

const killAfter = Number(killAfterRaw)
const tag = process.env.RUN_TAG ?? 'run'
const keyCount = Number(process.env.KEYS ?? '1')
const workers = Number(process.env.WORKERS ?? '1')
/** Two rungs with no rate limit worth waiting for — this mock answers instantly. */
const LADDER = [
  { model: 'fast-fake', rpm: 600, perFileMs: 3800 },
  { model: 'deep-fake', rpm: 600, perFileMs: 6000 },
]

const controller = new AbortController()
let calls = 0
let inFlight = 0
let peak = 0
const perModel: Record<string, number> = {}
let demotions = 0
let schemaAsks = 0

/**
 * Google's own 429 body, captured from the live API, with the quota id changed
 * to the daily variant. Verbatim on purpose: what is being tested is that the
 * parser finds `quotaId` in the shape Google actually sends.
 */
const DAILY_429 = JSON.stringify({
  error: {
    code: 429,
    message:
      'You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 1000',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [
          {
            quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
            quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
            quotaDimensions: { location: 'global', model: 'fast-fake' },
            quotaValue: '1000',
          },
        ],
      },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' },
    ],
  },
})

/**
 * The other 429: the per-minute one, with the sixty seconds Google asks for.
 *
 * This is the case the bench exists for. A run that answers it by sleeping
 * takes a minute longer than it should; a run that swaps keys takes the 150 ms
 * the mock costs. The harness prints its own wall clock so the difference is
 * not a matter of opinion.
 */
const MINUTE_429 = JSON.stringify({
  error: {
    code: 429,
    message: 'Resource has been exhausted (e.g. check quota).',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [
          {
            quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
            quotaDimensions: { location: 'global', model: 'fast-fake' },
            quotaValue: '15',
          },
        ],
      },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '60s' },
    ],
  },
})

const startedAt = Date.now()

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  calls++
  const n = calls
  const url = String(typeof input === 'object' && 'url' in input ? input.url : input)
  const model = url.match(/models\/([^:]+):/)?.[1] ?? 'unknown'
  perModel[model] = (perModel[model] ?? 0) + 1

  const askedForSchema = String(init?.body ?? '').includes('responseSchema')
  if (askedForSchema) schemaAsks++

  // A model that cannot do structured output: the run must notice once and
  // carry on asking the plain way, not fail every file.
  if (mode === 'noschema' && askedForSchema) {
    return new Response(
      JSON.stringify({
        error: {
          code: 400,
          message: 'Json mode is not enabled for models/deep-fake: response_mime_type is unsupported',
          status: 'INVALID_ARGUMENT',
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  // One key is over its per-minute limit for the whole run. Nothing about the
  // files is wrong, so every one of them must still land — on another key.
  const apiKey = new Headers(init?.headers).get('x-goog-api-key') ?? ''
  if (mode === 'ratelimit' && apiKey === 'fake-key-1' && model === 'fast-fake') {
    return new Response(MINUTE_429, { status: 429, headers: { 'content-type': 'application/json' } })
  }

  // The fast rung's daily quota runs out; the key should walk down, not die.
  if (mode === 'ladder' && model === 'fast-fake' && perModel[model] > killAfter) {
    return new Response(DAILY_429, { status: 429, headers: { 'content-type': 'application/json' } })
  }

  inFlight++
  peak = Math.max(peak, inFlight)
  try {
  if (mode === 'kill' && n > killAfter) {
    console.log(`[harness] hard kill while starting request ${n}`)
    process.exit(137)
  }
    await new Promise((resolve) => setTimeout(resolve, 150))
    if (mode === 'abort' && n === 6) {
      console.log('[harness] abort() while the last file is in flight')
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: `${tag} title number ${n} for a stock photograph`,
                    keywords:
                      'mountain, lake, sunrise, travel, landscape, nature, calm, outdoor',
                    category: '11',
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: { totalTokenCount: 123 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  } finally {
    inFlight--
  }
}) as typeof fetch

const emit = (event: EngineEvent) => {
  if (event.type === 'log') console.log(`[${event.level}] ${event.message}`)
  else if (event.type === 'file-done') console.log(`OK ${event.done}/${event.total} ${event.row.filename}`)
  else if (event.type === 'file-failed') console.log(`FAIL ${event.name}: ${event.message.slice(0, 80)}`)
  else if (event.type === 'key-demoted') {
    demotions++
    console.log(`DEMOTED key ${event.keyIndex + 1} -> rung ${event.rung}`)
  }
  else console.log(event.type, JSON.stringify(event).slice(0, 160))
}

const source = new NodeDirectorySource(folder)

const result = await runFolder({
  source,
  keys: new KeyPool(
    Array.from({ length: keyCount }, (_, index) => `fake-key-${index + 1}`),
    emit,
    LADDER,
  ),
  profile: adobeProfile,
  video: passthroughPreprocessor,
  options: {
    platform: 'adobe',
    maxConcurrentWorkers: workers,
    renameBrackets: false,
    // The browser always defers the CSV to the review screen.
    deferExport: true,
  },
  emit,
  signal: mode === 'abort' ? controller.signal : undefined,
})

console.log(`[harness] wall clock: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
console.log(`[harness] fetch calls: ${calls}, peak in flight: ${peak}`)
console.log(
  `[harness] per model: ${JSON.stringify(perModel)}, demotions: ${demotions}, schema asks: ${schemaAsks}`,
)
console.log(`[harness] partial=${result.partial} rows=${result.rows.length}`)
console.log(`[harness] fallback rows: ${result.rows.filter((row) => row.fallback).length}`)
console.log(`[harness] titles: ${result.rows.map((row) => row.title.split(' ').slice(0, 4).join(' ')).join(' | ')}`)

// What the UI does when Export is enabled: exportRun writes the CSV and
// deletes the progress file.
if (!result.partial && process.env.EXPORT === '1') {
  const { csvName, text } = await exportRun(
    {
      source,
      profile: adobeProfile,
      options: { platform: 'adobe', maxConcurrentWorkers: 1, renameBrackets: false },
      emit,
    },
    result.rows,
  )
  console.log(`[harness] exported ${csvName} with ${text.trim().split('\n').length - 1} data rows`)
}
