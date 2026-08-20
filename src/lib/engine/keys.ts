import type { Emit } from './types'

/**
 * Multi-key load balancer, ported from gemma/index.js.
 *
 * The three Gemma-specific behaviours the CLI learned the hard way are kept
 * intact: a 429 cools a key down instead of killing it, only MAX_CONSECUTIVE_429S
 * in a row (with no success in between) means the daily quota is gone, and every
 * key paces itself to RPM_PER_KEY on its own clock.
 */

export const RPM_PER_KEY = 15
export const RATE_LIMIT_DELAY_PER_KEY = Math.ceil(60000 / RPM_PER_KEY)
export const RATE_LIMIT_COOLDOWN_MS = 60000
export const MAX_CONSECUTIVE_429S = 5

export interface KeyState {
  key: string
  lastRequestTime: number
  requestCount: number
  quotaExceeded: boolean
  cooldownUntil: number
  consecutive429s: number
}

export function isQuotaExceededError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('429') ||
    message.includes('Too Many Requests') ||
    message.includes('exceeded your current quota') ||
    message.includes('quota')
  )
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class KeyPool {
  readonly clients: KeyState[]

  constructor(
    keys: string[],
    private emit: Emit,
  ) {
    if (keys.length === 0) throw new Error('No API keys provided')
    this.clients = keys.map((key) => ({
      key,
      lastRequestTime: 0,
      requestCount: 0,
      quotaExceeded: false,
      cooldownUntil: 0,
      consecutive429s: 0,
    }))
  }

  get aliveIndices(): number[] {
    return this.clients
      .map((client, index) => (client.quotaExceeded ? -1 : index))
      .filter((index) => index >= 0)
  }

  /** How long this key must wait before its next request is allowed. */
  waitFor(index: number): number {
    const client = this.clients[index]
    const waitUntil = Math.max(
      client.lastRequestTime + RATE_LIMIT_DELAY_PER_KEY,
      client.cooldownUntil,
    )
    return Math.max(0, waitUntil - Date.now())
  }

  markRequest(index: number) {
    const client = this.clients[index]
    client.lastRequestTime = Date.now()
    client.requestCount++
  }

  markSuccess(index: number) {
    this.clients[index].consecutive429s = 0
  }

  /**
   * Register a 429. Returns true when the key is now considered permanently
   * out of quota for this run.
   */
  handleRateLimit(index: number): boolean {
    const client = this.clients[index]
    client.consecutive429s++
    if (client.consecutive429s >= MAX_CONSECUTIVE_429S) {
      client.quotaExceeded = true
      this.emit({ type: 'key-dead', keyIndex: index })
      return true
    }
    client.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
    this.emit({
      type: 'key-cooldown',
      keyIndex: index,
      untilMs: client.cooldownUntil,
      consecutive429s: client.consecutive429s,
    })
    return false
  }

  stats() {
    return this.clients.map((client) => ({
      requests: client.requestCount,
      dead: client.quotaExceeded,
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
