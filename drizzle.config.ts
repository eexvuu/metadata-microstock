import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit only GENERATES migrations here — it never connects to D1.
 * Applying them is wrangler's job, because D1 is reached through a binding:
 *
 *   bun run db:generate      # SQL from the schema diff
 *   bun run db:migrate       # apply to the local D1
 *   bun run db:migrate:prod  # apply to the remote D1
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
