import type { AppEnv } from '#/lib/runtime/types'

/**
 * Configuration.
 *
 * Read once at module load, which is the process's lifetime: systemd restarts
 * the unit when its EnvironmentFile changes, so there is nothing to reload.
 * See `deploy/stockflow.service`.
 *
 * Everything here is a string. Bindings — the database, background work — are
 * not configuration and have their own modules: `src/db/client.ts` and
 * `src/lib/runtime/jobs.ts`.
 */
export const env = process.env as unknown as AppEnv
