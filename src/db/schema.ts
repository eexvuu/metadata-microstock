import { relations, sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { user } from './auth-schema'

/**
 * App schema.
 *
 * The auth tables are GENERATED — never edit `auth-schema.ts` by hand. Change
 * the plugin list in `auth.cli.ts` + `src/lib/auth.ts`, then run:
 *   bun run auth:generate && bun run db:generate
 *
 * Everything here is scoped to a USER. Stockflow has no organizations: a tool
 * run, a key and a subscription all belong to one person, so there is no
 * tenant column anywhere and no way for one account to read another's rows.
 */
export * from './auth-schema'

/**
 * Billing state, kept in our own DB rather than read from Polar on every
 * request — a webhook writes here, the app only ever reads locally.
 *
 * Not surfaced anywhere yet: every tool in the catalog is free today. It stays
 * wired so the first paid tool does not need a migration.
 */
export const subscription = sqliteTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Polar's subscription id, so webhooks can find the row again.
    polarSubscriptionId: text('polar_subscription_id').unique(),
    polarCustomerId: text('polar_customer_id'),
    productId: text('product_id'),
    // active | canceled | past_due | revoked | incomplete
    status: text('status').notNull().default('incomplete'),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp_ms' }),
    cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date()),
  },
  (table) => [index('subscription_userId_idx').on(table.userId)],
)

/**
 * A user's own Gemini API keys.
 *
 * These are third-party credentials billed to whoever owns them, so every
 * query filters on the session's `userId` and a key never appears in anyone
 * else's response — the admin screens included.
 *
 * `ciphertext` is AES-256-GCM (see src/lib/server/crypto.ts). `preview` is the
 * only part ever rendered; the plaintext leaves the server exactly once, to the
 * owner's own browser, because the engine calls Google directly from the tab.
 *
 * Named `gemini_key` rather than `api_key` so it is never confused with Better
 * Auth's apikey plugin table, should that ever be enabled.
 */
export const geminiKey = sqliteTable(
  'gemini_key',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    ciphertext: text('ciphertext').notNull(),
    /** e.g. "AIzaSy…8Qk2" — enough to tell two keys apart, useless on its own. */
    preview: text('preview').notNull(),
    // active | disabled
    status: text('status').notNull().default('active'),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date()),
  },
  (table) => [index('gemini_key_userId_idx').on(table.userId)],
)

/**
 * One row per run, not per file — per-file rows would turn D1 into an analytics
 * store, which is the escape-rule smell in STACK.md.
 *
 * The counts are reported by the browser that did the work, because that is
 * where the engine runs. Good enough to show someone their own history, and to
 * let an admin see who is using which tool; NOT something to enforce a paid
 * quota against without proxying or attesting the runs first.
 */
export const generationRun = sqliteTable(
  'generation_run',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Which catalog tool produced it — `metadata` is the only one so far. */
    tool: text('tool').notNull().default('metadata'),
    // adobe | shutterstock
    platform: text('platform').notNull(),
    model: text('model').notNull(),
    folderName: text('folder_name').notNull(),
    // folder (a directory handle) | files (a dropped selection)
    sourceMode: text('source_mode').notNull(),
    filesTotal: integer('files_total').notNull().default(0),
    filesDone: integer('files_done').notNull().default(0),
    /** Rows the model gave nothing usable for. */
    fallbacks: integer('fallbacks').notNull().default(0),
    // running | complete | partial | error
    status: text('status').notNull().default('running'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('generation_run_userId_idx').on(table.userId),
    index('generation_run_startedAt_idx').on(table.startedAt),
  ],
)

/**
 * Who did what to whom.
 *
 * Deliberately denormalised and deliberately free of foreign keys: an audit
 * row a cascade can erase is not an audit row. Deleting the admin who issued a
 * ban — or the account that was banned — has to leave the record standing, so
 * the actor's email and the target's label are copied in at write time instead
 * of being joined at read time.
 *
 * Nothing secret goes in here. A Gemini key may appear only as the
 * `previewOf()` form, which is the one representation crypto.ts calls safe to
 * render or log.
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    /** The account that acted. Plain text, no reference — see above. */
    actorId: text('actor_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    /** One of AUDIT_ACTIONS in `src/lib/server/audit.ts`. */
    action: text('action').notNull(),
    // user | session | key
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    /** An email, a key preview — whatever names the target to a human. */
    targetLabel: text('target_label'),
    /** One sentence for the admin reading the list. Never a secret. */
    detail: text('detail'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (table) => [
    index('audit_log_createdAt_idx').on(table.createdAt),
    index('audit_log_actorId_idx').on(table.actorId),
  ],
)

/**
 * One row a night, written by `src/cron.ts`.
 *
 * This lived in KV on Cloudflare. A VPS has no KV, and adding a store for two
 * integers a day would be the wrong trade — SQLite is already open.
 *
 * The numbers come from `generation_run`, which the browser reports, so they
 * carry the same warning: honest enough to plot, not something to bill against.
 */
export const usageDaily = sqliteTable('usage_daily', {
  /** YYYY-MM-DD, so a re-run of the same night overwrites rather than doubles. */
  day: text('day').primaryKey(),
  runs: integer('runs').notNull().default(0),
  files: integer('files').notNull().default(0),
})

/**
 * The rows a run produced, so someone can open it again, fix a title and take
 * a fresh CSV — the reason `generation_run` on its own was never enough.
 *
 * One row per RUN, holding the whole result as JSON, rather than one row per
 * file. Per-file rows would turn this into the analytics store STACK.md warns
 * about, and nothing here ever queries inside the result — it is fetched whole
 * or not at all.
 *
 * Kept out of `generation_run` deliberately: the history list selects every
 * column of that table, and a blob per run would ride along on a screen that
 * never shows it.
 *
 * `expiresAt` is stamped at first save and NOT extended by editing. Seven days
 * is a working window, not storage — the box is shared, and the numbers in
 * `generation_run` outlive this by design.
 */
export const runRows = sqliteTable(
  'run_rows',
  {
    runId: text('run_id')
      .primaryKey()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // adobe | shutterstock — copied so the editor knows which rules to apply
    // without a join back to the run.
    platform: text('platform').notNull(),
    folderName: text('folder_name').notNull(),
    /** A JSON array of MetadataRow. Never read into SQL, only out whole. */
    rows: text('rows').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('run_rows_userId_idx').on(table.userId),
    index('run_rows_expiresAt_idx').on(table.expiresAt),
  ],
)

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(user, { fields: [subscription.userId], references: [user.id] }),
}))

export const geminiKeyRelations = relations(geminiKey, ({ one }) => ({
  user: one(user, { fields: [geminiKey.userId], references: [user.id] }),
}))

export const generationRunRelations = relations(generationRun, ({ one }) => ({
  user: one(user, { fields: [generationRun.userId], references: [user.id] }),
}))
