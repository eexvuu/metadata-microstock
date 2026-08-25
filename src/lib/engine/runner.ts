import type { ImagePreprocessor } from '#/lib/image/types'
import type { FileSource, ProgressFile } from '#/lib/sources/types'
import type { VideoPreprocessor } from '#/lib/video/types'
import { csvFileName, toCsv } from './csv'
import type { UploadedMedia } from './files-api'
import { deleteMedia, uploadMedia } from './files-api'
import { bytesToBase64, generateContent } from './gemini'
import { isQuotaExceededError, KeyPool, sleep } from './keys'
import {
  cleanFilenameForExport,
  extractBracketKeywords,
  INLINE_MAX_BYTES,
  isUnsendableMedia,
  isWrongRung,
  mimeTypeOf,
  outputFilename,
  stem,
  WrongRungError,
} from './media'
import { fromProgressRecord, toProgressRecord } from './progress'
import type { PlatformProfile } from './profiles/types'
import type { Emit, MediaEntry, MetadataRow, PromptContext, RunOptions } from './types'

export interface RunnerDeps {
  source: FileSource
  keys: KeyPool
  profile: PlatformProfile
  video: VideoPreprocessor
  /** Turns vector art into a raster the model can read. Optional for the CLI. */
  image?: ImagePreprocessor
  options: RunOptions
  emit: Emit
  signal?: AbortSignal
}

export interface RunResult {
  rows: MetadataRow[]
  /** True when files are still queued — CSV and rename are deliberately skipped. */
  partial: boolean
  csvName?: string
}

interface Task {
  entry: MediaEntry
  triedKeys: Set<number>
}

/**
 * Models that answered a structured-output request with a 400.
 *
 * Module-level and deliberately so: the answer cannot change inside a run, and
 * a model that has said no once should not be asked again on every file. It is
 * bounded by the ladder — two entries — so it is a cache, not a leak.
 */
const schemaRefused = new Set<string>()

/** A 400 about the schema itself, as opposed to a 400 about the media. */
function isSchemaRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.startsWith('[400]') && /schema|response_?mime_?type|structured/i.test(message)
  )
}

function contextFor(entry: MediaEntry): PromptContext {
  return {
    name: entry.name,
    kind: entry.kind,
    bracketKeywords: extractBracketKeywords(entry.name),
  }
}

/**
 * One API call on one specific key, including the rate-limit wait, the audio
 * strip and the single stricter retry when keywords come back with no usable
 * separator. Throws on API error (429 included) — the caller decides whether to
 * requeue, cool the key down or fall back.
 *
 * Ported from GemmaMetadataGenerator.generateWithKey.
 */
