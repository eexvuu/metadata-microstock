# Working in this repo

Instructions for coding agents. Humans: [README.md](./README.md) is the tour,
[STACK.md](./STACK.md) is why, [PANEL.md](./PANEL.md) is the admin panel.

This file is the source of truth for agent guidance. `CLAUDE.md` imports it.

## The one-paragraph version

**Stockflow** — a shelf of tools for microstock contributors, running as one
Node process on one Ubuntu box behind nginx. TanStack Start (router + server
functions) for the app, Hono for anything with an external caller, Better Auth
with the **admin** plugin for accounts and roles, Drizzle over SQLite for data,
and a declarative admin panel where one file per resource generates a whole
CRUD screen. Bun is the local toolchain; the server runs plain Node.

**This branch left Cloudflare.** `master` is still the workerd version and is
where to look if you need to know what something used to be. Everything below
that mentions a Worker, D1, KV, a Queue, a Durable Object or a 10 ms budget was
true there and is not true here.

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

**The runtime is Node, and there is one process.** Bun runs the package
manager, the scripts and the build; the server runs `node dist/server/server.js`.
Module-level state is now legitimate — it lives as long as the process — but it
is also now a leak if you let it grow, and it is gone on every deploy, because
a deploy restarts the unit.

**There is no CPU budget and no bundle limit.** The SPA/SSR fork went away with
the Worker: there is one build and it server-renders. A new dependency still
wants a reason, but "it costs 40 KiB gzipped" is no longer that reason.

**The box is shared.** Two cores and 3.7 GB, alongside MySQL, a gunicorn app and
a dozen other nginx vhosts. `stockflow.service` caps the process at 768 MB.
Work that would pin a core belongs in the browser, where the engine already is,
or in the nightly job.

**Three seams keep `src/` from caring where it runs.** `src/lib/runtime/env.ts`
is configuration, `src/db/client.ts` is the database, `src/lib/runtime/jobs.ts`
is background work. Reach for `process.env` or a driver anywhere else and the
next migration has to find it.

**Never hand-edit generated files:** `src/db/auth-schema.ts` and
`src/routeTree.gen.ts`. Regenerate them (`auth:generate`, the router plugin on
dev/build).

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
bun run dev                           # localhost:3000
bun run typecheck                     # tsc --noEmit
bun run build                         # production build into dist/
bun run start                         # serve dist/ the way systemd does
bun run cron                          # the nightly job, once, now
bun run db:generate && bun run db:migrate
./deploy/deploy.sh root@43.157.210.19 # build here, ship, migrate, restart
```

`DATABASE_URL` has to be set for anything that touches the database, including
`db:migrate`. See `.env.example`; `deploy/README.md` is the server runbook.

**Definition of done for a code change:** `bun run typecheck` clean, then
`bun run build` succeeds, then `bun run start` boots and answers
`/api/health`. The third step is new and it earns its place: the build
externalises nothing, so an import that only breaks under Node breaks at
startup, not at build time. If the change touches a screen,
open it in the browser too — the panel's failure modes (an empty dialog, a
button that should not be there) typecheck fine.

## Local data

`bun run db:migrate` applies to whatever `DATABASE_URL` points at — by default
`data/stockflow.db`, which is gitignored. Inspect or fix it with any SQLite
client:

```bash
sqlite3 data/stockflow.db "SELECT id,email,role FROM user"
```

Making yourself an admin is a deliberate, manual step — there is no UI for the
first one:

```bash
sqlite3 data/stockflow.db "UPDATE user SET role='admin' WHERE email='you@example.com'"
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
- No test suite. There are no bindings to fake any more, so plain `bun test`
  or vitest would now work — that excuse left with the Worker.
- The Node build is the only one that is typechecked. `tsc` resolves
  `src/db/client.ts`, which is the libsql one, so the types and the runtime
  agree; there is no second target to drift from.
- Panel limits (read-only joins, no relation picker, offset pagination, no
  per-row rules, actions always visible) are listed at the end of PANEL.md.

---

# The metadata generator

This repo is `starter-kit` with the Stockflow metadata tool built on top. Everything
above still applies to the kit half (auth, panel, database, resources). The generator
plays by different rules, and they matter.

## Hard constraints

**`src/lib/engine/` is runtime-agnostic.** No `node:*`, no DOM, no Cloudflare
binding, no React. It is pure logic over bytes so the same code runs in a
browser tab, under Bun and under Node. The two seams are
`FileSource` (`src/lib/sources/`) and the two preprocessors —
`VideoPreprocessor` (`src/lib/video/`) and `ImagePreprocessor`
(`src/lib/image/`) — new target, new adapter, engine untouched.

