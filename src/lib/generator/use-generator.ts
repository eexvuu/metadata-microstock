import { useCallback, useRef, useState } from 'react'

import { KeyPool } from '#/lib/engine/keys'
import { adobeProfile } from '#/lib/engine/profiles/adobe'
import { shutterstockProfile } from '#/lib/engine/profiles/shutterstock'
import type { PlatformProfile } from '#/lib/engine/profiles/types'
import { runFolder } from '#/lib/engine/runner'
import type { EngineEvent, MetadataRow, RunOptions } from '#/lib/engine/types'
import { browserImagePreprocessor } from '#/lib/image/browser'
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
    append('warn', 'Cancelled — progress is saved, re-run to resume.')
  }, [append])

  const start = useCallback(
    async (
      source: FileSource,
      keys: string[],
      options: RunOptions,
      video: VideoPreprocessor,
    ): Promise<RunOutcome> => {
      if (keys.length === 0) {
        setState({
          ...INITIAL,
          status: 'error',
          error: 'No active API keys on this account — add one under API keys.',
        })
        return { rows: [], status: 'error' }
      }

      const controller = new AbortController()
      abortRef.current = controller
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
          case 'scanned':
            setState((previous) => ({ ...previous, total: event.total }))
            append(
              'info',
              `${event.total} media files (${event.images} images, ${event.videos} videos); ${event.skipped} other files ignored`,
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
              `${event.name}: ${event.message}${event.requeued ? ' — requeued' : ' — using fallback row'}`,
            )
            break
          case 'key-cooldown':
            patchKey(event.keyIndex, { cooldownUntil: event.untilMs, current: undefined })
            append(
              'warn',
              `Key ${event.keyIndex + 1} rate-limited (429) — cooling down 60s (${event.consecutive429s}/5)`,
            )
            break
          case 'key-dead':
            patchKey(event.keyIndex, { dead: true, current: undefined })
            append('error', `Key ${event.keyIndex + 1} is out of quota for today`)
            break
          case 'model-fallback':
            append('warn', `${event.name}: retrying on ${event.model}`)
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
              `Partial run: ${event.done}/${event.total} done, ${event.remaining} left. No CSV yet — re-run to resume.`,
            )
            break
          case 'finished':
            append('info', `Wrote ${event.csvName} (${event.rows} rows)`)
            setState((previous) => ({ ...previous, csvName: event.csvName }))
            break
        }
      }

      try {
        const result = await runFolder({
          source,
          keys: new KeyPool(keys, handle),
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
    [append],
  )

  return { state, start, cancel, reset }
}
