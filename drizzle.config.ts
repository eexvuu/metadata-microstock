import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit both generates and applies now.
 *
 * On Cloudflare it could only generate: D1 is reached through a binding, so
 * wrangler had to do the applying. A libsql file is just a file, so:
 *
 *   bun run db:generate   # SQL from the schema diff
 *   bun run db:migrate    # apply it to DATABASE_URL
 *
 * There is still no down migration and no rollback. Take a copy of the file
 * before applying anything on the server — `deploy/deploy.sh` does.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./data/stockflow.db',
  },
})
