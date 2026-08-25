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

/**
 * Where the site-wide "Tools" link should point.
 *
 * /dashboard is behind a session, and its loader refuses one it does not have
 * by throwing a redirect to /login. That is the gate, and it holds — but it is
 * a server round-trip, so a signed-out visitor who clicks Tools watches the
 * router commit /dashboard and sit on it until the answer comes back. Sending
 * them straight to /login costs nothing and skips the detour entirely.
 *
 * While the session is still loading the answer is /dashboard, because a
 * signed-in visitor must never be sent to the sign-in page — and if the guess
 * is wrong, /login's own beforeLoad bounces them back.
 */
export function useToolsHref(): '/dashboard' | '/login' {
  const { data: session, isPending } = useSession()
  return session || isPending ? '/dashboard' : '/login'
}
