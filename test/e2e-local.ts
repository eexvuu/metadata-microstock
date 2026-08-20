/**
 * End-to-end smoke test against the real Gemini API through the local server.
 *
 * Not part of the app — run it by hand when the engine changes:
 *   bun run local            (in another terminal)
 *   bun test/e2e-local.ts <folder> <path-to-gemini-key.txt> [adobe|shutterstock]
 */
import { readFileSync } from 'node:fs'

import { KeyPool } from '#/lib/engine/keys'
import { adobeProfile } from '#/lib/engine/profiles/adobe'
import { shutterstockProfile } from '#/lib/engine/profiles/shutterstock'
import { runFolder } from '#/lib/engine/runner'
import type { EngineEvent } from '#/lib/engine/types'
import { LocalServerClient, LocalServerSource } from '#/lib/sources/local-server'
import { passthroughPreprocessor } from '#/lib/video/types'

const [folder, keyPath, platform = 'adobe'] = process.argv.slice(2)
if (!folder || !keyPath) {
  console.error('usage: bun test/e2e-local.ts <folder> <gemini-key.txt> [adobe|shutterstock]')
  process.exit(1)
}

const keys = readFileSync(keyPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))

const emit = (event: EngineEvent) => {
  if (event.type === 'log') console.log(`[${event.level}] ${event.message}`)
  else if (event.type === 'file-done') console.log(`✓ ${event.done}/${event.total} ${event.row.filename}`)
  else if (event.type === 'file-failed') console.log(`✗ ${event.name}: ${event.message}`)
  else console.log(event.type, JSON.stringify(event).slice(0, 200))
}

const result = await runFolder({
  source: new LocalServerSource(new LocalServerClient('http://localhost:4321'), folder),
  keys: new KeyPool(keys, emit),
  profile: platform === 'shutterstock' ? shutterstockProfile : adobeProfile,
  video: passthroughPreprocessor,
  options: {
    platform: platform as 'adobe' | 'shutterstock',
    maxConcurrentWorkers: 2,
    model: process.env.GEMMA_MODEL ?? 'gemma-4-26b-a4b-it',
    renameBrackets: false,
  },
  emit,
})

console.log('\npartial:', result.partial, 'csv:', result.csvName)
for (const row of result.rows) console.log(JSON.stringify(row, null, 2))
