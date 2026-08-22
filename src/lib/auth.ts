import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { env } from '#/lib/runtime/env'

import { getDb } from '#/db/index'
import * as schema from '#/db/schema'

/**
 * IMPORTANT: if you change the `plugins` array here, mirror it in
 * `auth.cli.ts` and re-run `bun run auth:generate` — that file is what the
 * Better Auth CLI reads to emit the database schema.
 */
function createAuth() {
  // Same rule as ENCRYPTION_SECRET: fail loudly at construction rather than
  // letting the sign-in button lead somewhere that 500s.
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set — sign-in is Google-only. See .env.example.',
    )
  }

  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: 'sqlite', schema }),

    /**
     * Google, and nothing else.
     *
     * Passwords are gone on purpose: this app holds people's Gemini keys, and
     * the cheapest way to stop being the weak link in that chain is to never
     * store a credential that can be reused somewhere else. It also deletes a
     * whole surface — reset mail, rate limiting on a login form, "was it a
     * capital A" support — that had no product value here.
     */
    emailAndPassword: { enabled: false },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },

    account: {
      accountLinking: {
        /**
         * An account that already exists under an email keeps its keys, runs
         * and role when its owner first signs in with Google. Google is
         * trusted for this because it verifies the address itself; without the
         * link the same person would land on a second, empty account and their
         * keys would look like they had vanished.
         */
        enabled: true,
        trustedProviders: ['google'],
      },
    },

    plugins: [
      /**
       * Roles live on `user.role`: everyone signs up as `user`, and an admin
       * is made deliberately — there is no self-service path to the role.
       *
       *   bunx wrangler d1 execute stockflow-db --local        *     --command "UPDATE user SET role='admin' WHERE email='you@example.com'"
       */
      admin({ defaultRole: 'user', adminRoles: ['admin'] }),
    ],
  })
}

let cached: ReturnType<typeof createAuth> | undefined

/**
 * Memoized per isolate, not per request.
 *
 * Bindings are not available at module scope on Workers, so the instance
 * cannot be built eagerly — but once a request has warmed the isolate the
 * same instance is safe to reuse, and rebuilding it per request wastes CPU
 * that matters on the Free plan's 10ms budget.
 */
export function getAuth() {
  cached ??= createAuth()
  return cached
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth['$Infer']['Session']
