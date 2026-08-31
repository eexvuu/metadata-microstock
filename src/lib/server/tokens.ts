import { desc, eq, sum } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { tokenLedger } from '#/db/schema'

/**
 * The token balance, derived and never stored.
 *
 * One token buys one image through the vectorizer. That is the whole pricing
 * model, and it is deliberately not configurable: the thing being metered is
 * one vectorizer.ai credit, and a multiplier between the two would be a number
 * somebody has to keep true.
 *
 * There is no `balance` column. `balanceOf` is `SUM(delta)` over an
 * append-only table, so the number on the screen and the rows that explain it
 * cannot disagree — the failure mode a stored counter always eventually has.
 * At the volumes this tool sees (an admin, a few hundred rows) the sum is free;
 * if it ever stops being, the fix is a materialised snapshot row in the same
 * ledger, not an UPDATE.
 */

export type LedgerReason = 'signup' | 'grant' | 'spend' | 'refund' | 'adjust'

/**
 * What an account starts with, and the only credit nobody has to ask for.
 *
 * Ten images is enough to put a real set through the tracer and look at the
 * SVGs in Illustrator — which is the question a trial has to answer — and
 * small enough that a bad week of signups is a bounded amount of vectorizer.ai
 * credit rather than an open tab. It is a constant rather than a setting for
 * the same reason `TOKENS_PER_FILE` is: a number somebody can change from a
 * screen is a number that has to be true retroactively for every row already
 * in the ledger.
 */
export const SIGNUP_GRANT = 10

export async function balanceOf(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sum(tokenLedger.delta) })
    .from(tokenLedger)
    .where(eq(tokenLedger.userId, userId))

  return Number(row?.total ?? 0)
}

/**
 * Takes `amount` tokens off a balance, or returns false and takes nothing.
 *
 * SQLite here is one writer on one process, so the read and the insert cannot
 * interleave with another debit in practice. It is still written as
 * check-then-insert rather than pretending to be atomic, because the honest
 * failure — two tabs submitting at once and one overdrawing by a few tokens —
 * is worth less than the complexity of a balance table, and the ledger makes
 * it visible if it ever happens.
 */
export async function spendTokens(input: {
  userId: string
  amount: number
  jobId: string
  note?: string
}): Promise<boolean> {
  if (input.amount <= 0) return true

  if ((await balanceOf(input.userId)) < input.amount) return false

  await getDb().insert(tokenLedger).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    delta: -input.amount,
    reason: 'spend',
    jobId: input.jobId,
    note: input.note,
  })

  return true
}

/**
 * Gives one token back for one file, at most once.
 *
 * This is the promise the tool makes: a file that did not come back as vectors
 * did not cost anything. The worker can report the same failure twice — a
 * retry, a duplicate delivery, a lease reclaimed under a worker that was only
 * slow — so idempotency cannot be a matter of calling it carefully. It is the
 * unique index on (`file_id`, `reason`): the second insert hits a constraint
 * and the balance does not move.
 */
export async function refundFile(input: {
  userId: string
  jobId: string
  fileId: string
  note?: string
}): Promise<void> {
  await getDb()
    .insert(tokenLedger)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      delta: 1,
      reason: 'refund',
      jobId: input.jobId,
      fileId: input.fileId,
      note: input.note,
    })
    .onConflictDoNothing()
}

/**
 * The trial credit, at most once per account.
 *
 * Idempotent by constraint, not by care — `token_ledger_signup_once_idx` is a
 * partial unique index on `user_id where reason = 'signup'`, so the second
 * insert hits it and the balance does not move. That is what lets two
 * unrelated callers both write it without coordinating:
 *
 *  - `databaseHooks.user.create.after` in `src/lib/auth.ts`, which is the real
 *    path and gives a new account its credit before it reaches the dashboard;
 *  - `getVectorOverview`, which is how every account that existed before this
 *    change gets the same ten. One code path rather than a data migration, and
 *    it stays as a backstop if the hook is ever missed.
 *
 * Not `grantTokens`: that is the human path and stamps an `actorEmail`, and
 * "who authorised this" must stay a fact. Nobody authorised this one — the
 * product did.
 */
export async function ensureSignupGrant(userId: string): Promise<void> {
  await getDb()
    .insert(tokenLedger)
    .values({
      id: crypto.randomUUID(),
      userId,
      delta: SIGNUP_GRANT,
      reason: 'signup',
      note: `Welcome — ${SIGNUP_GRANT} images to try the vectorizer`,
    })
    .onConflictDoNothing()
}

/** An admin putting tokens on an account. The only positive entry a human writes. */
export async function grantTokens(input: {
  userId: string
  amount: number
  note?: string
  actorEmail: string
}): Promise<void> {
  if (input.amount === 0) return

  await getDb().insert(tokenLedger).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    delta: input.amount,
    reason: input.amount > 0 ? 'grant' : 'adjust',
    note: input.note,
    actorEmail: input.actorEmail,
  })
}

export async function recentLedger(userId: string, limit = 20) {
  return getDb()
    .select({
      id: tokenLedger.id,
      delta: tokenLedger.delta,
      reason: tokenLedger.reason,
      note: tokenLedger.note,
      createdAt: tokenLedger.createdAt,
    })
    .from(tokenLedger)
    .where(eq(tokenLedger.userId, userId))
    .orderBy(desc(tokenLedger.createdAt))
    .limit(limit)
}
