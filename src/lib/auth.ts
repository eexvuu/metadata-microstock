import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { env } from 'cloudflare:workers'

import { getDb } from '#/db/index'
import * as schema from '#/db/schema'
import { sendEmail } from '#/lib/email/index'

/**
 * IMPORTANT: if you change the `plugins` array here, mirror it in
 * `auth.cli.ts` and re-run `bun run auth:generate` — that file is what the
 * Better Auth CLI reads to emit the database schema.
 */
function createAuth() {
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: 'sqlite', schema }),

    emailAndPassword: {
      enabled: true,
      // Flip to true once a real email provider is configured. Left off so a
      // fresh clone with EMAIL_PROVIDER=console can complete signup.
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Reset your password',
          html: `<p>Click to reset your password: <a href="${url}">${url}</a></p>`,
          text: `Reset your password: ${url}`,
        })
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
