import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/index'
import { geminiKey } from '#/db/schema'
import { recordAudit } from '#/lib/server/audit'
import { decryptSecret, encryptSecret, previewOf } from '#/lib/server/crypto'
import { requireSession } from '#/lib/server/session'

/**
 * A user's own Gemini keys.
 *
 * Every query here filters on the session's `userId` — never on an id from the
 * request. Keys are third-party credentials, so "the row exists" is not
 * authorisation to read it.
 *
 * A plaintext key must never reach a log, an error message, or a response other
 * than `getDecryptedKeys` to its own owner.
 */

/**
 * Contributors hoard keys for daily quota, not for speed — the worker pool
 * caps at 8 whatever you paste in, so key eleven buys you more requests per
 * day and not a faster run. A hundred is generous enough that nobody sensible
 * meets it and small enough that one account cannot turn this table into a
 * list of somebody else credentials.
 */
const MAX_KEYS_PER_USER = 100

export interface KeySummary {
  id: string
  label: string
  preview: string
  status: string
  lastUsedAt: number | null
  createdAt: number
}

async function ownerId(): Promise<string> {
  return (await requireSession()).user.id
}

export const listGeminiKeys = createServerFn({ method: 'GET' }).handler(
  async (): Promise<KeySummary[]> => {
    const userId = await ownerId()
    const rows = await getDb()
      .select({
        id: geminiKey.id,
        label: geminiKey.label,
        preview: geminiKey.preview,
        status: geminiKey.status,
        lastUsedAt: geminiKey.lastUsedAt,
        createdAt: geminiKey.createdAt,
      })
      .from(geminiKey)
      .where(eq(geminiKey.userId, userId))
      .orderBy(asc(geminiKey.createdAt))

    return rows.map((row) => ({
      ...row,
      lastUsedAt: row.lastUsedAt?.getTime() ?? null,
      createdAt: row.createdAt.getTime(),
    }))
  },
)

/**
 * Ask Google whether the key works before storing it. Listing models costs no
 * generation quota, and a key that is already dead is worth rejecting at the
 * form rather than three minutes into a run.
 */
async function verifyWithGoogle(key: string): Promise<string | null> {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': key },
    })
    if (response.ok) return null
    // Google echoes nothing sensitive here, but the key itself is never in the
    // response — so this body is safe to pass back to its owner.
    return `Google rejected this key (${response.status}).`
  } catch (error) {
    return `Could not reach Google: ${error instanceof Error ? error.message : String(error)}`
  }
}

const addSchema = z.object({
  label: z.string().trim().max(60).optional(),
  /**
   * Accepts a whole gemini-key.txt paste: one key per line, `#` comments and
   * blanks ignored — the same rules the CLI uses, so the file works as-is.
   */
  keys: z.string().min(1),
})

export interface KeyPlan {
  /** In paste order: deduped, new to this account, and inside the cap. */
  accept: { key: string; preview: string }[]
  /** Lines naming a key the account already holds. */
  alreadyHeld: number
  /** New keys the cap has no room for. */
  overflow: number
}

/**
 * What a paste should actually do, decided before anything is stored.
 *
 * Pulled out of the handler so it can be tested without a session, a database
 * or a round trip to Google — `test/key-plan.ts` runs it.
 *
 * The ORDER is the whole fix. This used to compare the cap against the number
 * of LINES pasted, before any of them had been checked against what the
 * account already held. So re-pasting your own `gemini-key.txt` — the exact
 * thing the dialog invites you to do — came back as "that would take you past
 * 20 keys" even when every line in it was already stored and nothing would
 * have been added at all.
 */