async function generateWithKey(
  deps: RunnerDeps,
  entry: MediaEntry,
  keyIndex: number,
  modelOverride?: string,
): Promise<MetadataRow> {
  const { keys, profile, options, emit, source, video, image, signal } = deps
  const ctx = contextFor(entry)
  const prompt = profile.buildPrompt(ctx)
  // Read once, so the row records the model that actually answered even if the
  // key demotes while this file is in flight.
  const model = modelOverride ?? keys.modelFor(keyIndex)

  let bytes = await source.readBytes(entry)
  let mimeType = mimeTypeOf(entry.name)

  if (entry.kind === 'image' && image) {
    const before = bytes.length
    const raster = await image.toRaster(bytes, entry.name, mimeType)
    bytes = raster.bytes
    mimeType = raster.mimeType
    if (raster.changed) {
      emit({
        type: 'log',
        level: 'info',
        message: `Prepared ${entry.name} for the model: ${(before / 1048576).toFixed(2)}MB → ${(bytes.length / 1048576).toFixed(2)}MB JPEG`,
      })
    }
  }

  let uploadVideo = false
  let audioSurvived = false

  if (entry.kind === 'video') {
    const before = bytes.length
    const stripped = await video.stripAudio(bytes, entry.name, mimeType)
    bytes = stripped.bytes
    mimeType = stripped.mimeType
    uploadVideo = stripped.upload ?? false
    audioSurvived = stripped.hasAudio ?? false
    if (stripped.changed) {
      emit({
        type: 'log',
        level: 'info',
        message: `Audio stripped: ${entry.name} ${(before / 1048576).toFixed(2)}MB → ${(bytes.length / 1048576).toFixed(2)}MB`,
      })
    }
  }

  /*
   * Inline is still the normal way — one request, nothing left behind. Two
   * kinds of file cannot go that way: a codec this tab could not rewrite
   * (`upload`, and Google decodes those for us), and one whose base64 copy
   * would not fit in a request. Both take the same detour.
   */
  const byUpload = uploadVideo || bytes.length > INLINE_MAX_BYTES

  if (byUpload && audioSurvived && model !== keys.ladder[0].model) {
    throw new WrongRungError(
      `${entry.name} keeps its audio track — nothing here can strip a codec this browser cannot open — and the backup model refuses audio. It needs a key that still has today's fast quota.`,
    )
  }

  let uploaded: UploadedMedia | null = null
  let base64: string | undefined

  if (byUpload) {
    emit({
      type: 'log',
      level: 'info',
      message: `Sending ${entry.name} (${(bytes.length / 1048576).toFixed(1)}MB) to the model by reference — this is the upload, not the thinking`,
    })
    uploaded = await uploadMedia({
      apiKey: keys.clients[keyIndex].key,
      bytes,
      mimeType,
      displayName: entry.name,
      signal,
    })
    mimeType = uploaded.mimeType
  } else {
    base64 = bytesToBase64(bytes)
  }

  try {
    const callOnce = async (extraInstruction?: string) => {
      const wait = keys.waitFor(keyIndex)
      if (wait > 0) {
        emit({
          type: 'log',
          level: 'info',
          message: `Key ${keyIndex + 1}: waiting ${Math.ceil(wait / 1000)}s for the rate limit`,
        })
        await sleep(wait)
      }
      if (signal?.aborted) throw new Error('aborted')
      keys.markRequest(keyIndex)

      const ask = (withSchema: boolean) =>
        generateContent({
          apiKey: keys.clients[keyIndex].key,
          model,
          prompt: extraInstruction ? `${prompt}\n\n${extraInstruction}` : prompt,
          mimeType,
          base64,
          fileUri: uploaded?.uri,
          signal,
          responseSchema: withSchema ? profile.responseSchema : undefined,
        })

      /*
       * The schema is what keeps a model from writing its reasoning around the
       * JSON, and that is most of a run's wall clock. A model that refuses it
       * still has to do the work, so the refusal is remembered and the file is
       * asked for again the plain way — the parser has handled prose since day
       * one, and now only needs to.
       */
      let result
      if (schemaRefused.has(model)) {
        result = await ask(false)
      } else {
        try {
          result = await ask(true)
        } catch (error) {
          if (!isSchemaRejection(error)) throw error
          schemaRefused.add(model)
          emit({
            type: 'log',
            level: 'warn',
            message: 'Structured output refused — asking for plain JSON from here on',
          })
          result = await ask(false)
        }
      }

      keys.markSuccess(keyIndex)
      emit({
        type: 'log',
        level: 'info',
        message: `${entry.name} answered in ${(result.durationMs / 1000).toFixed(1)}s — ${result.usage.totalTokenCount ?? '?'} tokens [key ${keyIndex + 1}]`,
      })
      return result.text
    }

    let outcome = profile.parse(await callOnce(), ctx, options)

    if (outcome.extracted) {
      emit({
        type: 'log',
        level: 'info',
        message: `Extracted JSON from a verbose model response for ${entry.name}`,
      })
    }
    if (outcome.parseFailed) {
      emit({ type: 'log', level: 'warn', message: `No JSON in the response for ${entry.name} — using fallback` })
    }
    if (outcome.adjustedForBrackets.length > 0) {
      emit({
        type: 'log',
        level: 'info',
        message: `Bracket keywords forced into the text: ${outcome.adjustedForBrackets.join(', ')}`,
      })
    }

    if (outcome.irreparable) {
      emit({
        type: 'log',
        level: 'warn',
        message: `Keywords malformed for ${entry.name} — retrying once with a stricter instruction`,
      })
      const retried = profile.parse(await callOnce(profile.retryInstruction), ctx, options)
      // Keep the first attempt's space-split output if the retry is no better.
      if (retried.row.keywords && !retried.irreparable) outcome = retried
    }

    return { ...outcome.row, model }
  } finally {
    // Best effort, and never in the way: an upload that survives this run
    // expires on Google's side inside two days, so a failed delete must not
    // turn a finished file into an error.
    if (uploaded) void deleteMedia(keys.clients[keyIndex].key, uploaded.name)
  }
}

