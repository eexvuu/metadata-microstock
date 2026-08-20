import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { count, eq, gte, sum } from 'drizzle-orm'

import { api } from '#/api/index'
import { getDb } from '#/db/index'
import { generationRun, user } from '#/db/schema'

/**
 * The single Worker entry point.
 *
 * HTTP, the queue consumer, cron, Durable Objects and Workflows all hang off
 * this one file. That is the structural reason this stack is worth it: one
 * `wrangler deploy`, no extra infrastructure to run alongside it.
 */
const entry = createServerEntry({
  fetch(request) {
    const url = new URL(request.url)

    /**
     * /api/*  -> Hono. Anything with an EXTERNAL caller (webhooks, the public
     *            API, auth callbacks) belongs here: raw bodies, stable URLs,
     *            meaningful status codes.
     * else    -> TanStack Start. The app's own client-server calls should be
     *            server functions instead — typed end-to-end, no URL to keep.
     */
    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request)
    }

    return handler.fetch(request)
  },
})

type QueueJob = { kind: 'provision-account'; userId: string }

export default {
  fetch: entry.fetch,

  /**
   * Background work. A request has a hard time limit; provisioning that sends
   * mail and touches several tables does not belong on it.
   */
  async queue(batch: MessageBatch<QueueJob>, env: Env) {
    for (const message of batch.messages) {
      try {
        switch (message.body.kind) {
          case 'provision-account': {
            const db = getDb()
            const [account] = await db
              .select({ id: user.id, name: user.name, email: user.email })
              .from(user)
              .where(eq(user.id, message.body.userId))
              .limit(1)

            if (account) {
              await env.ONBOARDING.create({
                params: {
                  userId: account.id,
                  name: account.name,
                  email: account.email,
                },
              })
            }
            break
          }
        }

        message.ack()
      } catch (error) {
        console.error('queue job failed', message.body, error)
        message.retry()
      }
    }
  },

  /**
   * Nightly usage rollup (cron is set in wrangler.jsonc). Free plan allows 5
   * cron triggers per account with a 10ms CPU budget each, so this is one
   * grouped query, not a loop over accounts.
   */
  async scheduled(_event: ScheduledController, env: Env) {
    const db = getDb()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [today] = await db
      .select({
        runs: count(generationRun.id),
        files: sum(generationRun.filesDone),
      })
      .from(generationRun)
      .where(gte(generationRun.startedAt, since))

    const day = new Date().toISOString().slice(0, 10)

    await env.KV.put(
      `usage:${day}`,
      JSON.stringify({
        runs: today?.runs ?? 0,
        files: Number(today?.files ?? 0),
      }),
      { expirationTtl: 60 * 60 * 24 * 90 },
    )
  },
}

// Durable Object and Workflow classes must be exported from the Worker entry.
export { OrgRoom } from '#/durable/org-room'
export { OnboardingWorkflow } from '#/workflows/onboarding'
