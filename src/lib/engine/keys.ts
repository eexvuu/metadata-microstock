import { GeminiError } from './gemini'
import type { Emit } from './types'

/**
 * Multi-key load balancer, ported from gemma/index.js and since taught about
 * models.
 *
 * The three behaviours the CLI learned the hard way are intact: a 429 cools a
 * key down instead of killing it, only MAX_CONSECUTIVE_429S in a row (with no
 * success in between) means a daily quota is gone, and every key paces itself
 * on its own clock.
 *
 * What is new is the ladder. Quota is per project *per model*, so a key that
 * has spent today's fast quota is not a dead key — it is a key that has to
 * work a rung lower. Each key walks down on its own: the fast model first,
 * the deep-quota one when the fast one is out. That is why every clock and
 * every 429 counter here is per rung rather than per key.
 */

/** What a key is allowed to spend, in order. */
export interface LadderRung {
  model: string
  /** Free-tier requests per minute for this model, measured, not assumed. */
  rpm: number
}

export const RATE_LIMIT_COOLDOWN_MS = 60000
export const MAX_CONSECUTIVE_429S = 5

interface RungState {
  lastRequestTime: number
  cooldownUntil: number
  consecutive429s: number
  /** Set when this rung's daily quota is gone; the key moves down. */
  spent: boolean
}

export interface KeyState {
  key: string
  /** Which rung of the ladder this key is on right now. */
  rung: number
  rungs: RungState[]
  requestCount: number
  /** Every rung spent — only now is the key itself out of the run. */
  quotaExceeded: boolean
}

export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof GeminiError) return error.status === 429
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('429') ||
    message.includes('Too Many Requests') ||
    message.includes('exceeded your current quota') ||
    message.includes('quota')
  )
}

/**
 * A 429 that means "come back tomorrow" rather than "come back in a minute".
 *
 * Google says which it is, in `details[].violations[].quotaId` — the observed
 * per-minute id is `GenerateRequestsPerMinutePerProjectPerModel-FreeTier`, and
 * the daily one is the same shape. Matching loosely on `PerDay` is deliberate:
 * the exact daily string has never been seen here, and a wrong guess would
 * demote a key that only needed to wait seven seconds. When the id is missing
 * the answer is no, and MAX_CONSECUTIVE_429S is what catches the rest.
 */
export function isDailyQuotaError(error: unknown): boolean {
  if (error instanceof GeminiError && error.quotaId) return /perday/i.test(error.quotaId)
  return false
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class KeyPool {
  readonly clients: KeyState[]

  constructor(
    keys: string[],
    private emit: Emit,
    readonly ladder: LadderRung[],
  ) {
    if (keys.length === 0) throw new Error('No API keys provided')
    if (ladder.length === 0) throw new Error('No models provided')

    this.clients = keys.map((key) => ({
      key,
      rung: 0,
      rungs: ladder.map(() => ({
        lastRequestTime: 0,
        cooldownUntil: 0,
        consecutive429s: 0,
        spent: false,
      })),
      requestCount: 0,
      quotaExceeded: false,
    }))
  }

  get aliveIndices(): number[] {
    return this.clients
      .map((client, index) => (client.quotaExceeded ? -1 : index))
      .filter((index) => index >= 0)
  }

  /** The model this key is spending right now. */
  modelFor(index: number): string {
    return this.ladder[this.clients[index].rung].model
  }

  /** The rung below, for one last try at a file every key has refused. */
  nextModelFor(index: number): string | null {
    const next = this.clients[index].rung + 1
    return next < this.ladder.length ? this.ladder[next].model : null
  }

  /** How long this key must wait before its next request on its current rung. */
  waitFor(index: number): number {
    const client = this.clients[index]
    const state = client.rungs[client.rung]
    const spacing = Math.ceil(60000 / this.ladder[client.rung].rpm)
    const waitUntil = Math.max(state.lastRequestTime + spacing, state.cooldownUntil)
    return Math.max(0, waitUntil - Date.now())
  }

  markRequest(index: number) {
    const client = this.clients[index]
    client.rungs[client.rung].lastRequestTime = Date.now()
    client.requestCount++
  }

  markSuccess(index: number) {
    const client = this.clients[index]
    client.rungs[client.rung].consecutive429s = 0
  }

  /**
   * Register a 429. Returns true when the key has nothing left to spend on any
   * rung — the only case where the worker holding it should stop.
   *
   * Three outcomes, in the order they are decided: the daily quota for this
   * rung is gone and there is a rung below (demote), it is gone and there is
   * not (the key is done), or it is the per-minute limit (cool down and keep
   * the rung). The five-in-a-row rule is the backstop for a 429 whose body did
   * not say which kind it was.
   */
  handleRateLimit(index: number, error?: unknown): boolean {
    const client = this.clients[index]
    const state = client.rungs[client.rung]
    state.consecutive429s++

    const daily =
      isDailyQuotaError(error) || state.consecutive429s >= MAX_CONSECUTIVE_429S

    if (daily) return this.demote(index)

    // Google's own retryDelay when it sent one: it knows better than a minute.
    const retry =
      error instanceof GeminiError && error.retryDelayMs
        ? error.retryDelayMs
        : RATE_LIMIT_COOLDOWN_MS
    state.cooldownUntil = Date.now() + retry
    this.emit({
      type: 'key-cooldown',
      keyIndex: index,
      untilMs: state.cooldownUntil,
      consecutive429s: state.consecutive429s,
    })
    return false
  }

  /** Move a key to the next rung. Returns true when there was none. */
  demote(index: number): boolean {
    const client = this.clients[index]
    client.rungs[client.rung].spent = true

    if (client.rung + 1 >= this.ladder.length) {
      client.quotaExceeded = true
      this.emit({ type: 'key-dead', keyIndex: index })
      return true
    }

    client.rung++
    this.emit({ type: 'key-demoted', keyIndex: index, rung: client.rung })
    return false
  }

  stats() {
    return this.clients.map((client) => ({
      requests: client.requestCount,
      dead: client.quotaExceeded,
      rung: client.rung,
    }))
  }
}

/**
 * Parse a pasted gemini-key.txt: one key per line, `#` comments and blank
 * lines ignored. Same rules as gemma/api-keys.js so the same file works.
 */
export function parseKeyFile(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line !== 'your_api_key_here')
}