/**
 * Google's errors quote the model id back at you ("models/x-y-z is not
 * found"), and that id is the one thing the run log is not supposed to say —
 * which model writes the keywords is nobody's decision to make, so putting a
 * name in front of someone invites them to ask for a different one. The text
 * is otherwise the API's own, because that is what makes a failed file
 * diagnosable.
 */
function withoutModelNames(message: string, keys: KeyPool): string {
  let clean = message
  for (const rung of keys.ladder) {
    clean = clean.split(rung.model).join('the model')
  }
  return clean
}

/**
 * One last try, a rung down, for a file every key has refused.
 *
 * Not the same thing as a demotion: the key keeps its rung and its quota, this
 * is only about the file. A different family answering is better than writing
 * a row nobody can upload. A failure here is not interesting on its own — the
 * caller already has an error to report — so it is swallowed.
 */
async function tryNextRung(
  deps: RunnerDeps,
  entry: MediaEntry,
  keyIndex: number,
): Promise<MetadataRow | null> {
  const { emit, keys, signal } = deps
  const deeper = keys.nextModelFor(keyIndex)

  if (!deeper) return null
  if (signal?.aborted || keys.clients[keyIndex].quotaExceeded) return null

  emit({ type: 'model-fallback', name: entry.name })

  try {
    return await generateWithKey(deps, entry, keyIndex, deeper)
  } catch (error) {
    emit({
      type: 'log',
      level: 'warn',
      message: withoutModelNames(
        `The backup model could not do ${entry.name} either: ${error instanceof Error ? error.message : String(error)}`,
        keys,
      ),
    })
    return null
  }
}

