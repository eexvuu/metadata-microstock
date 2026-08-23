import { useCallback, useRef, useState } from 'react'

import { KeyPool } from '#/lib/engine/keys'
import { adobeProfile } from '#/lib/engine/profiles/adobe'
import { shutterstockProfile } from '#/lib/engine/profiles/shutterstock'
import type { PlatformProfile } from '#/lib/engine/profiles/types'
import { runFolder } from '#/lib/engine/runner'
import type { EngineEvent, MetadataRow, RunOptions } from '#/lib/engine/types'
import { browserImagePreprocessor } from '#/lib/image/browser'
import { useMessages } from '#/lib/i18n'
import { MODEL_LADDER } from './settings'
import type { FileSource } from '#/lib/sources/types'
import type { VideoPreprocessor } from '#/lib/video/types'

export type RunStatus = 'idle' | 'running' | 'done' | 'partial' | 'error'

/** What the caller needs to record the run — not the same as the live state. */
export interface RunOutcome {
  rows: MetadataRow[]
  status: 'complete' | 'partial' | 'error'
}

export interface LogLine {
  id: number
  level: 'info' | 'warn' | 'error'
  message: string
  at: string
}

/** Live view of one API key, so the UI can show rotation as it happens. */
export interface KeyLive {
  requests: number
  done: number
  dead: boolean
  /** Epoch ms the 429 cooldown ends; 0 when the key is free. */
  cooldownUntil: number
  current?: string
}

export interface GeneratorState {
  status: RunStatus
  logs: LogLine[]
  rows: MetadataRow[]
  total: number
  done: number
  /** Which file each worker is on right now, keyed by API key index. */
  inFlight: Record<number, string>
  keys: KeyLive[]
  csvName?: string
  error?: string
}

const PROFILES: Record<RunOptions['platform'], PlatformProfile> = {
  adobe: adobeProfile,
  shutterstock: shutterstockProfile,
}

const INITIAL: GeneratorState = {
  status: 'idle',
  logs: [],
  rows: [],
  total: 0,
  done: 0,
  inFlight: {},
  keys: [],
}

function timestamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export function useGenerator() {
  // The engine writes its own lines in English — it is runtime-agnostic and
  // cannot reach this module. These are the ones the hook formats, which is
  // the narrative anyone actually follows during a run.
  const m = useMessages()
  const [state, setState] = useState<GeneratorState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const logId = useRef(0)

  const append = useCallback((level: LogLine['level'], message: string) => {
    setState((previous) => ({
      ...previous,
      // The log is the only real progress indicator on a long video run, but an
      // unbounded array in React state is a memory leak on a 500-file folder.
      logs: [...previous.logs.slice(-400), { id: logId.current++, level, message, at: timestamp() }],
    }))
  }, [])

  const reset = useCallback(() => setState(INITIAL), [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    append('warn', m.log.cancelled)
  }, [append, m])

  const start = useCallback(
    async (
      source: FileSource,
      keys: string[],
      options: RunOptions,
      video: VideoPreprocessor,
      /**
       * Called with every row the run holds so far, recovered rows included,
       * after each file. The caller decides how often that is worth a request —
       * this only guarantees the array is complete every time it fires.
       */
      onProgress?: (rows: MetadataRow[]) => void,
    ): Promise<RunOutcome> => {
      if (keys.length === 0) {
        setState({
          ...INITIAL,
          status: 'error',
          error: m.log.noKeys,
        })
        return { rows: [], status: 'error' }
      }

      const controller = new AbortController()
      abortRef.current = controller
      // React state is batched and read back a render later; a checkpoint
      // needs the rows as they are now, so the tally lives here too.
      const collected: MetadataRow[] = []
      setState({
        ...INITIAL,
        status: 'running',
        keys: keys.map(() => ({ requests: 0, done: 0, dead: false, cooldownUntil: 0 })),
      })

      /** Patch one key's live row without disturbing the others. */
      const patchKey = (index: number, patch: Partial<KeyLive>) =>
        setState((previous) => ({
          ...previous,
          keys: previous.keys.map((entry, position) =>
            position === index ? { ...entry, ...patch } : entry,
          ),
        }))

      const handle = (event: EngineEvent) => {
        switch (event.type) {
          case 'log':
            append(event.level, event.message)
            break
          case 'resumed':
            // These never fire `file-done`, so without this the screen and
            // every checkpoint would count the second half of a run as if it
            // were the whole of it.
            collected.push(...event.rows)
            setState((previous) => ({
              ...previous,
              rows: [...event.rows],
              done: event.rows.length,
              total: event.total,
            }))
            break
          case 'scanned':
            setState((previous) => ({ ...previous, total: event.total }))
            append(
              'info',
              m.log.scanned(
                event.total,
                event.images,
                event.videos,
                event.skipped,
              ),
            )
            break
          case 'file-start':
            setState((previous) => ({
              ...previous,
              inFlight: { ...previous.inFlight, [event.keyIndex]: event.name },
              keys: previous.keys.map((entry, position) =>
                position === event.keyIndex
                  ? {
                      ...entry,
                      requests: entry.requests + 1,
                      cooldownUntil: 0,
                      current: event.name,
                    }
                  : entry,
              ),
            }))
            break
          case 'file-done':
            collected.push(event.row)
            onProgress?.(collected)
            setState((previous) => {
              const inFlight = { ...previous.inFlight }
              delete inFlight[event.keyIndex]
              return {
                ...previous,
                rows: [...previous.rows, event.row],
                done: event.done,
                total: event.total,
                inFlight,
                keys: previous.keys.map((entry, position) =>
                  position === event.keyIndex
                    ? { ...entry, done: entry.done + 1, current: undefined }
                    : entry,
                ),
              }
            })
            break
          case 'file-failed':
            append(
              'error',
              m.log.fileFailed(event.name, event.message, event.requeued),
            )
            break
          case 'key-cooldown':
            patchKey(event.keyIndex, { cooldownUntil: event.untilMs, current: undefined })
            append(
              'warn',
              m.log.keyCooldown(event.keyIndex + 1, event.consecutive429s),
            )
            break
          case 'key-demoted':
            // Not a dead key: it keeps working, one rung down. The rail keeps
            // showing it because it is still spending quota.
            patchKey(event.keyIndex, { cooldownUntil: 0, current: undefined })
            append('warn', m.log.keyDemoted(event.keyIndex + 1))
            break
          case 'key-dead':
            patchKey(event.keyIndex, { dead: true, current: undefined })
            append('error', m.log.keyDead(event.keyIndex + 1))
            break
          case 'model-fallback':
            append('warn', m.log.modelFallback(event.name))
            break
          case 'stats':
            setState((previous) => ({
              ...previous,
              keys: previous.keys.map((entry, position) => ({
                ...entry,
                requests: event.perKey[position]?.requests ?? entry.requests,
                dead: event.perKey[position]?.dead ?? entry.dead,
                current: undefined,
              })),
            }))
            break
          case 'partial':
            append(
              'warn',
              m.log.partial(event.done, event.total, event.remaining),
            )
            break
          case 'finished':
            append('info', m.log.finished(event.csvName, event.rows))
            setState((previous) => ({ ...previous, csvName: event.csvName }))
            break
        }
      }

      try {
        const result = await runFolder({
          source,
          keys: new KeyPool(keys, handle, MODEL_LADDER),
          profile: PROFILES[options.platform],
          video,
          // The tab's own rasteriser: a no-op for anything already a JPEG or
          // a PNG, and pdf.js is only fetched if an .ai or .pdf turns up.
          image: browserImagePreprocessor,
          options,
          emit: handle,
          signal: controller.signal,
        })
        setState((previous) => ({ ...previous, status: result.partial ? 'partial' : 'done' }))
        return { rows: result.rows, status: result.partial ? 'partial' : 'complete' }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        append('error', message)
        setState((previous) => ({ ...previous, status: 'error', error: message }))
        return { rows: [], status: 'error' }
      } finally {
        abortRef.current = null
      }
    },
    [append, m],
  )

  return { state, start, cancel, reset }
}
