import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/**
 * Browser-side auth client. The base URL is relative, so it works unchanged
 * in dev, preview and production.
 *
 * Keep the plugin list aligned with the server (`src/lib/auth.ts`) — the
 * client plugins are what add `authClient.admin.*` to the typed API.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [adminClient()],
})

export const { signIn, signUp, signOut, useSession, admin } = authClient
