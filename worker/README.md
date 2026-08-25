# The vectorize worker

Stockflow does not vectorize anything. It holds the queue, the tokens and the
bucket; a worker on a machine that already has the [`vectorizer`][repo] repo
working pulls the files down, runs them through `vectorize.js` unchanged, and
puts the results back.

That split is not a preference. The web backend is a real Chromium signed in to
vectorizer.ai plus a Whisper-based CAPTCHA solver — Playwright, ~130 MB of
browser, and work that occasionally needs a human to look at a picture of a
traffic light. `stockflow.service` caps the app at 768 MB on a box with two
shared cores, MySQL, a gunicorn app and a dozen other vhosts. None of that fits,
and none of it should.

[repo]: ../../microstock/vector/vectorizer

## Setting it up

On the **server**, in `/etc/stockflow/stockflow.env`:

```bash
VECTOR_WORKER_SECRET=$(openssl rand -base64 48)   # this is the whole gate
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=stockflow-vector
```

Then `systemctl restart stockflow`. Until the secret is set the worker endpoints
answer **503**, not 401 — the worker is not wrong, the box is not ready.

On the **worker machine**, copy `vector-worker.mjs` next to `vectorize.js` (or
leave it here and pass `--repo`), and check the vectorizer itself works first:

```bash
cd D:/microstock/vector/vectorizer
node scripts/check-login.js       # verifies the login chain, spends nothing
node vectorize.js --limit 1       # one image end to end
```

If that does not work, this will not either — and it will burn credits finding
out. Then:

```bash
STOCKFLOW_URL=https://tools.eexvuu.eu.org \
STOCKFLOW_WORKER_SECRET=… \
node vector-worker.mjs --repo D:/microstock/vector/vectorizer
```

| Flag | |
|---|---|
| `--repo DIR` | where `vectorize.js` lives. Default: cwd |
| `--name NAME` | what shows up as the lease holder. Default: `host/pid` |
| `--poll SECONDS` | how often to ask for work when the queue is empty. Default: 15 |
| `--once` | take one file (or none) and exit — for a cron-driven worker |

Run more than one and they will not collide: a claim is a compare-and-set, so
two workers racing for the same row produce one winner and one "try the next".

## The protocol

Four endpoints under `/api/v1/vector`, all bearer-authenticated with
`VECTOR_WORKER_SECRET`. This is a machine, so there is no session and no cookie.

| | |
|---|---|
| `GET /health` | are we talking to the right box, and what is the retention |
| `POST /claim` | `{worker}` → one file + presigned URLs, or **204** when idle |
| `POST /complete` | `{fileId, formats:{svg,eps}}` — the bytes are in the bucket |
| `POST /fail` | `{fileId, reason, retryable}` |

A claim carries a presigned GET for the original and a presigned PUT for each
output format. **The bytes never pass through the Stockflow process** — the
worker talks to R2 directly, the same way the browser does when it uploads. See
`src/lib/server/r2.ts`.

## What happens when things go wrong

- **The worker dies mid-file.** A claim is a lease, not a handover. After 45
  minutes the file goes back on the queue — nightly, and again whenever any
  worker asks for work, so an evening's queue does not sit still until 3am.
- **A file keeps failing.** Two attempts, then it is marked failed and its
  token is refunded. `retryable: false` skips straight to that.
- **The same failure is reported twice.** The refund is idempotent — a unique
  index on `(file_id, reason)` in `token_ledger`, so the second report hits a
  constraint instead of the balance.
- **The credit is spent but the upload fails.** Reported as retryable. Re-running
  costs another vectorizer.ai credit, which is the cheaper mistake: a token
  quietly kept for a file nobody can download is the one people notice.

## If the very first file fails

The presigning is verified; the R2 round trip has never been run against a real
bucket. Do the first one deliberately:

```bash
node vector-worker.mjs --repo D:/microstock/vector/vectorizer --once
```

One file, one credit, and it exits. If the **upload** fails with a length or
encoding error rather than a 403, the streamed PUT is the suspect — swap
`Readable.toWeb(createReadStream(source))` in `upload()` for
`await fs.readFile(source)` and drop `duplex: 'half'`. That reads the whole
file into memory, which is why it is not the default, but a 40 MB EPS is a
price worth paying once to find out.

A **403** on the upload instead means the presigned URL expired — it is good
for two hours from the claim, so that would mean the file took longer than that
in `vectorize.js`.

## Retention

Three objects survive per finished image — the **original**, the **SVG** and
the **EPS** — and the batch screen saves all three into a folder you pick.

How long they live is an **R2 object lifecycle rule** on the `vector/` prefix
and nothing else: this application has no retention code, deletes nothing on a
schedule, and refuses nothing for being old. See `deploy/README.md`.

The one thing the worker does delete is the original of a file that failed for
good — nobody will ever download it, and it would otherwise sit there until the
lifecycle rule noticed.
