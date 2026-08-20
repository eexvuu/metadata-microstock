# Working in this repo

Instructions for coding agents. Humans: [README.md](./README.md) is the tour,
[STACK.md](./STACK.md) is why, [PANEL.md](./PANEL.md) is the admin panel.

This file is the source of truth for agent guidance. `CLAUDE.md` imports it.

## The one-paragraph version

**Stockflow** — a shelf of tools for microstock contributors, running on
Cloudflare's free plan and upgrading with one build flag. TanStack Start
(router + server functions) for the app, Hono for anything with an external
caller, Better Auth with the **admin** plugin for accounts and roles, Drizzle
over D1 for data, and a declarative admin panel where one file per resource
generates a whole CRUD screen. Bun is the toolchain; the runtime is workerd.

**There are no organizations.** Everything belongs to a user: keys, runs,
subscriptions. `user.role` is `user` or `admin`, and the panel exists to serve
the admin screens — nothing else in the product is a CRUD table.

## Before you write code

Ask which of the three this is — it decides the file you open:

| The caller is | Write a | Where |
|---|---|---|
| An admin CRUD screen over one of our tables | **resource** | `src/resources/<name>.ts` |
| Our own React code | **server function** | `src/lib/server/` |
| Anyone else (webhooks, public API, mobile) | **Hono route** | `src/api/` |

Reach for a resource first. If the screen is a table of rows with a form, the
panel already does it and hand-writing it is a regression — see
[PANEL.md](./PANEL.md).

## Hard constraints

**The runtime is workerd, not Bun and not Node.** Bun runs the package manager
and the scripts; nothing under `src/` executes on it. No `Bun.serve`,
`bun:sqlite`, `Bun.file`, `node:fs`, `node:net`, no long-lived module state
that assumes one process.

**Free tier has a 10 ms CPU budget per invocation.** `bun run dev` /
`build:free` produce an SPA for that reason. Don't move rendering work into the
free-mode server path.

**The Worker bundle has a hard 3 MiB gzipped limit on the free plan.** Currently
~895 KiB. A new runtime dependency is a real cost — check it with
`bunx wrangler deploy --dry-run` (prints `Total Upload: … / gzip: …`) and say
the number in your summary. Prefer building on what is already here.

**Never hand-edit generated files:** `src/db/auth-schema.ts`,
`src/routeTree.gen.ts`, `worker-configuration.d.ts`. Regenerate them
(`auth:generate`, the router plugin on dev/build, `cf-typegen`).

## Panel invariants

Break these and the security model is gone:

1. `src/resources/` and `src/lib/panel/define.ts` are **server-only**. The only
   module that may import them is `src/lib/server/panel.ts`. That boundary is
   what keeps Drizzle tables, column allowlists and role rules out of the
   browser bundle.
2. Scope comes from the **session**, never from a request field. Owner-scoped
   resources filter on `ctx.userId`; global ones (`users`, `runs`) carry
   `roles: { view: ['admin'] }` and are re-checked server-side on every call.
   There is no correct reason for a user id or a role to arrive from the
   client.
3. Sort keys, filter keys and writable fields are **allowlisted** from the
   resource's own declarations. Never interpolate a request value into a column
   reference.
4. `meta.can` and `meta.rowActions` decide whether a button renders. They are
   not access control — the server function re-checks the role every time.
5. Handlers (`beforeDelete`, a custom action's `handler`) get ids the engine has
   already re-selected under the resource's own scope. Keep it that way if you
   add another hook.
6. `src/lib/server/admin.ts` is the hand-written half of the same rule: every
   function starts with `requireAdmin()`, and none of them ever selects
   `gemini_key.ciphertext`.

## TypeScript gotchas here

- `verbatimModuleSyntax: true` — type-only imports **must** be
  `import type { X } from '…'`, or the build fails.
- `noUnusedLocals` and `noUnusedParameters` are on. A leftover import is a
  failed typecheck, not a warning.
- Server function return types must be serialisable. `unknown` is rejected at
  the type level by TanStack Start — this is why `PanelValue` is a narrow union
  rather than `unknown`. Don't widen it to make an error go away.
- Both `#/*` and `@/*` map to `./src/*`. Application code uses `#/`; the shadcn
  CLI writes `@/`. Match the file you are in rather than rewriting either.

## Commands

```bash
bun install --network-concurrency 8   # plain `bun install` fails on Windows here
bun run dev                           # free tier (SPA), localhost:3000
bun run dev:paid                      # paid tier (SSR)
bun run typecheck                     # tsc --noEmit
bun run build                         # free-tier production build
bun run db:generate && bun run db:migrate
bunx wrangler deploy --dry-run        # bundle size, no deploy
```

**Definition of done for a code change:** `bun run typecheck` clean, then
`bun run build` succeeds. Both, in that order. If the change touches a screen,
open it in the browser too — the panel's failure modes (an empty dialog, a
button that should not be there) typecheck fine.

