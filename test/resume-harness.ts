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
const controller = new AbortController()
let calls = 0
let inFlight = 0
let peak = 0

globalThis.fetch = (async () => {
  calls++
  const n = calls
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
  else if (event.type === 'file-failed') console.log(`FAIL ${event.name}: ${event.message}`)
  else console.log(event.type, JSON.stringify(event).slice(0, 160))
}

const source = new NodeDirectorySource(folder)

const result = await runFolder({
  source,
  keys: new KeyPool(
    Array.from({ length: keyCount }, (_, index) => `fake-key-${index + 1}`),
    emit,
  ),
  profile: adobeProfile,
  video: passthroughPreprocessor,
  options: {
    platform: 'adobe',
    maxConcurrentWorkers: workers,
    model: 'gemma-fake',
    fallbackModel: 'gemini-fake',
    renameBrackets: false,
    // The browser always defers the CSV to the review screen.
    deferExport: true,
  },
  emit,
  signal: mode === 'abort' ? controller.signal : undefined,
})

console.log(`[harness] fetch calls: ${calls}, peak in flight: ${peak}`)
console.log(`[harness] partial=${result.partial} rows=${result.rows.length}`)
console.log(`[harness] fallback rows: ${result.rows.filter((row) => row.fallback).length}`)
console.log(`[harness] titles: ${result.rows.map((row) => row.title.split(' ').slice(0, 4).join(' ')).join(' | ')}`)

// What the UI does when Export is enabled: exportRun writes the CSV and
// deletes the progress file.
if (!result.partial && process.env.EXPORT === '1') {
  const { csvName, text } = await exportRun({ source, profile: adobeProfile, options: { platform: 'adobe', maxConcurrentWorkers: 1, model: 'gemma-fake', renameBrackets: false }, emit }, result.rows)
  console.log(`[harness] exported ${csvName} with ${text.trim().split('\n').length - 1} data rows`)
}
