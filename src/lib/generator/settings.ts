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
  vectorExtension: string
  editorial: boolean
  mature: boolean
  illustration: 'auto' | 'yes' | 'no'
  renameBrackets: boolean
}

export const DEFAULT_SETTINGS: StoredSettings = {
  platform: 'adobe',
  // '' means "not vector mode" — the CSV keeps the real file extension.
  vectorExtension: '',
  editorial: false,
  mature: false,
  illustration: 'auto',
  // On, matching the CLI: the CSV filename and the file on disk have to agree,
  // and stock platforms do not want brackets. Turning it off leaves the
  // brackets in both places rather than pointing the CSV at a missing file.
  renameBrackets: true,
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

export function toRunOptions(
  settings: StoredSettings,
  keyCount: number,
): RunOptions {
  return {
    platform: settings.platform,
    vectorExtension: settings.vectorExtension || undefined,
    maxConcurrentWorkers: workersFor(keyCount),
    model: PRIMARY_MODEL,
    fallbackModel: FALLBACK_MODEL,
    editorial: settings.editorial,
    mature: settings.mature,
    illustration: settings.illustration === 'auto' ? null : settings.illustration === 'yes',
    renameBrackets: settings.renameBrackets,
  }
}
