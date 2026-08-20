---
name: change-schema
description: Use when adding, changing or removing a database table or column in this repo, or when changing Better Auth / organization plugin behaviour that affects auth tables. Covers src/db/schema.ts, the generated auth-schema.ts, drizzle-kit generate, wrangler migrate, and the D1/SQLite limits that make some migrations fail.
---

# Changing the schema

Two flows, and picking the wrong one is the usual mistake.

## Flow A — your own tables

Everything you define lives in `src/db/schema.ts`.

```bash
# 1. edit src/db/schema.ts
bun run db:generate    # drizzle-kit writes SQL into drizzle/
bun run db:migrate     # wrangler applies it to the LOCAL D1
```

Then `bun run typecheck`. Deploy-time: `bun run db:migrate:prod` applies to the
remote D1 — a separate, deliberate step.

drizzle-kit never connects to D1. It only diffs the schema and emits SQL;
wrangler applies it through the binding. So a "connection" error from
`db:generate` means something else is wrong.

## Flow B — auth, organizations, members, invitations

`src/db/auth-schema.ts` is **generated**. Editing it by hand is always wrong —
the next `auth:generate` silently reverts you.

```bash
# 1. edit the plugin list in BOTH files — they must stay identical:
#      src/lib/auth.ts   (runtime)
#      auth.cli.ts       (what the generator reads)
bun run auth:generate  # rewrites src/db/auth-schema.ts
bun run db:generate
bun run db:migrate
```

The two config files drifting apart is the classic failure: the generator sees
one plugin set, the Worker runs another, and the tables no longer match the
code. If you touch one, touch the other in the same edit.

## Conventions to match

- TypeScript is camelCase, SQL is snake_case, spelled out explicitly:
  `organizationId: text('organization_id')`. There is no automatic casing —
  write both names.
- Tenant-owned tables carry
  `.references(() => organization.id, { onDelete: 'cascade' })`. The panel's
  tenant scoping assumes such a column exists.
- Timestamps are `integer(..., { mode: 'timestamp_ms' })` with a SQL default,
  not JS `Date.now()` — see `subscription` in `src/db/schema.ts`.
- Ids are `text('id').primaryKey()`; the panel stamps `crypto.randomUUID()` on
  insert when you don't supply one.

## SQLite and D1 limits that bite

- **Adding a `NOT NULL` column to a table with rows fails** unless it has a
  default. Either give it one, or do it in two migrations (add nullable →
  backfill → tighten).
- **SQLite cannot alter or drop most constraints in place.** drizzle-kit will
  emit a table-rebuild for those. Read the generated SQL in `drizzle/` before
  applying it — rebuilds move data, and on a table with a foreign key pointing
  at it that is worth a second look.
- **Migrations are forward-only here.** There is no down migration and no
  rollback command. To undo locally, delete `.wrangler/state/v3/d1` and re-run
  `db:migrate` from scratch.
- **D1 caps out at 10 GB and it cannot be raised.** If the change is for logs,
  events or analytics rather than records, that is the signal to read the
  escape rule in [STACK.md](../../../STACK.md) instead of adding the table.

## Inspecting the local database

```bash
bunx wrangler d1 execute starter-kit-db --local --command "SELECT * FROM project"
bunx wrangler d1 execute starter-kit-db --local --command "SELECT sql FROM sqlite_master WHERE name='project'"
```

This is the developer's own workspace data. Read freely; before writing, say
what you are changing and restore it afterwards. A bare
`UPDATE member SET role=…` hits every organization in the file — scope it.

## After the migration

If the new table should have an admin screen, use the `add-resource` skill —
don't hand-write a route and a form.