## Local data

`bun run db:migrate` applies to a local D1 under `.wrangler/`. Inspect or fix it
with:

```bash
bunx wrangler d1 execute stockflow-db --local --command "SELECT id,email,role FROM user"
```

Making yourself an admin is a deliberate, manual step — there is no UI for the
first one:

```bash
bunx wrangler d1 execute stockflow-db --local --command "UPDATE user SET role='admin' WHERE email='you@example.com'"
```

This is the developer's own data. Read freely; before writing, note what you
changed and put it back. `UPDATE user SET role=…` with no `WHERE` promotes
every account in the database — scope it.

## House style

- Comments explain **why**, not what. If a line needs a comment to say what it
  does, rename something instead.
- Match the density of the file you are in. This codebase comments decisions and
  trade-offs, and leaves obvious code bare.
- shadcn components in `src/components/ui/` are ours to edit — they are copied
  in, not installed. Editing one is normal; forking it into a near-duplicate is
  not.
- The whole brand is the two `--primary` lines in `src/styles.css`. Don't
  hardcode colours anywhere else.
- Adding a dependency needs a reason that survives the bundle-size question.

## Known rough edges

Don't "fix" these by accident; they are documented choices or known debt.

- `createServerFn().inputValidator()` is deprecated in favour of `.validator()`.
  Every server function still uses the old name. Renaming is fine as one
  mechanical change; mixing both idioms is not.
- Billing is webhook-in only, user-scoped, and not surfaced anywhere: every
  tool in the catalog is free today. Checkout creation is deliberately not
  wired up.
- The Durable Object is still called `OrgRoom` (`src/durable/org-room.ts`).
  Nothing routes to it since organizations were removed; rename or delete it
  before the first deploy, not after.
- No test suite. Anything binding-dependent needs
  `@cloudflare/vitest-pool-workers`, not `bun test`.
- Panel limits (read-only joins, no relation picker, offset pagination, no
  per-row rules, actions always visible) are listed at the end of PANEL.md.

---

# The metadata generator

This repo is `starter-kit` with the Stockflow metadata tool built on top. Everything
above still applies to the kit half (auth, panel, D1, resources). The generator
plays by different rules, and they matter.

## Hard constraints

**`src/lib/engine/` is runtime-agnostic.** No `node:*`, no DOM, no Cloudflare
binding, no React. It is pure logic over bytes so the same code runs in a
browser tab, under Bun and in principle on workerd. The two seams are
`FileSource` (`src/lib/sources/`) and `VideoPreprocessor` (`src/lib/video/`) —
new target, new adapter, engine untouched.

**The engine runs in the browser, never on the Worker.** Media is read from the
user's disk and posted straight to `generativelanguage.googleapis.com` with
their own key. Routing it through the Worker would blow the 10 ms free-tier CPU
budget on base64 alone. Do not add a server route that proxies media.

**Keys are held, not free-floating — and they belong to a user.** A Gemini key
may travel to exactly two places: this app's server, where it is stored
AES-256-GCM encrypted (`src/lib/server/crypto.ts`), and Google. Never a log,
never an error message, never a response body other than `getDecryptedKeys` to
its own owner. Every query in `src/lib/server/gemini-keys.ts` filters on the
session's `userId`; `gemini_key` is deliberately NOT organization-scoped,
because a workspace member must not be able to spend a colleague's quota.

**The CSV bytes are a contract.** Adobe needs the UTF-8 BOM, Shutterstock must
not have one; Adobe titles carry no commas or quotes, Shutterstock descriptions
may. `src/lib/engine/csv.ts` reproduces `csv-writer`'s quoting exactly, because
that is what both platforms have accepted for a year. Changing quoting or line
endings is a breaking change to someone's upload queue.

