import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { env } from '#/lib/runtime/env'
import { enqueue } from '#/lib/runtime/jobs'

import { getDb } from '#/db/index'
import { subscription } from '#/db/schema'

export const polarWebhook = new Hono()

/**
 * Billing webhook.
 *
 * Three things make this a Hono route rather than a server function:
 *   1. Signature verification needs the RAW body, byte for byte.
 *   2. The URL has to stay stable — it is configured in Polar's dashboard.
 *   3. Polar reads the HTTP status code to decide whether to retry.
 *
 * Anything slow is pushed onto a Queue so this handler returns fast. Polar
 * retries on timeout, and a slow handler turns into duplicate provisioning.
 */
polarWebhook.post('/api/webhooks/polar', async (c) => {
  if (!env.POLAR_WEBHOOK_SECRET) {
    console.error('POLAR_WEBHOOK_SECRET is not set')
    return c.json({ error: 'Webhook not configured' }, 500)
  }

  const body = await c.req.text()
  const headers = Object.fromEntries(c.req.raw.headers.entries())

  let event: ReturnType<typeof validateEvent>
  try {
    event = validateEvent(body, headers, env.POLAR_WEBHOOK_SECRET)
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      // 403 tells Polar not to retry — a bad signature will never become good.
      return c.json({ error: 'Invalid signature' }, 403)
    }
    throw error
  }

  const db = getDb()

  switch (event.type) {
    case 'subscription.created':
    case 'subscription.active':
    case 'subscription.updated':
    case 'subscription.canceled':
    case 'subscription.uncanceled':
    case 'subscription.past_due':
    case 'subscription.revoked': {
      const data = event.data
      // Set `metadata.userId` when creating the Polar checkout so the
      // subscription can be tied back to an account here.
      const userId = data.metadata?.userId

      if (typeof userId !== 'string') {
        console.warn(
          `polar webhook ${event.type} without metadata.userId (subscription ${data.id})`,
        )
        // Still 200: retrying will not add the missing metadata.
        break
      }

      const row = {
        id: crypto.randomUUID(),
        userId,
        polarSubscriptionId: data.id,
        polarCustomerId: data.customerId ?? null,
        productId: data.productId ?? null,
        status: data.status,
        currentPeriodEnd: data.currentPeriodEnd
          ? new Date(data.currentPeriodEnd)
          : null,
        cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
      }

      await db
        .insert(subscription)
        .values(row)
        .onConflictDoUpdate({
          target: subscription.polarSubscriptionId,
          set: {
            status: row.status,
            productId: row.productId,
            currentPeriodEnd: row.currentPeriodEnd,
            cancelAtPeriodEnd: row.cancelAtPeriodEnd,
          },
        })

      // Provisioning happens off the request path — see src/server.ts.
      if (event.type === 'subscription.active') {
        await enqueue({ kind: 'provision-account', userId })
      }
      break
    }

    default:
      // Unhandled event types are still acknowledged, otherwise Polar keeps
      // retrying events this app has no opinion about.
      break
  }

  return c.json({ received: true })
})

/** Reads current billing state locally — never calls Polar on the hot path. */
export async function getSubscriptionForUser(userId: string) {
  const db = getDb()
  const rows = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1)

  return rows[0] ?? null
}