**The engine runs in the browser, never on the server.** Media is read from the
user's disk and posted straight to `generativelanguage.googleapis.com` with
their own key. The 10 ms budget that originally forced this is gone, and the
reason is now better rather than weaker: two shared cores would fall over long
before a hundred contributors did, and the media never has to exist on a disk
we own. Do not add a server route that proxies media.

**Keys are held, not free-floating — and they belong to a user.** A Gemini key
may travel to exactly two places: this app's server, where it is stored
AES-256-GCM encrypted (`src/lib/server/crypto.ts`), and Google. Never a log,
never an error message, never a response body other than the two functions that
exist to return one: `getDecryptedKeys` to its own owner, and `revealUserKey`
to an admin looking at the account that owns it.

`revealUserKey` is a deliberate 2026-08-22 decision, taken so support can
answer "the app does not work for me" — almost always a dead key — without
asking anyone to paste a credential into a chat. It writes a `key.revealed`
audit row **before** it answers, and the copy in the keys dialog tells users an
admin can do it. Those two things are what make it defensible; remove either and
it is just a backdoor. Nothing else in the admin surface selects
`gemini_key.ciphertext`.

Every query in `src/lib/server/gemini-keys.ts` filters on the session's
`userId`; `gemini_key` is deliberately NOT organization-scoped,
because a workspace member must not be able to spend a colleague's quota.

**A saved result is readable by an admin, on the same terms.** `revealRunRows`
(2026-08-23) is the run equivalent of `revealUserKey`, and it exists for the
same reason: "the titles come out wrong" cannot be answered without seeing the
titles, and asking a contributor to paste their CSV into a chat is worse for
them than an admin opening a screen that records the opening. It is built to
the same three rules — it is the only path to `run_rows` outside the owner's
own session, it writes a `run.revealed` audit row **before** it answers, and
`history.resultsNote` in both locales tells users an admin can do it. Two
deliberate limits keep it support rather than surveillance: it is **read-only**
(`updateRunRows` stays session-scoped, because fixing somebody's metadata for
them is editing their work), and it refuses an expired result even though the
row survives until the nightly prune reaches it — seven days is what the
contributor was told, and an admin does not get a longer window than the owner.
The loader (`getRunForAdmin`) deliberately carries no rows, so an audit entry
means somebody clicked, not that a page rendered.

**The CSV bytes are a contract.** Adobe needs the UTF-8 BOM, Shutterstock must
not have one; Adobe titles carry no commas or quotes, Shutterstock descriptions
may. `src/lib/engine/csv.ts` reproduces `csv-writer`'s quoting exactly, because
that is what both platforms have accepted for a year. Changing quoting or line
endings is a breaking change to someone's upload queue.

**Progress files are shared with the CLI.** `.metadata-progress.json` and
`.shutterstock-progress.json` keep the shape `gemma/index.js` writes
(`src/lib/engine/progress.ts` maps to and from it), so a run can move between
the terminal and the browser. Do not "clean up" those field names.

**Vector art is rasterised in the tab, never sent as-is.** Gemini refuses
`image/svg+xml` and PDFs, so `src/lib/image/` renders them first: SVG through a
canvas, `.ai`/`.pdf` through pdf.js — an `.ai` saved with "Create PDF Compatible
File" (the default since Illustrator 9) *is* a PDF. White is painted under both,
because JPEG has no alpha. pdf.js is behind a dynamic import and one shared
worker, so a run of photographs never downloads it.

**Oversized photographs are downscaled in the tab too.** `src/lib/image/raster-downscale.ts`
is the last step of the browser chain and the only one that touches a format
Gemini already reads. A 65 MB JPEG is not a compatibility problem, it is a cost
one: `inline_data` means it is base64 first (+33%), and the API bills images in
768x768 tiles, so an 8000px original buys nothing a 2048px one does not. Over
2048px on either side or over 4 MB, the file is decoded at reduced size
(`createImageBitmap` resize options, so a 100 MP photo never becomes 400 MB of
RGBA) and re-encoded to the same 2048px JPEG the vector steps produce. Anything
this browser cannot decode is sent untouched rather than failed — unlike the two
steps above it, this one is an optimisation, not a conversion the API requires.

**Mastering video codecs are refused rather than uploaded.** ProRes, DNxHD and
uncompressed are edit-suite intermediates: a seven-second 4K ProRes clip is
68 MB, and the same seven seconds as H.264 is 65 KB. `SENDABLE_CODECS` in
`src/lib/video/mp4box-strip.ts` is an allowlist of what can be remuxed
(avc1/avc3, hvc1/hev1, av01, vp08/vp09) and therefore of what can be sent, and
anything else gets a message naming the codec and the fix. Two things measured
on a real 68 MB ProRes .mov, 2026-08-25, that decide the shape of this: Chrome
on Windows has no ProRes decoder at all (`canPlayType` empty,
`MediaSource.isTypeSupported` false, a `<video>` that never reaches readyState
1), so a tab cannot transcode it, sample frames from it or even draw its
thumbnail; and mp4box does not classify the track as video, so it arrives in
`otherTracks` as `codec: "apcn"` — the check has to look there, or the
contributor gets "no video track found" for a file that is perfectly fine.

