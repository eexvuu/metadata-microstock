import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { getAuth } from '#/lib/auth'
import { polarWebhook } from '#/api/webhooks/polar'

/**
 * Hono owns everything with an EXTERNAL caller.
 *
 * The rule of thumb for "should this be a Hono route or a server function?":
 *   - Called by our own React code  -> server function (typed end-to-end,
 *                                      no URL to keep stable)
 *   - Called by anyone else         -> Hono route (raw body for signature
 *                                      verification, stable versioned URL,
 *                                      real HTTP status codes)
 */
export const api = new Hono()

api.use('*', logger())

// The app itself is same-origin, so CORS only matters for the public API
// surface you expose to third parties or a future mobile client.
api.use('/api/v1/*', cors())

api.get('/api/health', (c) => c.json({ ok: true }))

// Better Auth owns this entire prefix: sign-in, sign-up, sessions, OAuth
// callbacks, and every admin-plugin endpoint.
api.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth().handler(c.req.raw))

api.route('/', polarWebhook)

// Your public, versioned API goes here. Kept separate from /api/auth and the
// webhooks so it can have its own auth scheme (API keys/JWT) and versioning.
api.get('/api/v1/ping', (c) => c.json({ pong: true }))

api.notFound((c) => c.json({ error: 'Not found' }, 404))
