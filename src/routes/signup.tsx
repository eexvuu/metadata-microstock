import { createFileRoute } from '@tanstack/react-router'

import { GoogleSignIn } from '#/routes/login'

/**
 * Kept as a route, not a redirect.
 *
 * Signing in with Google creates the account, so there is nothing separate to
 * show — but "Sign up" links exist in the wild, in the marketing page and in
 * whatever someone bookmarked, and a 404 is a worse answer than the button
 * they were looking for.
 */
export const Route = createFileRoute('/signup')({
  component: GoogleSignIn,
})