**Progress files are shared with the CLI.** `.metadata-progress.json` and
`.shutterstock-progress.json` keep the shape `gemma/index.js` writes
(`src/lib/engine/progress.ts` maps to and from it), so a run can move between
the terminal and the browser. Do not "clean up" those field names.

**A partial run writes no CSV and renames nothing.** Half a CSV is worse than
none, and renaming before the run finishes desyncs the progress file from disk.

**The CSV is written by `exportRun`, not by the run.** The browser passes
`deferExport: true`, edits the rows on the review screen and calls `exportRun`
afterwards; the CLI path leaves the flag off and gets the old behaviour. A
source with `writable: false` (loose dropped files) gets the CSV text back for
download and is never renamed or asked for a progress file.

## Where things go

| Change | File |
|---|---|
| A new stock platform | `src/lib/engine/profiles/<name>.ts` + the `PROFILES` map in `use-generator.ts` |
| A new place files can live | `src/lib/sources/<name>.ts` implementing `FileSource` |
| The review screen, the drop zone | `src/components/generator/` |
| A new way to strip audio | `src/lib/video/` implementing `VideoPreprocessor` |
| Prompt wording, keyword rules | the profile — never the runner |
| Retry, rate limit, resume, worker pool | `src/lib/engine/runner.ts` and `keys.ts` |

## The model is not a setting

`PRIMARY_MODEL` (Gemma) and `FALLBACK_MODEL` (`gemini-flash-latest`) live in
`src/lib/generator/settings.ts` and are never shown to the user — nobody picks a
model to get keywords. The fallback fires in exactly one place: `runner.ts`,
when every key has failed on the primary model for one file, before an
`errorFallback` row would be written. A 429 never reaches it — quota is
rotation's job (`keys.ts`), and quota is per-model anyway.

Worker count follows the keys: `workersFor(keyCount)`, capped at 8. One worker
per key is what makes rotation visible on the Generate screen.

## Gemma's three quirks

These are ported from the CLI and are not optional. Removing any one of them
breaks real runs:

1. **Audio strip.** Gemma returns `400: Audio input modality is not enabled` for
   any media with an audio track. Browser mode remuxes with mp4box (MP4/M4V/MOV
   only); local mode uses `ffmpeg -an -c:v copy`.
2. **Chain-of-thought JSON.** Gemma writes reasoning around the JSON no matter
   what the prompt demands, and the reasoning contains its own brace blocks.
   `parse.ts` walks candidates and rejects schema echoes (`"string — …"`) and
   placeholders.
3. **Transient 429s.** A 429 is usually the per-minute limit, not the daily one.
   Cool the key for 60 s; only five consecutive 429s with no success in between
   mean the day's quota is gone.

## Accounts and keys

The app is signed-in only. `/` is marketing; `/dashboard` is the tool catalog,
the metadata tool lives at `/dashboard/generate`, keys at `/dashboard/keys` and
run history at `/dashboard/history`. None of them is a panel resource — the
panel serves the admin screens (`/dashboard/admin`, `/dashboard/users`,
`/dashboard/runs`):

- `gemini_key` is scoped to `user.id`. Per-user on purpose (see the constraint
  above), which is why it is a plain route with server functions rather than a
  `defineResource`. No admin screen ever selects its ciphertext.
- `generation_run` is history, not billing input. Read the comment at the top of
  `src/lib/server/runs.ts` before building anything that depends on the numbers.

`ENCRYPTION_SECRET` must exist or every key operation throws at runtime — it is
in `.dev.vars` for dev and `wrangler secret put` for production. It cannot be
rotated in place.

## Testing it

`bun run typecheck` and `bun run build` do not prove the engine works — the
model's output is the thing under test. `test/e2e-local.ts` runs a real folder
through the real API, bypassing accounts entirely (it reads keys from a file),
so it stays the fastest way to test a prompt or parser change:

```bash
bun test/e2e-local.ts <folder> <gemini-key.txt> [platform]
```

It reads the folder with `test/node-directory.ts` — a `FileSource` over
`node:fs` that lives in `test/` precisely because `node:*` has no business in
`src/`.

Use a throwaway copy of a couple of files: the run writes a CSV and a progress
file into the folder it is given.

The signed-in path (signup -> add key -> run -> `generation_run` row) needs a
real account, so it is a human step. Ask rather than creating accounts.
