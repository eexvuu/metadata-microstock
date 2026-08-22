import { createDb } from './client'

/**
 * The database, whatever it happens to be underneath.
 *
 * The engine of the swap lives in `client.ts`: it was a D1 binding on
 * Cloudflare, it is a libsql file on the VPS, and every query in the app is
 * written against Drizzle's SQLite dialect and did not change.
 */
export function getDb() {
  return createDb()
}

export type AppDatabase = ReturnType<typeof getDb>
