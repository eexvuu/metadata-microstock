import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/index'
import { geminiKey } from '#/db/schema'
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

const MAX_KEYS_PER_USER = 20

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

export const addGeminiKeys = createServerFn({ method: 'POST' })
  .inputValidator(addSchema)
  .handler(async ({ data }) => {
    const userId = await ownerId()
    const db = getDb()

    const parsed = data.keys
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line !== 'your_api_key_here')

    if (parsed.length === 0) return { added: 0, errors: ['No keys found in that text.'] }

    const existing = await db
      .select({ preview: geminiKey.preview })
      .from(geminiKey)
      .where(eq(geminiKey.userId, userId))

    if (existing.length + parsed.length > MAX_KEYS_PER_USER) {
      return {
        added: 0,
        errors: [`That would take you past ${MAX_KEYS_PER_USER} keys.`],
      }
    }

    const knownPreviews = new Set(existing.map((row) => row.preview))
    const errors: string[] = []
    let added = 0

    for (const [index, key] of parsed.entries()) {
      const preview = previewOf(key)
      if (knownPreviews.has(preview)) {
        errors.push(`${preview} is already saved.`)
        continue
      }

      const failure = await verifyWithGoogle(key)
      if (failure) {
        errors.push(`${preview}: ${failure}`)
        continue
      }

      await db.insert(geminiKey).values({
        id: crypto.randomUUID(),
        userId,
        label: data.label?.trim() || `Key ${existing.length + added + 1}`,
        ciphertext: await encryptSecret(key),
        preview,
        status: 'active',
      })
      knownPreviews.add(preview)
      added++
      void index
    }

    return { added, errors }
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
    await getDb()
      .delete(geminiKey)
      .where(and(eq(geminiKey.id, data.id), eq(geminiKey.userId, userId)))
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
