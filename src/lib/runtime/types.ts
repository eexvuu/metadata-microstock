/**
 * The configuration this app reads, independent of where it runs.
 *
 * On workerd these arrive as `vars` and secrets on the Worker `env`; on a VPS
 * they are ordinary environment variables. Everything here is a STRING —
 * bindings (the database, the job queue) are not configuration and travel
 * through their own seams: `src/db/client.ts` and `src/lib/runtime/jobs.ts`.
 */
export interface AppEnv {
  APP_URL: string
  APP_TIER?: string
  BETTER_AUTH_SECRET: string
  /** Losing this makes every stored Gemini key undecryptable. Not rotatable. */
  ENCRYPTION_SECRET: string

  EMAIL_PROVIDER?: string
  EMAIL_FROM?: string
  EMAIL_FROM_NAME?: string
  RESEND_API_KEY?: string

  /** Sign-in is Google-only; both are required or auth throws at startup. */
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string

  POLAR_WEBHOOK_SECRET?: string

  /** libsql URL for the Node build. Ignored on workerd, which has a binding. */
  DATABASE_URL?: string

  /**
   * Cloudflare R2, over its S3 API — the only place vectorizer originals and
   * results ever live. Optional here and checked at USE, not at boot: a deploy
   * of the metadata tool alone must not fail to start because a tool nobody
   * has enabled is missing a bucket.
   */
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET?: string
  /** Optional override; defaults to `<account>.r2.cloudflarestorage.com`. */
  R2_ENDPOINT?: string

  /**
   * The shared secret the vectorize worker presents. It is a bearer token for
   * a machine, so it is long, random and rotatable — losing it costs one
   * `systemctl restart`, not a migration.
   */
  VECTOR_WORKER_SECRET?: string
}