The refusal is an `UnsendableMediaError` (`src/lib/engine/media.ts`), which the
runner treats as terminal: no requeue, no walk through the other keys, no rung
down. Everything else it catches may be transient; this one is the same answer
eight keys later, and the loop would only buy eight re-reads of a 68 MB file.

**Video is still sent inline, and that has not been solved.** A large H.264 clip
goes up as base64 in one `generateContent` call like everything else, so the
request-size ceiling is still there for anyone with a genuinely big finished
file. The Files API would lift it without making the upload any faster, and it
would need a CORS answer nobody has checked — the browser-only architecture is
not negotiable for media. Sampling frames and sending those instead is the
cheaper idea, and it changes what the model sees, so it is a product decision
rather than a refactor.

**EPS stays unsupported, deliberately.** It is real PostScript: the only browser
answers are a multi-megabyte ghostscript build or the low-resolution TIFF
preview Illustrator sometimes embeds, and "works for some files" is worse than
"export a JPEG". Adobe and Shutterstock can preview EPS because they rasterise
it on their own servers.

**The filename in the CSV is the contributor's, not the engine's.** The web
path always runs with `vectorExtension: undefined`, so rows carry the real
filename; the review screen edits `row.filename` per row, or swaps the
extension on every row at once. `outputFilename()` and `vectorExtension` stay in
the engine for the CLI.

**The app never renames a file.** `renameBrackets` stays in `RunOptions` for the
CLI, but the web path always passes `false`: `[keywords]` are still forced into
the title and the keyword list, and the file on disk keeps its name so the CSV
can never point at something that is not there.

**A partial run writes no CSV and renames nothing.** Half a CSV is worse than
none, and renaming before the run finishes desyncs the progress file from disk.
An aborted file counts as remaining: `runner.ts` pushes the in-flight task back
onto the queue before it unwinds, because a Stop pressed while the last files
are in flight would otherwise leave an empty queue — which reads as a finished
run, and a finished run exports a CSV missing exactly those files and deletes
the progress file that could have recovered them.

**Closing the tab stops a run, and that is the deal.** The engine is in the
browser, so nothing can keep calling the model once the tab is gone. What is
guaranteed instead is that stopping costs one file, never a run — three things
hold it up, and all three are load-bearing:

1. `.metadata-progress.json` in the folder, written after every file, is what a
   second run reads to skip what is already done (2026-08-23).
2. `pending-run` in IndexedDB (`src/lib/generator/resume.ts`) keeps the
   directory *handle*, so the way back to the folder is a button rather than a
   memory test. The handle comes back revoked and `requestPermission` only
   answers inside a gesture — which is why resuming is a click and never
   something the page does on load.
3. `checkpointRun` + `saveRunRows` after the first file and then every
   `CHECKPOINT_EVERY`, so History shows a run that died with its tab as
   `partial` with honest counts and an openable result. Before this, such a run
   sat at `running` with zero files forever. The first file goes up alone on
   purpose: a run that dies at file three is still a run that happened.

A resumed run reuses its `generation_run` row rather than starting a second
one, and the runner's `resumed` event carries the recovered rows to anything
keeping a tally — without it a checkpoint would post the second half of a run
as though it were the whole of it.

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
| A new format the model cannot read | `src/lib/image/` implementing `ImagePreprocessor` |
| Prompt wording, keyword rules | the profile — never the runner |
| Retry, rate limit, resume, worker pool | `src/lib/engine/runner.ts` and `keys.ts` |

## The model is not a setting

`MODEL_LADDER` lives in `src/lib/generator/settings.ts` and is never shown to
the user — nobody picks a model to get keywords. Two rungs, fast quota first:

| Rung | Model | RPM | Per file | Notes |
|---|---|---|---|---|
| 0 | `gemini-3.5-flash-lite` | 15 | ~3.8 s | clean JSON, takes video with its audio track |
| 1 | `gemma-4-26b-a4b-it` | 30 | ~6 s | the big daily quota; refuses audio |

Every number there was measured against the free tier on 2026-08-23
(`test/model-bench.ts`), not read off a docs page — Google's rate-limit page
stopped publishing per-model figures and points at AI Studio. The RPMs come
from the 429 bodies themselves. Daily quotas are deliberately **not** encoded
anywhere: they cannot be measured without spending somebody's day, and the API
says which quota was hit in `details[].violations[].quotaId` when it matters.

The rungs are pinned, not `-latest`. `gemini-flash-lite-latest` resolved to
3.5-flash-lite the day this was measured and will quietly become something
else; a model change should be a commit somebody made on purpose.

