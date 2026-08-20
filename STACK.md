# Stack decisions

Why this kit is put together the way it is. Read this before swapping
anything out — most of these choices have a specific constraint behind them.

Researched and verified August 2026.

## The stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Cloudflare Workers (workerd) | Static assets + SSR + every binding in one `wrangler deploy` |
| Toolchain | Bun | Package manager and script runner only — see "Bun" below |
| Framework | TanStack Start | Typed + runtime-validated search params, which is the dashboard pattern this kit is built around |
| External HTTP | Hono | Webhooks, public API, auth callbacks. Mature middleware ecosystem |
| ORM | Drizzle | Small bundle (there is a hard Worker size limit) and the schema ports to Postgres |
| Database | D1 | Zero config, free tier. **Hard 10 GB ceiling** — see the escape rule |
| Auth | Better Auth | Self-hosted, and the `organization` plugin gives orgs/members/invites/RBAC |
| Payments | Polar | Merchant of record — it is liable for VAT/sales tax, not you |
| Object storage | R2 | S3-compatible, zero egress fees |
| Cache / counters | Workers KV | |
| Realtime, per-tenant state | Durable Objects (SQLite backend) | The only primitive with a stable identity |
| Background work | Queues, Workflows | |
| Email | console / Resend / Cloudflare Email Service | The one place free and paid genuinely diverge |
| UI | shadcn/ui (Radix, `radix-nova`) + Tailwind v4 | Components are copied into `src/components/ui/`, so they are yours to edit — no library upgrade can restyle your app |

## The two tiers

`spa.enabled` is a **build-time** Vite flag, so free and paid are two
different builds, not a runtime switch.

| | `bun run build:free` | `bun run build:paid` |
|---|---|---|
| Rendering | SPA — prerendered shell, no per-request React | SSR |
| Why | Free plan allows **10 ms CPU per invocation**. React SSR is CPU-heavy; Cloudflare's own docs put heavier workloads at 10–20 ms | Paid raises CPU to 30 s |
| Email | Resend (3,000/mo, 100/day cap) | Cloudflare Email Service |
| Cost | $0 | $5/mo |

Moving free → paid is cheap: same router, same Hono routes, same DB, auth and
billing. Only the render mode and the email provider change.

### What actually forces the $5

1. You want SSR (10 ms CPU will bite)
2. You want to send transactional email **from Cloudflare** to real users —
   "sending to arbitrary recipients requires the Workers Paid plan". On free,
   Cloudflare Email Service can only reach addresses verified in your account
3. The Worker bundle passes **3 MiB gzipped** (paid raises it to 10 MiB).
   This kit currently ships at ~799 KiB gzipped — about 26% of the budget
4. Traffic passes 100,000 requests/day
5. You need Containers (paid-gated)
6. Free plan's 3-day log retention is too short to debug production

### Verified free-plan allowances

Workers 100k req/day · static assets free and unlimited · D1 5 GB + 5M row
reads/day + 100k row writes/day · R2 10 GB-month + 1M Class A + 10M Class B,
free egress · KV 100k reads/day + 1k writes/day + 1 GB · Durable Objects
(SQLite only) 100k req/day · Queues 10k ops/day · Workflows 100k
executions/day, 100 concurrent, 3-day state retention · Cron 5 per account ·
Workers Logs 200k/day, 3-day retention.

Queues, Durable Objects, Workflows and Cron are all on the free plan. The
key-value DO backend and Vectorize are the notable paid-only items — which is
why `wrangler.jsonc` uses `new_sqlite_classes`, not `new_classes`.

## Bun

Bun is the toolchain, **not** the runtime. Workers runs workerd (V8 isolates)
and does not support Bun as a runtime. Anything under `src/` must run on
workerd — no `Bun.serve`, no `bun:sqlite`, no `Bun.file`.

Hono is what keeps the door open: it runs identically on Workers and on Bun,
so if you ever leave Cloudflare the API layer moves without a rewrite.

`bun test` does not simulate workerd. Pure unit tests are fine; anything that
touches a binding needs `vitest` + `@cloudflare/vitest-pool-workers`.

**Windows note:** plain `bun install` fails intermittently here with spurious
"no version matching" errors. `bun install --network-concurrency 8` is
reliable.

## D1 vs Postgres

D1 is the default because this is a starter kit with small per-tenant data,
and Drizzle absorbs most of a later move.

**Escape rule — switch to Neon Postgres + Hyperdrive when any of these is
true:**

- you expect to pass 10 GB (the cap **cannot be raised**)
- queries are heavily relational, with joins across large tables
- you are storing logs, events or analytics rather than records

Switching means replacing `src/db/index.ts` with `drizzle-orm/postgres-js`
over Hyperdrive, changing `provider: 'sqlite'` to `'pg'` in `src/lib/auth.ts`
and `auth.cli.ts`, and regenerating migrations. Queries and schema stay.

If you already know the answer is Postgres, do it now rather than via D1.

## Server function, Hono route, or resource?

- A CRUD screen over one of your tables → a **resource** in `src/resources/`.
  The panel generates the list, the form and the queries. See
  [PANEL.md](./PANEL.md)
- Called by our own React code → **server function**. Typed end to end, no URL
  contract to maintain.
- Called by anyone else → **Hono route**. Raw body for signature
  verification, a stable versioned URL, real status codes.

All three are typed; nothing is lost by splitting them this way.

### Why the panel is server-driven

Resource definitions hold Drizzle column references, tenant scoping and role
rules, so they must not ship to the browser. Rather than splitting each
resource in two, the client is handed **JSON metadata** and renders from it —
which is also why adding resources costs the client bundle nothing. Custom
actions travel the same way: the browser learns a name and a label, and the
handler stays on the server.

The trade is that a resource cannot pass a render function to a column, or
decide per row whether an action applies; formatting is declared as a `kind`.
Filament makes the same trade for the same reason.

The ⌘K palette is built on the Dialog the kit already ships rather than on
`cmdk` — it is a filtered list and two arrow keys, and there is a hard Worker
size limit worth spending elsewhere.

## Known limits of this kit

- Better Auth pulls in several Kysely dialects, which is most of the bundle.
  Fine today at 22% of the free budget, worth watching
- The billing flow is webhook-in only. Checkout creation is not wired up —
  add it when you have Polar products to sell
- The queue's `provision-organization` job uses `EMAIL_FROM` as the owner
  address rather than looking up the real owner. Fix before using it
- The panel uses offset pagination and `LIKE %term%` search — both fine at
  starter-kit scale, neither indexable, and global search runs one such query
  per resource. Swap to keyset + FTS if a resource grows past tens of thousands
  of rows. Panel joins are read-only, and there is no relation picker yet
- Sidebar badges are opt-in per resource because each one is a COUNT on every
  dashboard load, and D1's free tier bills row reads
- No test suite yet. Add `@cloudflare/vitest-pool-workers` for anything
  binding-dependent