export function planKeyAdditions(
  lines: string[],
  heldPreviews: string[],
  cap: number,
): KeyPlan {
  const seen = new Set<string>()
  const unique: { key: string; preview: string }[] = []

  for (const line of lines) {
    const key = line.trim()
    if (!key || key.startsWith('#') || key === 'your_api_key_here') continue

    // Deduped on the WHOLE key, not on its preview. Every Gemini key starts
    // `AIzaSy`, so a preview is really the last four characters doing the work
    // — at a hundred keys the odds of two distinct ones colliding are around
    // one in three hundred, which is far too likely for something that would
    // silently drop a key the user pasted. The same list twice is the case
    // this exists for, and it costs nothing to get right.
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ key, preview: previewOf(key) })
  }

  /**
   * Against what is already stored we can only compare previews: the keys
   * themselves are encrypted and this runs before anything is decrypted. So a
   * preview collision here reads as "already on this account" and quietly
   * skips a key that is genuinely new. Rare, visible in the count it reports,
   * and the fix is a hash column — worth doing before anyone routinely holds
   * dozens, not worth a migration today.
   */
  const held = new Set(heldPreviews)
  const fresh = unique.filter((entry) => !held.has(entry.preview))
  const room = Math.max(cap - heldPreviews.length, 0)
  const accept = fresh.slice(0, room)

  return {
    accept,
    alreadyHeld: unique.length - fresh.length,
    overflow: fresh.length - accept.length,
  }
}

/**
 * Verify in parallel, but not all at once.
 *
 * This used to be a sequential loop, which was invisible at a handful of keys
 * and would have taken half a minute at a hundred — long enough for the request
 * to die and for someone to reasonably conclude the feature was broken.
 * Bounded, because pointing a hundred simultaneous requests at Google to prove
 * you are a good citizen is its own kind of rude.
 */
const VERIFY_CONCURRENCY = 8

async function verifyAll(
  entries: { key: string; preview: string }[],
): Promise<{ key: string; preview: string; failure: string | null }[]> {
  const results: { key: string; preview: string; failure: string | null }[] = []
  let next = 0

  const worker = async () => {
    while (next < entries.length) {
      const entry = entries[next++]
      results.push({ ...entry, failure: await verifyWithGoogle(entry.key) })
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(VERIFY_CONCURRENCY, entries.length) }, worker),
  )

  return results
}

/**
 * Add whatever of that paste is actually new.
 *
 * The order matters and it was wrong before: the cap was checked against the
 * number of LINES pasted, before anything had been compared with what the
 * account already held. So re-pasting your own `gemini-key.txt` — the exact
 * thing the dialog invites you to do — was refused outright as "past 20 keys"
 * even when every line in it was already stored and nothing would have been
 * added at all.
 *
 * Now: dedupe inside the paste, drop what is already held, and only then ask
 * whether the remainder fits. What fits goes in; what does not is reported
 * rather than turned into a reason to reject the rest.
 */
export const addGeminiKeys = createServerFn({ method: 'POST' })
  .inputValidator(addSchema)
  .handler(async ({ data }) => {
    const userId = await ownerId()
    const db = getDb()

    const existing = await db
      .select({ preview: geminiKey.preview })
      .from(geminiKey)
      .where(eq(geminiKey.userId, userId))

    const {
      accept: accepted,
      alreadyHeld,
      overflow,
    } = planKeyAdditions(
      data.keys.split(/\r?\n/),
      existing.map((row) => row.preview),
      MAX_KEYS_PER_USER,
    )

    if (accepted.length === 0 && alreadyHeld === 0 && overflow === 0) {
      return { added: 0, errors: ['No keys found in that text.'] }
    }

    const errors: string[] = []
    if (alreadyHeld > 0) {
      errors.push(
        `${alreadyHeld} ${alreadyHeld === 1 ? 'key was' : 'keys were'} already on this account.`,
      )
    }
    if (overflow > 0) {
      errors.push(
        `${overflow} more would take you past ${MAX_KEYS_PER_USER} keys — remove some first.`,
      )
    }

    if (accepted.length === 0) return { added: 0, errors }

    const checked = await verifyAll(accepted)
    const good = checked.filter((entry) => entry.failure === null)

    for (const entry of checked) {
      if (entry.failure) errors.push(`${entry.preview}: ${entry.failure}`)
    }

    if (good.length === 0) return { added: 0, errors }

    /** Previews only — the audit trail must never see a whole key. */
    const rows = await Promise.all(
      good.map(async (entry, index) => ({
        id: crypto.randomUUID(),
        userId,
        label: data.label?.trim() || `Key ${existing.length + index + 1}`,
        ciphertext: await encryptSecret(entry.key),
        preview: entry.preview,
        status: 'active' as const,
      })),
    )

    // One statement rather than one per key: a hundred round trips to SQLite
    // for something the user experiences as a single action is a hundred
    // chances to half-succeed.
    await db.insert(geminiKey).values(rows)

    await recordAudit(
      userId,
      rows.map((row) => ({
        action: 'key.added' as const,
        targetType: 'key' as const,
        targetId: row.id,
        targetLabel: row.preview,
      })),
    )

    return { added: rows.length, errors }
  })

