import type { LadderRung } from '#/lib/engine/keys'
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
 * The ladder. Fast quota first, deep quota last, and not a user setting —
 * nobody chooses a model to get keywords.
 *
 * Every number here was measured on 2026-08-23 against the free tier, not read
 * off a docs page: `gemini-3.5-flash-lite` answers a photograph in 3.8 s and
 * allows 15 requests a minute; `gemma-4-26b-a4b-it` takes 6 s (86 s before the
 * response schema) and allows 30. Flash-lite goes first because it is faster
 * per file, needs no JSON dug out of prose, and accepts video with its audio
 * track still on. Gemma goes last because its daily quota is the big one —
 * which is exactly what a key wants once the fast quota is spent.
 *
 * Pinned, not `-latest`: the alias resolved to 3.5-flash-lite the day this was
 * measured and will quietly become something else. A model change should be a
 * commit somebody made on purpose.
 */
export const MODEL_LADDER: LadderRung[] = [
  { model: 'gemini-3.5-flash-lite', rpm: 15, perFileMs: 3800 },
  { model: 'gemma-4-26b-a4b-it', rpm: 30, perFileMs: 6000 },
]

/** What the history row records — the whole ladder, since a run may use both. */
export const LADDER_LABEL = MODEL_LADDER.map((rung) => rung.model).join(' → ')

/**
 * What "auto" picks: one worker per key, up to eight.
 *
 * Eight is a safe default rather than a limit — it is roughly where a home
 * connection stops being helped by more parallel uploads, and where a folder
 * of 4K video stops fitting in a tab's memory. Somebody with thirty keys and a
 * folder of JPEGs is a different case, which is why the number is now settable.
 */
export const AUTO_WORKERS = 8

/**
 * The most a run will ever start, whatever is stored.
 *
 * Past this it is not parallelism any more: every in-flight file holds its
 * bytes *and* its base64 copy in the tab, so the ceiling is memory, not
 * politeness. Keys cap it too — a worker without a key of its own has nothing
 * to spend.
 */
export const MAX_WORKERS = 32

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
  /**
   * How many files to work on at once. `0` means auto — one worker per key up
   * to `AUTO_WORKERS` — and it is the sentinel for the same reason `maxKeys`
   * has one: a stored number outlives the key list it was chosen for.
   */
  maxWorkers: number
}

export const DEFAULT_SETTINGS: StoredSettings = {
  platform: 'adobe',
  editorial: false,
  mature: false,
  illustration: 'auto',
  maxKeys: 0,
  maxWorkers: 0,
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

/**
 * How many workers a run starts.
 *
 * Never more than there are keys in play: a worker is pinned to one key —
 * that is what makes rotation visible on the Generate screen — so a ninth
 * worker with eight keys would sit there with nothing to spend.
 */
export function workersFor(keyCount: number, requested = 0): number {
  const ceiling = Math.min(keyCount, MAX_WORKERS)
  if (requested > 0) return Math.max(1, Math.min(requested, ceiling))
  return Math.max(1, Math.min(keyCount, AUTO_WORKERS))
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
    maxConcurrentWorkers: workersFor(keyCount, settings.maxWorkers),
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
