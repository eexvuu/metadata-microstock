import { Hono } from 'hono'
import { z } from 'zod'

import { env } from '#/lib/runtime/env'
import { accountSummary } from '#/lib/server/vector-accounts'
import {
  claimNextFile,
  completeFile,
  failFile,
  reclaimStaleLeases,
} from '#/lib/server/vector-queue'

/**
 * The vectorize worker protocol.
 *
 * Hono rather than server functions, and it is the decision table in AGENTS.md
 * working exactly as written: the caller is not our React code. It is a Node
 * process on somebody's own machine — the `vectorizer` repo, running Playwright
 * against a signed-in vectorizer.ai — polling over the public internet. That
 * wants a stable URL, real status codes and an auth scheme of its own.
 *
 * Four verbs and no state on this side:
 *
 *   POST /api/v1/vector/claim     -> one file + presigned URLs + a login, or 204
 *   POST /api/v1/vector/complete  -> the vectors are in the bucket
 *   POST /api/v1/vector/fail      -> it did not work, and whether to try again
 *   GET  /api/v1/vector/health    -> the worker checking it is talking to us
 *
 * The worker is a MACHINE, so it authenticates with a bearer secret rather
 * than a session — there is no browser, no cookie and nobody to sign in. That
 * secret is the whole gate, which is why it is compared in constant time, is
 * never logged, and is rotated by editing one line in the env file.
 */

export const vectorApi = new Hono()

const BASE = '/api/v1/vector'

/**
 * Constant time, because a `===` on a secret leaks its prefix to anyone
 * willing to time a few thousand requests. Length is compared first and openly
 * — that is public information the moment the secret is chosen.
 */
function secretMatches(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false

  let diff = 0
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i)
  }

  return diff === 0
}

vectorApi.use(`${BASE}/*`, async (c, next) => {
  const expected = env.VECTOR_WORKER_SECRET

  // Unset means the tool is not enabled on this deployment. 503, not 401: the
  // worker is not wrong, this box is not ready.
  if (!expected) {
    return c.json({ error: 'The vectorize worker is not enabled on this server.' }, 503)
  }

  const presented = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? ''

  if (!secretMatches(presented, expected)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

/**
 * The account counts ride along because zero of them is indistinguishable from
 * an empty queue otherwise: every claim answers 204 and nothing says why. The
 * worker prints this at startup.
 */
vectorApi.get(`${BASE}/health`, async (c) =>
  c.json({ ok: true, accounts: await accountSummary() }),
)

const claimSchema = z.object({ worker: z.string().min(1).max(80) })

vectorApi.post(`${BASE}/claim`, async (c) => {
  const body = claimSchema.safeParse(await c.req.json().catch(() => ({})))

  if (!body.success) return c.json({ error: 'Send {"worker":"<name>"}.' }, 400)

  // Heal before handing out work: a queue that only recovers at 3am looks
  // empty all evening to the one worker that could have drained it.
  await reclaimStaleLeases()

  const file = await claimNextFile(body.data.worker)

  // 204 rather than an empty 200: "nothing to do" is not a result, and a
  // worker polling every few seconds should not have to parse one.
  if (!file) return c.body(null, 204)

  return c.json(file)
})

const completeSchema = z.object({
  fileId: z.string().min(1),
  formats: z.object({ svg: z.boolean().optional(), eps: z.boolean().optional() }),
})

vectorApi.post(`${BASE}/complete`, async (c) => {
  const body = completeSchema.safeParse(await c.req.json().catch(() => ({})))

  if (!body.success) return c.json({ error: 'Send {"fileId":"…","formats":{…}}.' }, 400)

  if (!body.data.formats.svg && !body.data.formats.eps) {
    return c.json({ error: 'A completion with no formats is a failure — POST /fail instead.' }, 400)
  }

  await completeFile(body.data)

  return c.json({ ok: true })
})

const failSchema = z.object({
  fileId: z.string().min(1),
  reason: z.string().min(1).max(2000),
  /**
   * The worker's own judgement. A rate limit or a lost session is worth
   * another go; an image vectorizer.ai refuses is not, and retrying it twice
   * only delays the refund.
   */
  retryable: z.boolean().default(true),
})

vectorApi.post(`${BASE}/fail`, async (c) => {
  const body = failSchema.safeParse(await c.req.json().catch(() => ({})))

  if (!body.success) return c.json({ error: 'Send {"fileId":"…","reason":"…"}.' }, 400)

  const result = await failFile(body.data)

  return c.json({ ok: true, ...result })
})