**Quota is per project per model, so a key is never simply dead.** Each key
walks down the ladder on its own (`KeyPool.demote`): a 429 whose `quotaId`
matches `PerDay` — or five consecutive 429s, the backstop for a body that did
not say — moves that key to the next rung and it keeps working. Only a key that
has spent every rung is `quotaExceeded`. Per-minute 429s still just cool the
key down, now for the `retryDelay` Google sent rather than a flat minute, and
the clock is per rung because the rate limit is.

One thing did not change: a file that every key refused still gets one try a
rung down before an `errorFallback` row is written (`tryNextRung`). That is
about the file, not the quota — the key keeps its rung.

Worker count follows the keys: `workersFor(keyCount, settings.maxWorkers)`.
One worker per key is what makes rotation visible on the Generate screen, and
it is why the ceiling is the number of keys in play — a worker without a key of
its own has nothing to spend. `AUTO_WORKERS` (8) is what `maxWorkers: 0` picks,
and it is a default, not a rule: it is roughly where a home connection stops
being helped by more parallel uploads and where a folder of 4K video stops
fitting in a tab. Thirty keys and a folder of JPEGs is the case it was wrong
for, so the Generate screen lets somebody say a number up to `MAX_WORKERS`
(32) — past which the limit is the tab's memory, since every in-flight file
holds its bytes and its base64 copy at once.

## Gemma's three quirks

These are ported from the CLI and are not optional. Removing any one of them
breaks real runs:

These are the *bottom* rung's quirks now — the ladder means most files never
reach Gemma at all — but every one still fires the moment a key demotes.

1. **Audio strip.** Gemma returns `400: Audio input modality is not enabled` for
   any media with an audio track. The tab remuxes with mp4box, which only walks
   ISOBMFF — so `canStrip()` decides, and both file sources skip AVI, MKV, WEBM,
   WMV and FLV at scan time rather than uploading a file Gemma will refuse.
   Flash-lite has no such limit: it read a 4.6 MB MP4 with its audio intact in
   16.6 s. Lifting the scan-time skip for the fast rung would be real user
   value; it is not done, because the scan happens before any key has a rung.
2. **Chain-of-thought JSON.** Gemma writes reasoning around the JSON no matter
   what the *prompt* demands, and the reasoning contains its own brace blocks.
   `parse.ts` walks candidates and rejects schema echoes (`"string — …"`) and
   placeholders. What the prompt cannot do, `generationConfig.responseSchema`
   can: measured 2026-08-23 on the same three images, Gemma went from 86.5 s
   and 10,000 characters of reasoning per file to 6 s and 535 characters, and
   `extracted` stopped firing. Every profile therefore carries a
   `responseSchema`, and the descriptions inside it are load-bearing — a schema
   with bare types costs keywords (33 against 42). `parse.ts` stays exactly as
   it is: it is what catches a model that refuses the schema, and the runner
   remembers that refusal per model rather than per file.
3. **Transient 429s.** A 429 is usually the per-minute limit, not the daily one.
   Cool the key down; only a `PerDay` quota id, or five consecutive 429s with no
   success in between, mean the day's quota is gone — and that now means a rung
   down rather than a key out.

## Accounts and keys

The app is signed-in only. `/` is marketing; `/dashboard` is the tool catalog,
the metadata tool lives at `/tools/metadata` and run history at
`/dashboard/history`. Keys have no screen of their own: only this tool needs
one, so `KeysDialog` lives inside it. None of these is a panel resource — the
panel serves the admin screens (`/dashboard/admin`, `/dashboard/users`,
`/dashboard/runs`):

- `gemini_key` is scoped to `user.id`. Per-user on purpose (see the constraint
  above), which is why it is a plain route with server functions rather than a
  `defineResource`. No admin screen ever selects its ciphertext.
- `generation_run` is history, not billing input. Read the comment at the top of
  `src/lib/server/runs.ts` before building anything that depends on the numbers.

**Sign-in is Google-only.** `emailAndPassword` is off and there is no signup
form: a first Google sign-in creates the account, so `/login` and `/signup` are
the same component. `accountLinking` is on with Google trusted, which lets an
account that predates the switch keep its keys, runs and role when its owner
signs in with the same address — **but only if that account's `emailVerified`
is already true.** With it false the callback ends at
`?error=account_not_linked`; this was measured both ways, not assumed. Since
the app ran with `requireEmailVerification: false`, every older account needs
the one-off flip in deploy/README.md. `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are required — auth throws at construction without them.

`ENCRYPTION_SECRET` must exist or every key operation throws at runtime — it is
in `.env.local` for dev and `/etc/stockflow/stockflow.env` in production. It
cannot be rotated in place: a new value orphans every stored key.

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