export async function runFolder(deps: RunnerDeps): Promise<RunResult> {
  const { source, keys, profile, options, emit, signal } = deps

  const media = await source.listMedia()
  const images = media.filter((entry) => entry.kind === 'image').length
  const allNames = await source.listAllNames()
  emit({
    type: 'scanned',
    total: media.length,
    images,
    videos: media.length - images,
    skipped: allNames.length - media.length,
  })

  if (media.length === 0) return { rows: [], partial: false }

  // Vector mode analyses the raster image but writes the vector filename. Warn
  // when the vector the CSV will point at is not actually in the folder.
  if (options.vectorExtension) {
    const present = new Set(allNames.map((name) => name.toLowerCase()))
    const missing = media
      .filter((entry) => entry.kind === 'image')
      .map((entry) => stem(entry.name) + options.vectorExtension)
      .filter((name) => !present.has(name.toLowerCase()))
    if (missing.length > 0) {
      emit({
        type: 'log',
        level: 'warn',
        message: `${missing.length} image(s) have no matching ${options.vectorExtension} in this folder — those CSV rows will reference a file that is not there.`,
      })
    }
  }

  const previous = await source.readJson<ProgressFile>(profile.progressFile)
  const rows: MetadataRow[] = (previous?.results ?? []).map((record) =>
    fromProgressRecord(record, options.platform),
  )
  const done = new Set(rows.map((row) => row.filename))
  const total = media.length

  const queue: Task[] = media
    .filter((entry) => !done.has(outputFilename(entry.name, options.vectorExtension)))
    .map((entry) => ({ entry, triedKeys: new Set<number>() }))

  if (rows.length > 0) {
    emit({ type: 'resumed', rows: [...rows], total })
    emit({
      type: 'log',
      level: 'info',
      message: `Resuming: ${rows.length}/${total} already in ${profile.progressFile}`,
    })
  }

  const saveProgress = async () => {
    await source.writeJson(profile.progressFile, {
      folderPath: source.folderName,
      vectorMode: Boolean(options.vectorExtension),
      startedAt: new Date().toISOString(),
      results: rows.map((row) => toProgressRecord(row, options.platform)),
    })
  }

  // Serialise progress writes: two workers finishing at once would otherwise
  // both rewrite the same file from a half-updated array.
  let progressChain: Promise<unknown> = Promise.resolve()
  const withProgressLock = (fn: () => Promise<void>) => {
    const next = progressChain.then(fn)
    progressChain = next.catch(() => {})
    return next
  }

  const takeTaskFor = (keyIndex: number): Task | null => {
    for (let i = 0; i < queue.length; i++) {
      if (!queue[i].triedKeys.has(keyIndex)) return queue.splice(i, 1)[0]
    }
    return null
  }

  const worker = async (keyIndex: number): Promise<void> => {
    while (!keys.clients[keyIndex].quotaExceeded) {
      if (signal?.aborted) return
      const task = takeTaskFor(keyIndex)
      if (!task) return

      emit({ type: 'file-start', name: task.entry.name, keyIndex })

      try {
        const row = await generateWithKey(deps, task.entry, keyIndex)
        rows.push(row)
        await withProgressLock(async () => {
          emit({ type: 'file-done', row, done: rows.length, total, keyIndex })
          await saveProgress()
        })
      } catch (error) {
        if (signal?.aborted) {
          // `takeTaskFor` spliced this task out of the queue. Put it back
          // before unwinding: a Stop pressed while the last files are in
          // flight would otherwise leave an empty queue, which reads as a
          // finished run — and a finished run writes a CSV missing exactly
          // those files and deletes the progress file that could have
          // recovered them.
          queue.push(task)
          return
        }

        const message = withoutModelNames(
          error instanceof Error ? error.message : String(error),
          keys,
        )

        if (isQuotaExceededError(error)) {
          // A 429 says nothing about the file, so it goes back untouched and
          // stays eligible for this same key once the cooldown passes.
          queue.push(task)
          emit({ type: 'file-failed', name: task.entry.name, message, requeued: true })
          if (keys.handleRateLimit(keyIndex, error)) return
          await sleep(keys.waitFor(keyIndex))
          continue
        }

        task.triedKeys.add(keyIndex)
        const untried = keys.clients.filter(
          (client, index) => !client.quotaExceeded && !task.triedKeys.has(index),
        ).length

        // A file the preprocessors will not send never reached the API, so
        // there is nothing for another key or another model to answer
        // differently. Straight to the fallback row, with the reason in it.
        const terminal = isUnsendableMedia(error)
        // A rung down is the one model guaranteed to refuse this file, and
        // trying costs another upload of it.
        const noDeeperModel = terminal || isWrongRung(error)

        if (untried > 0 && !terminal) {
          queue.push(task)
          emit({ type: 'file-failed', name: task.entry.name, message, requeued: true })
        } else {
          emit({ type: 'file-failed', name: task.entry.name, message, requeued: false })

          // Every key has refused this file on the primary model. One last try
          // on the fallback family before writing a row nobody can upload.
          const row =
            (noDeeperModel ? null : await tryNextRung(deps, task.entry, keyIndex)) ??
            {
              ...profile.errorFallback(contextFor(task.entry), message, options),
              model: keys.modelFor(keyIndex),
              error: message,
            }
          rows.push(row)
          await withProgressLock(async () => {
            emit({ type: 'file-done', row, done: rows.length, total, keyIndex })
            await saveProgress()
          })
        }
      }
    }
  }

  const alive = keys.aliveIndices
  const initialWorkers = Math.min(options.maxConcurrentWorkers, alive.length)

  if (initialWorkers === 0) {
    emit({ type: 'log', level: 'error', message: 'Every API key is out of quota.' })
  } else if (queue.length > 0) {
    // Keys beyond the worker cap stay in reserve and are swapped in when an
    // active key is marked dead, so a run does not lose throughput to a 429.
    const reserves = alive.slice(initialWorkers)
    let active = 0

    await new Promise<void>((resolve) => {
      const spawn = (keyIndex: number) => {
        active++
        void worker(keyIndex).finally(() => {
          active--
          if (queue.length > 0) {
            while (reserves.length > 0) {
              const next = reserves.shift()!
              if (!keys.clients[next].quotaExceeded) {
                emit({
                  type: 'log',
                  level: 'info',
                  message: `Swapping in reserve key ${next + 1} (${reserves.length} left)`,
                })
                spawn(next)
                return
              }
            }
          }
          if (active === 0) resolve()
        })
      }
      for (const index of alive.slice(0, initialWorkers)) spawn(index)
    })
  }

  emit({ type: 'stats', perKey: keys.stats() })

  if (queue.length > 0) {
    // Partial run: keep the progress file and skip both the CSV and the rename.
    // Renaming now would desync the progress file from disk, and a partial CSV
    // is worse than none.
    emit({ type: 'partial', done: rows.length, total, remaining: queue.length })
    return { rows, partial: true }
  }

  // The browser defers this so the rows can be edited first; the CLI does not.
  if (options.deferExport) return { rows, partial: false }

  const { csvName } = await exportRun({ source, profile, options, emit, media }, rows)

  return { rows, partial: false, csvName }
}

