import { and, asc, eq, notExists, sql } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { vectorAccount, vectorFile } from '#/db/schema'
import { decryptSecret } from '#/lib/server/crypto'

/**
 * Which vectorizer.ai login a claim gets.
 *
 * **Why the queue picks at all.** vectorizer.ai rate-limits per ACCOUNT — the
 * `vectorizer` repo measured it, rotating the exit IP changed nothing — so two
 * workers signed in as the same login share one budget and get slower together
 * rather than faster apart. That repo's own note calls two processes on one
 * account "the main source of suddenly rate-limited all the time". So an
 * account is handed out with the file, at most one file at a time, and the
 * number of accounts is what actually sets how parallel the queue can be.
 *
 * **Busy is derived, not stored.** An account is in use when a `running`
 * `vector_file` names it, which means `reclaimStaleLeases` already frees the
 * accounts of dead workers with no code of its own. A second flag would be a
 * second thing to keep in step with the lease, and it would be the one that
 * got it wrong.
 */

export interface WorkerAccount {
  /** Names the account in a log line. Never the password. */
  label: string
  email: string
  password: string
}

/**
 * The active account no in-flight file is holding, idle longest first.
 *
 * Round-robin rather than "first row wins": the pace vectorizer.ai wants is
 * about 25 s between uploads on one login, so handing out the account used
 * least recently spreads a burst instead of stacking it.
 *
 * Returns null when every account is busy or there are none — both are "come
 * back later" to a worker, and the second is why `/health` reports the count.
 */
export async function pickFreeAccount() {
  const db = getDb()

  const [account] = await db
    .select()
    .from(vectorAccount)
    .where(
      and(
        eq(vectorAccount.status, 'active'),
        notExists(
          db
            .select({ one: sql`1` })
            .from(vectorFile)
            .where(
              and(
                eq(vectorFile.accountId, vectorAccount.id),
                eq(vectorFile.status, 'running'),
              ),
            ),
        ),
      ),
    )
    // SQLite sorts NULL first ascending, so an account never used goes first.
    .orderBy(asc(vectorAccount.lastClaimAt))
    .limit(1)

  return account ?? null
}

/** Stamped as the claim is handed out — it is the round-robin key. */
export async function markAccountClaimed(accountId: string) {
  await getDb()
    .update(vectorAccount)
    .set({ lastClaimAt: new Date() })
    .where(eq(vectorAccount.id, accountId))
}

/**
 * The account as the worker needs it: signed in with, not stored.
 *
 * This is the only place `vector_account.ciphertext` is decrypted, and the
 * only caller is the claim — which has already checked
 * `VECTOR_WORKER_SECRET`. Nothing here is ever logged or returned to a
 * browser.
 */
export async function credentialsFor(account: {
  label: string
  email: string
  ciphertext: string
}): Promise<WorkerAccount> {
  return {
    label: account.label,
    email: account.email,
    password: await decryptSecret(account.ciphertext),
  }
}

/**
 * What `/health` tells a worker at startup.
 *
 * Zero active accounts is the failure that otherwise looks like an empty
 * queue: every claim answers 204 and nothing ever explains why.
 */
export async function accountSummary() {
  const db = getDb()

  const [{ active = 0 } = {}] = await db
    .select({ active: sql<number>`count(*)` })
    .from(vectorAccount)
    .where(eq(vectorAccount.status, 'active'))

  const [{ busy = 0 } = {}] = await db
    .select({ busy: sql<number>`count(distinct ${vectorFile.accountId})` })
    .from(vectorFile)
    .where(eq(vectorFile.status, 'running'))

  return { active: Number(active), busy: Number(busy) }
}