export const setGeminiKeyStatus = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string(), status: z.enum(['active', 'disabled']) }))
  .handler(async ({ data }) => {
    const userId = await ownerId()
    await getDb()
      .update(geminiKey)
      .set({ status: data.status })
      .where(and(eq(geminiKey.id, data.id), eq(geminiKey.userId, userId)))
    return { ok: true }
  })

export const deleteGeminiKey = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ownerId()
    const db = getDb()

    // Read the preview under the owner filter first: it is the only thing the
    // audit entry can name the key by, and a miss here means the row was never
    // this caller's to delete — so nothing is recorded either.
    const [existing] = await db
      .select({ preview: geminiKey.preview })
      .from(geminiKey)
      .where(and(eq(geminiKey.id, data.id), eq(geminiKey.userId, userId)))
      .limit(1)

    if (!existing) return { ok: true }

    await db
      .delete(geminiKey)
      .where(and(eq(geminiKey.id, data.id), eq(geminiKey.userId, userId)))

    await recordAudit(userId, {
      action: 'key.deleted',
      targetType: 'key',
      targetId: data.id,
      targetLabel: existing.preview,
    })

    return { ok: true }
  })

/**
 * The plaintext keys, for the owner's own browser.
 *
 * This is the one place a decrypted key leaves the server, and it exists
 * because the engine runs in the tab: the browser posts the media straight to
 * Google, so it needs the real key. Routing the media through the Worker
 * instead would keep the key server-side but blow the free plan's 10 ms CPU
 * budget on base64 alone — see AGENTS.md.
 */
export const getDecryptedKeys = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ keys: string[]; ids: string[] }> => {
    const userId = await ownerId()
    const rows = await getDb()
      .select({ id: geminiKey.id, ciphertext: geminiKey.ciphertext })
      .from(geminiKey)
      .where(and(eq(geminiKey.userId, userId), eq(geminiKey.status, 'active')))
      .orderBy(asc(geminiKey.createdAt))

    const keys: string[] = []
    const ids: string[] = []
    for (const row of rows) {
      try {
        keys.push(await decryptSecret(row.ciphertext))
        ids.push(row.id)
      } catch {
        // A key encrypted under a rotated ENCRYPTION_SECRET. Skip it rather
        // than failing the whole run; the keys page shows the user which.
      }
    }
    return { keys, ids }
  },
)

/** Stamped after a run so the keys page can show what is actually in use. */
export const markKeysUsed = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ ids: z.array(z.string()).max(MAX_KEYS_PER_USER) }))
  .handler(async ({ data }) => {
    if (data.ids.length === 0) return { ok: true }
    const userId = await ownerId()
    await getDb()
      .update(geminiKey)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(geminiKey.userId, userId), inArray(geminiKey.id, data.ids)))
    return { ok: true }
  })