export interface ExportDeps {
  source: FileSource
  profile: PlatformProfile
  options: RunOptions
  emit: Emit
  /** Needed for the bracket rename; skip it and only the CSV is produced. */
  media?: MediaEntry[]
}

/**
 * Turn finished rows into the CSV — the last step of a run, split out so the
 * browser can put a review screen in front of it.
 *
 * A source that cannot write back (loose files) gets the text returned and
 * nothing else touched: no rename, no progress file to clear. Same bytes
 * either way, because the CSV is a contract both platforms have accepted for a
 * year — see `csv.ts`.
 */
export async function exportRun(
  deps: ExportDeps,
  rows: MetadataRow[],
): Promise<{ csvName: string; text: string }> {
  const { source, profile, options, emit, media } = deps

  if (options.renameBrackets && source.writable && media) {
    for (const row of rows) {
      const cleaned = cleanFilenameForExport(row.filename)
      if (cleaned === row.filename) continue
      const entry = media.find((item) => item.name === row.sourceName)
      if (!entry) continue
      try {
        await source.rename(entry, cleanFilenameForExport(entry.name))
        row.filename = cleaned
      } catch (error) {
        emit({
          type: 'log',
          level: 'warn',
          message: `Could not rename ${row.filename}: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }
  }

  const table = profile.toCsv(rows, options)
  const csvName = csvFileName(profile.csvPrefix, source.folderName)
  const text = toCsv(table.headers, table.rows, { bom: table.bom })

  if (source.writable) {
    await source.writeText(csvName, text)
    await source.remove(profile.progressFile)
  }

  emit({ type: 'finished', csvName, rows: rows.length })
  return { csvName, text }
}

/**
 * The CSV for rows that have no folder behind them any more.
 *
 * `exportRun` above needs a `FileSource` because it may rename files and write
 * the CSV next to them. Reopening a saved run from history has neither — the
 * files are back on the contributor's own disk and the tab cannot see them —
 * so this is the same last two steps with nothing to write to.
 */
export function csvTextFor(
  profile: PlatformProfile,
  rows: MetadataRow[],
  options: RunOptions,
  folderName: string,
): { csvName: string; text: string } {
  const table = profile.toCsv(rows, options)
  return {
    csvName: csvFileName(profile.csvPrefix, folderName),
    text: toCsv(table.headers, table.rows, { bom: table.bom }),
  }
}
