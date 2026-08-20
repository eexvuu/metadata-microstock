# Stockflow

A shelf of tools for microstock contributors. One account, your own Gemini API
keys, and a tool for each part of the upload routine.

**Metadata** is the first tool and it is free: point it at a folder of images
and videos and it writes the Adobe Stock or Shutterstock bulk-upload CSV back
into that same folder using the free Gemma model. It is the web version of the
`gemma` CLI.

Bring-your-own-key, so running the platform costs the operator nothing per
user.

Built on [eexvuu/starter-kit](https://github.com/eexvuu/starter-kit) — the
Cloudflare Workers stack, UI kit, auth and panel are all still there and
documented in [STACK.md](./STACK.md) and [PANEL.md](./PANEL.md). This README
covers what was added on top.

## The one thing to understand

**The engine runs in the browser tab, not on a server.** Media never gets
uploaded anywhere: the tab reads the folder off your disk, calls
`generativelanguage.googleapis.com` directly with your own API keys, and writes
the CSV back next to your files.

That is not a shortcut, it is the only design that fits. Routing 10 MB videos
through a Worker would blow the free plan's 10 ms CPU budget on base64 alone,
and it would be a pointless double hop to a service the browser can already
reach — the Gemini API answers CORS preflight for `x-goog-api-key`.

The consequence for keys: they are stored on the account (AES-256-GCM in D1, see
`src/lib/server/crypto.ts`) and decrypted **only for their owner, only when a
run starts**, then sent to that user's own browser because that is what actually
calls Google. They go nowhere else — not to a log, not to an error message, not
to any third party. Nobody else can see or spend them: `gemini_key` is scoped
to `user.id`, and the admin screens count keys without ever selecting the
ciphertext.

## How the media reaches the tool

Everything happens in the tab. Two ways in, and the difference is what the tool
can give back:

|  | A dropped folder | Dropped files |
|---|---|---|
| How | drag a folder, or **Choose folder** | drag files, or **Choose files** |
| Browsers | Chrome, Edge (File System Access API) | any |
| The CSV | written next to your media | downloaded |
| Interrupted run | resumes from the progress file | starts over |
| `[bracket]` rename | yes | no |

There is no companion server any more: the app is a hosted page, and both paths
above work on a deployed HTTPS origin with nothing installed.

Gemma rejects any media carrying an audio track (`400: Audio input modality is
not enabled`), which is why the audio strip exists at all. Browser mode remuxes
with mp4box — a stream copy, no re-encode, ~80 ms for a 10 MB clip. MP4, M4V and
MOV are covered. AVI, MKV, WEBM, WMV and FLV have no ISOBMFF structure to walk,
so they are skipped at scan time and the picker says how many were dropped;
convert them to MP4 first.

```bash
bun install --network-concurrency 8
cp .dev.vars.example .dev.vars   # then set BETTER_AUTH_SECRET and ENCRYPTION_SECRET
bun run db:migrate               # local D1: auth tables + gemini_key + generation_run
bun run dev                      # http://localhost:3000

```

Sign up at `/signup`, add your keys under **API keys**, then open **Metadata**
from the catalog. To reach the admin screens, promote your account once:

```bash
bunx wrangler d1 execute stockflow-db --local --command "UPDATE user SET role='admin' WHERE email='you@example.com'"
```

## What it does

- **Adobe Stock** — `Filename,Title,Keywords,Category`, UTF-8 **with** BOM, 49
  keywords, numeric category 1–21.
- **Shutterstock** — `Filename,Description,Keywords,Categories,Editorial,Mature
  content,illustration`, **no** BOM, 50 keywords, category *names* normalised
  from whatever the model answered (aliases, ids, messy casing → the canonical
  name, `Miscellaneous` as the floor).
- **Multi-key load balancing** — one worker per key, 15 RPM each, with keys
  beyond the worker cap held in reserve and swapped in when an active key dies.
- **429 handling** — a rate-limit 429 cools a key down for 60 s instead of
  killing it; only five in a row with no success in between marks it out of
  quota for the day.
- **Chain-of-thought parsing** — Gemma writes paragraphs of reasoning around its
  JSON no matter what the prompt says, so the parser digs the object out while
  skipping schema echoes and `"..."` placeholders.
- **Resume** — progress is appended to `.metadata-progress.json` /
  `.shutterstock-progress.json` **in the folder itself**, in exactly the shape
  the CLI writes. A run started in the terminal finishes in the browser and vice
  versa. A partial run writes no CSV at all — re-run to continue.
- **Bracket keywords** — `[low taper fade]-clip.mp4` forces "low taper fade"
  into the title/description and the keyword list, and the brackets come off the
  filename before export.
- **Vector mode** — analyses the paired `.png`/`.jpg` but writes `.ai`/`.eps` in
  the Filename column, and warns when the vector counterpart is not in the
  folder.

## Where the code lives

```
src/lib/engine/          the port of gemma/index.js — no DOM, no node:*, no bindings
  keys.ts                key rotation, 429 cooldown, RPM pacing
  prompt via profiles/   adobe.ts and shutterstock.ts: prompt + parse + CSV shape
  parse.ts               chain-of-thought JSON extraction, keyword repair
  runner.ts              the worker pool, resume, rename — and exportRun()
src/lib/sources/         where the files are: browser-directory.ts | dropped-files.ts
src/lib/video/           how audio is stripped: mp4box-strip.ts | passthrough
src/lib/generator/       React glue: run preferences in localStorage, the run hook
src/lib/server/          crypto.ts (AES-GCM), gemini-keys.ts, runs.ts — server functions
src/routes/tools/        metadata.tsx — the tool, on its own full-width page
src/routes/dashboard/    the catalog, keys, history and the admin screens
test/e2e-local.ts        hits the real API against a folder on disk; run by hand
```

Adding a third platform is one file in `src/lib/engine/profiles/` plus one entry
in the `PROFILES` map in `use-generator.ts`.

## Deploying

```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put ENCRYPTION_SECRET   # without it, every key operation fails at runtime
bun run db:migrate:prod
bun run deploy
```

`wrangler.jsonc` still ships placeholder D1 and KV ids — fill
in real ones before the first deploy.

**ENCRYPTION_SECRET is not rotatable in place.** Change it and every stored key
becomes undecryptable; the app skips those rows rather than failing a run, and
users have to re-add their keys.

## Known limits

- Firefox and Safari have no File System Access API, so **dropping a folder**
  is Chrome and Edge only. Everywhere else the tool falls back to dropped
  files: same metadata, but the CSV is downloaded and an interrupted run cannot
  resume.
- Run history (`generation_run`) is **reported by the browser that did the
  work**, because that is where the engine runs. It is honest history for the
  person looking at their own dashboard; it is not a number you could bill or
  rate-limit against without proxying or attesting the runs first.
- Billing is not wired up. Every account is free and uses its own Gemini quota.
- A big folder keeps every result row in memory for the results table; the
  progress file on disk is the durable copy.
