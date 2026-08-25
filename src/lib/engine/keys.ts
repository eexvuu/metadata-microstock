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
  /**
   * How long one file takes on this rung, measured the same day as `rpm`.
   *
   * It is here because it is the only way to answer "is waiting cheaper than
   * dropping a rung?" without a magic number: waiting costs the wait plus a
   * file here, borrowing costs a file down there. See `borrowRung`.
   */
  perFileMs: number
}

/** Which keys on the bench a caller is willing to be handed. */
export interface LeaseOptions {
  /** Skip anything that would have to wait — the point of most swaps. */
  readyNow?: boolean
  /** Refuse a key that has fallen further down the ladder than this. */
  maxRung?: number
  /** The caller's own reason a key is no use to it — a queue nobody can serve. */
  usable?: (index: number) => boolean
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

  /**
   * The keys a worker is holding right now. Everything else is on the bench.
   *
   * This lives here rather than in the runner for one reason: choosing a key
   * and marking it taken has to happen without an await in between, or two
   * workers hand themselves the same key. A pool that knows who holds what can
   * make that one synchronous decision; a runner passing arrays around cannot.
   */
  private readonly leased = new Set<number>()

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

  /** The model this key is spending — on its own rung unless one is named. */
  modelFor(index: number, rung?: number): string {
    return this.ladder[rung ?? this.clients[index].rung].model
  }

  /** The rung below, for one last try at a file every key has refused. */
  nextRungFor(index: number): number | null {
    const next = this.clients[index].rung + 1
    return next < this.ladder.length ? next : null
  }

  /**
   * A rung further down that could answer right now, for a key whose own rung
   * cannot.
   *
   * Quota is per project per model, so a per-minute 429 on the fast rung says
   * nothing about the deep one: it has its own clock and the far bigger daily
   * allowance, which is exactly what makes it safe to spend on a file that
   * would otherwise sit still for a minute. Borrowing is about the file in
   * hand, not the key — the key keeps its rung and goes back to it the moment
   * the cooldown passes, which is why a worker asks this again for every file
   * rather than remembering the answer.
   *
   * Two conditions, and both were learned from real runs on 2026-08-25.
   *
   * It has to be a **cooldown**, not any wait: `waitFor` also covers the
   * seconds of pacing between one request and the next on the same key, and a
   * file that answers in 3.3 s leaves 0.7 s of a fifteen-a-minute slot. The
   * first real run sent four files out of ten to the slower model to save
   * that. Spacing is the ladder working; a cooldown is the ladder stopped, and
   * only the second is worth spending another model's quota on.
   *
   * And it has to be **worth it**. Google's `retryDelay` is the distance to
   * the next per-minute window, so a real 429 can cost anywhere from one
   * second to fifty-nine — the second run measured four of them at one to two
   * seconds. Waiting one second and taking 3.8 s beats a 6 s answer, so the
   * decision is that arithmetic rather than the word "cooldown".
   */
  borrowRung(index: number): number | null {
    const client = this.clients[index]
    if (client.quotaExceeded || !this.isCooling(index, client.rung)) return null

    const staying =
      this.waitFor(index) + this.ladder[client.rung].perFileMs

    for (let rung = client.rung + 1; rung < this.ladder.length; rung++) {
      if (client.rungs[rung].spent || this.isCooling(index, rung)) continue
      const moving = this.waitFor(index, rung) + this.ladder[rung].perFileMs
      if (moving < staying) return rung
    }
    return null
  }

  /** Told to come back later, as opposed to merely pacing itself. */
  private isCooling(index: number, rung: number): boolean {
    return this.clients[index].rungs[rung].cooldownUntil > Date.now()
  }

  /** How long this key must wait before its next request on a rung. */
  waitFor(index: number, rung?: number): number {
    const client = this.clients[index]
    const at = rung ?? client.rung
    const state = client.rungs[at]
    const spacing = Math.ceil(60000 / this.ladder[at].rpm)
    const waitUntil = Math.max(state.lastRequestTime + spacing, state.cooldownUntil)
    return Math.max(0, waitUntil - Date.now())
  }

