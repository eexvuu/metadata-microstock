import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'

/**
 * Schema-generation config ONLY. Not used at runtime.
 *
 * The real auth instance lives in `src/lib/auth.ts`, but it imports
 * `cloudflare:workers`, which cannot be loaded outside the Workers runtime —
 * so the Better Auth CLI cannot read it. This file mirrors just the parts
 * that affect the database shape (adapter provider + plugins).
 *
 * KEEP THE PLUGIN LIST HERE IN SYNC WITH `createAuth()` in src/lib/auth.ts.
 *
 * Regenerate after changing plugins:
 *   bun run auth:generate
 */
export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: 'sqlite' }),
  emailAndPassword: { enabled: true },
  plugins: [admin()],
})
