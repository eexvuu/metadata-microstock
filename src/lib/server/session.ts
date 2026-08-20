import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { getAuth } from '#/lib/auth'

/** Reads the Better Auth session from the incoming request cookies. */
export async function readSession() {
  return getAuth().api.getSession({ headers: getRequest().headers })
}

/**
 * Use in server functions and route loaders that must not run anonymously.
 * Throwing a redirect is how TanStack Router handles this — the loader never
 * returns, and the client navigates.
 */
export async function requireSession() {
  const session = await requireSessionOrRedirect()
  return session
}

async function requireSessionOrRedirect() {
  const session = await readSession()

  if (!session) {
    throw redirect({ to: '/login' })
  }

  return session
}

/** Better Auth's admin plugin stores multiple roles comma-separated. */
export function rolesOf(role: string | null | undefined): string[] {
  return (role ?? 'user')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function isAdmin(role: string | null | undefined): boolean {
  return rolesOf(role).includes('admin')
}

/**
 * The gate on every admin surface.
 *
 * A user who is not an admin is sent back to their own dashboard rather than
 * shown a 403: the admin area is not something an ordinary account should even
 * learn exists. Roles come from `user.role`, which only another admin (or a
 * direct D1 statement) can set — there is no self-service path to it.
 */
export async function requireAdmin() {
  const session = await requireSessionOrRedirect()

  if (!isAdmin(session.user.role)) {
    throw redirect({ to: '/dashboard' })
  }

  return session
}

/** Exposed to the client so the root route can render the current user. */
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await readSession()

    if (!session) {
      return null
    }

    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role ?? 'user',
      },
    }
  },
)