  private fits(index: number, options: LeaseOptions): boolean {
    const client = this.clients[index]
    if (client.quotaExceeded || this.leased.has(index)) return false
    if (options.maxRung !== undefined && client.rung > options.maxRung) return false
    if (options.readyNow && this.waitFor(index) > 0) return false
    return options.usable ? options.usable(index) : true
  }

  /** Freshest rung first, then whichever is free soonest. */
  private better(candidate: number, incumbent: number): boolean {
    const rung = this.clients[candidate].rung
    const best = this.clients[incumbent].rung
    if (rung !== best) return rung < best
    return this.waitFor(candidate) < this.waitFor(incumbent)
  }

  /** Take a key off the bench for a worker to spend. Null when none fits. */
  lease(options: LeaseOptions = {}): number | null {
    let best = -1
    for (let index = 0; index < this.clients.length; index++) {
      if (!this.fits(index, options)) continue
      if (best === -1 || this.better(index, best)) best = index
    }
    if (best === -1) return null
    this.leased.add(best)
    return best
  }

  /** Put a key back. Its clock, its rung and its 429 count come with it. */
  release(index: number) {
    this.leased.delete(index)
  }

  /**
   * Trade a key that has to wait for one that does not.
   *
   * This is what a per-minute 429 costs when there are keys to spare: a swap
   * instead of a minute. The cooled key goes back to the bench with its
   * cooldown intact, so it is picked up again by whoever needs a key after it
   * has served its time — nothing is lost and nobody waits for it.
   */
  swap(index: number, options: LeaseOptions = {}): number | null {
    const next = this.lease({ ...options, readyNow: true })
    if (next === null) return null
    this.release(index)
    return next
  }

  markRequest(index: number, rung?: number) {
    const client = this.clients[index]
    client.rungs[rung ?? client.rung].lastRequestTime = Date.now()
    client.requestCount++
  }

  markSuccess(index: number, rung?: number) {
    const client = this.clients[index]
    client.rungs[rung ?? client.rung].consecutive429s = 0
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
  handleRateLimit(index: number, error?: unknown, rung?: number): boolean {
    const client = this.clients[index]
    const at = rung ?? client.rung
    const state = client.rungs[at]
    state.consecutive429s++

    const daily =
      isDailyQuotaError(error) || state.consecutive429s >= MAX_CONSECUTIVE_429S

    if (daily) {
      // A borrowed rung with nothing left for today is simply not borrowed
      // again. Only the rung a key is standing on can move it down the ladder.
      if (at !== client.rung) {
        state.spent = true
        return false
      }
      return this.demote(index)
    }

    // Google's own retryDelay when it sent one: it knows better than a minute.
    const retry =
      error instanceof GeminiError && error.retryDelayMs
        ? error.retryDelayMs
        : RATE_LIMIT_COOLDOWN_MS
    state.cooldownUntil = Date.now() + retry
    // The rail draws one countdown per key, from the rung it is standing on.
    // A borrowed rung cooling down is not that, and painting it there would
    // show a wait nobody is actually serving.
    if (at === client.rung) {
      this.emit({
        type: 'key-cooldown',
        keyIndex: index,
        untilMs: state.cooldownUntil,
        consecutive429s: state.consecutive429s,
      })
    }
    return false
  }

  /** Move a key to the next rung. Returns true when there was none. */
  demote(index: number): boolean {
    const client = this.clients[index]
    client.rungs[client.rung].spent = true

    // Past anything a borrow already found empty for the day.
    let next = client.rung + 1
    while (next < this.ladder.length && client.rungs[next].spent) next++

    if (next >= this.ladder.length) {
      client.quotaExceeded = true
      this.emit({ type: 'key-dead', keyIndex: index })
      return true
    }

    client.rung = next
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
