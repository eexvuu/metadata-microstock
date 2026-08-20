import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'

import * as schema from './schema'

/**
 * Drizzle over the D1 binding.
 *
 * Bindings only exist inside a request context on Workers, so this is a
 * function, not a module-level constant. Drizzle itself is cheap to construct
 * (it wraps the binding, it does not open a connection), so there is no pool
 * to manage and nothing to memoize.
 *
 * Moving to Postgres later: swap this file for `drizzle-orm/postgres-js` +
 * Hyperdrive. The schema and every query stay as they are.
 */
export function getDb() {
  return drizzle(env.DB, { schema })
}

export type AppDatabase = ReturnType<typeof getDb>
