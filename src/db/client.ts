import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

import * as schema from './schema'

/**
 * SQLite over libsql, on the VPS.
 *
 * libsql rather than better-sqlite3 because it is prebuilt: the target box has
 * no node-gyp toolchain, and a deploy that needs a compiler is a deploy that
 * breaks on the first Node upgrade. The schema is `drizzle-orm/sqlite-core`
 * either way, so nothing above this file changed when D1 went away.
 *
 * One client for the process, not one per request. libsql owns its own
 * connection to the file; `drizzle()` around it is a thin wrapper, so it is
 * built per call the way it always was.
 */
let client: ReturnType<typeof createClient> | undefined

export function createDb() {
  client ??= createClient({
    url: process.env.DATABASE_URL ?? 'file:./data/stockflow.db',
  })
  return drizzle(client, { schema })
}
