import type { RunOptions } from '#/lib/engine/types'

/**
 * Run preferences — platform, output shape. These are preferences, not
 * secrets, so localStorage is the right home: no round trip, and they follow
 * the machine rather than the account.
 *
 * API keys used to live here too. They now belong to the user's account
 * (`src/lib/server/gemini-keys.ts`), encrypted at rest.
 */
const LEGACY_KEYS_STORAGE = 'microstock.gemini-keys'
const SETTINGS_STORAGE = 'microstock.settings'

/**
 * The model is not a user setting.
 *
 * Gemma is free, and its quirks (chain-of-thought JSON, the audio refusal, the
 * 429 pattern) are what the whole engine is tuned for. When it refuses a file
 * on every key, the runner asks Gemini Flash once — see `tryFallbackModel`.
 * Neither name is worth a dropdown: nobody chooses a model to get keywords.
 */
export const PRIMARY_MODEL = 'gemma-4-26b-a4b-it'
export const FALLBACK_MODEL = 'gemini-flash-latest'

/** One worker per key, capped: more parallelism than keys just queues. */
export const MAX_WORKERS = 8

export interface StoredSettings {
  platform: RunOptions['platform']
  editorial: boolean
  mature: boolean
  illustration: 'auto' | 'yes' | 'no'
  /**
   * How many keys this run is allowed to spend at once. `0` means all of them,
   * and it is the sentinel rather than the count because the count changes
   * every time a key is added or deleted — a stored `4` would quietly stop
   * meaning "all" the moment a fifth key arrived.
   */
  maxKeys: number
}

export const DEFAULT_SETTINGS: StoredSettings = {
  platform: 'adobe',
  editorial: false,
  mature: false,
  illustration: 'auto',
  maxKeys: 0,
}

/**
 * Real keys are sitting in localStorage from the pre-account build. Clear them
 * on load — the account is the only place they belong now.
 */
export function clearLegacyKeyStorage(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(LEGACY_KEYS_STORAGE)
}

export function loadSettings(): StoredSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE)
    if (!stored) return DEFAULT_SETTINGS
    // Spread over the defaults so a settings blob written by an older build —
    // which carried `model` and `maxConcurrentWorkers` — still loads.
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as Partial<StoredSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: StoredSettings): void {
  localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(settings))
}

/** Worker count follows the keys: one per key, so rotation has somewhere to go. */
export function workersFor(keyCount: number): number {
  return Math.max(1, Math.min(keyCount, MAX_WORKERS))
}

/**
 * How many keys a run actually gets, clamped at the point of use.
 *
 * `maxKeys` is remembered on the machine and the account's key list is not, so
 * a stored number can outlive the keys it was chosen for. Deciding here means
 * every caller — the picker, the rail, the run — agrees on one answer.
 */
export function keysInPlay(settings: StoredSettings, available: number): number {
  if (settings.maxKeys <= 0) return available
  return Math.max(1, Math.min(settings.maxKeys, available))
}

export function toRunOptions(
  settings: StoredSettings,
  keyCount: number,
): RunOptions {
  return {
    platform: settings.platform,
    /*
     * The run always uses the real filename. Swapping it for a vector
     * extension is the contributor's call and happens on the review screen,
     * where they can see the picture they are naming — the engine keeps the
     * option for the CLI.
     */
    vectorExtension: undefined,
    maxConcurrentWorkers: workersFor(keyCount),
    model: PRIMARY_MODEL,
    fallbackModel: FALLBACK_MODEL,
    editorial: settings.editorial,
    mature: settings.mature,
    illustration: settings.illustration === 'auto' ? null : settings.illustration === 'yes',
    /*
     * The web app never renames anything on disk. `[keywords]` in a filename
     * are still forced into the title and the keyword list — that part is the
     * profile's job — but the file keeps its name, so the CSV always points at
     * a file that is really there. The engine keeps the flag for the CLI.
     */
    renameBrackets: false,
  }
}
