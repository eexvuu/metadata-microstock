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
}
