/**
 * End-to-end smoke test against the real Gemini API through the local server.
 *
 * Not part of the app — run it by hand when the engine changes:
 *   bun test/e2e-local.ts <folder> <path-to-gemini-key.txt> [adobe|shutterstock]
 *
 * It reads the folder straight off disk, so no server and no account are
 * involved. Videos still carry their audio track here, which Gemma refuses —
 * point it at images, or strip the audio first with ffmpeg.
 */
import { readFileSync } from 'node:fs'

import { KeyPool } from '#/lib/engine/keys'
import { adobeProfile } from '#/lib/engine/profiles/adobe'
import { shutterstockProfile } from '#/lib/engine/profiles/shutterstock'
import { runFolder } from '#/lib/engine/runner'
import { MODEL_LADDER } from '#/lib/generator/settings'
import type { EngineEvent } from '#/lib/engine/types'
import { passthroughPreprocessor } from '#/lib/video/types'
import { NodeDirectorySource } from './node-directory'

const [folder, keyPath, platform = 'adobe'] = process.argv.slice(2)
if (!folder || !keyPath) {
  console.error('usage: bun test/e2e-local.ts <folder> <gemini-key.txt> [adobe|shutterstock]')
  process.exit(1)
}

const keys = readFileSync(keyPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))

// MODEL overrides the ladder with a single rung, for trying one candidate.
const ladder = process.env.MODEL
  ? [{ model: process.env.MODEL, rpm: 15 }]
  : MODEL_LADDER

const emit = (event: EngineEvent) => {
  if (event.type === 'log') console.log(`[${event.level}] ${event.message}`)
  else if (event.type === 'file-done') console.log(`✓ ${event.done}/${event.total} ${event.row.filename}`)
  else if (event.type === 'file-failed') console.log(`✗ ${event.name}: ${event.message}`)
  else console.log(event.type, JSON.stringify(event).slice(0, 200))
}

const result = await runFolder({
  source: new NodeDirectorySource(folder),
  // The same ladder the app runs, unless one model is named on the command
  // line — which is how a candidate gets compared against the real pipeline.
  keys: new KeyPool(keys, emit, ladder),
  profile: platform === 'shutterstock' ? shutterstockProfile : adobeProfile,
  video: passthroughPreprocessor,
  options: {
    platform: platform as 'adobe' | 'shutterstock',
    maxConcurrentWorkers: 2,
    renameBrackets: false,
  },
  emit,
})

console.log('\npartial:', result.partial, 'csv:', result.csvName)
for (const row of result.rows) console.log(JSON.stringify(row, null, 2))
