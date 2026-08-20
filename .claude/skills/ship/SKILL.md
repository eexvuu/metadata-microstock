---
name: ship
description: Use when verifying a change is releasable, choosing between the free and paid build, or deploying this repo to Cloudflare Workers. Covers the typecheck/build/bundle-size loop, the free vs paid tier decision, first-time infrastructure setup, production migrations, and rollback.
---

# Shipping

## Verifying a change (do this for every change)

```bash
bun run typecheck    # tsc --noEmit — must be silent
bun run build        # must succeed and prerender /
```

Both, in that order. Then open the affected screen in the browser: the failure
modes that matter here — a dialog with no fields, a button a role should not
see, a toast that lies — all typecheck perfectly.

If the change adds or removes a dependency, or touches anything bundled:

```bash
bunx wrangler deploy --dry-run    # prints Total Upload: … / gzip: …
```

The free plan's hard limit is **3 MiB gzipped**; the kit sits at ~799 KiB.
Report the number, and update it in `README.md` and `STACK.md` if it moved.

**Verifying a permission change means calling the server, not clicking.** A
hidden button proves nothing. Downgrade the role in the local D1, then invoke
the server function directly from the browser console:

```js
const panel = await import('/src/lib/server/panel.ts')
await panel.runResourceAction({ data: { resource: 'projects', action: 'archive', ids: ['…'] } })
```

It must be refused. Restore the role afterwards.

## Which tier

`spa.enabled` is a **build-time** flag, so free and paid are two builds, not a
runtime switch.

| | free | paid |
|---|---|---|
| Command | `bun run deploy` | `bun run deploy:paid` |
| Rendering | SPA — no per-request React | SSR |
| Why | 10 ms CPU per invocation | 30 s CPU |
| Email | Resend | Cloudflare Email Service |

Move to paid when SSR is genuinely needed, transactional email must reach
arbitrary recipients from Cloudflare, the bundle nears 3 MiB, traffic passes
100k requests/day, or 3-day log retention is too short. Not before.

## Deploying

**Deploying is outward-facing and hard to undo. Confirm with the human before
running any command in this section, every time — an earlier approval does not
carry over.**

First deploy only — create the infrastructure and paste the real ids into
`wrangler.jsonc` (it ships with placeholders):

```bash
bunx wrangler d1 create starter-kit-db      # -> database_id
bunx wrangler kv namespace create KV        # -> id
bunx wrangler r2 bucket create starter-kit-files
bunx wrangler queues create starter-kit-jobs
bunx wrangler secret put BETTER_AUTH_SECRET # openssl rand -base64 32
```

Every deploy:

```bash
bun run db:migrate:prod    # migrate BEFORE the code that needs it
bun run deploy             # or deploy:paid
```

Migrations are forward-only and there is no down migration, so a schema change
that the old code cannot tolerate needs two deploys: additive migration first,
then the code.

## Production checklist

- [ ] `BETTER_AUTH_SECRET` is a real secret, not the dev default
- [ ] `APP_URL` in `wrangler.jsonc` points at the real origin — Better Auth uses
      it for callbacks and its CSRF origin check
- [ ] `EMAIL_PROVIDER` is not `console`
- [ ] `requireEmailVerification: true` in `src/lib/auth.ts`
- [ ] Polar webhook URL registered and `POLAR_WEBHOOK_SECRET` set
- [ ] `metadata.organizationId` is set when creating Polar checkouts — the
      webhook cannot map a subscription to a tenant without it

## Rollback

```bash
bunx wrangler deployments list
bunx wrangler rollback [deployment-id]
```

Rollback moves the **code** back. It does not undo a migration — if the bad
deploy migrated the database, roll the code back first, then write a forward
migration to repair the schema.
