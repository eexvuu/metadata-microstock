# The vectorize worker

Stockflow does not vectorize anything. It holds the queue, the tokens, the
bucket **and the vectorizer.ai logins**; a worker on a machine that already has
the [`vectorizer`][repo] repo working pulls the files down, runs them through
`vectorize.js` unchanged, and puts the results back.

The accounts moved here on purpose. The limiter on vectorizer.ai is per
ACCOUNT — that repo measured it; rotating the exit IP changed nothing — so more
logins is the only thing that raises throughput, and two workers on ONE login
is its documented cause of "suddenly rate-limited all the time". A claim
therefore carries an account no other in-flight file holds. Adding a login is a
form in the admin panel, not an ssh session, and **`accounts.json` on the worker
machine is no longer read at all.**

That split is not a preference: the app process must never become a browser
host. `stockflow.service` caps it at 768 MB on a box with two shared cores,
MySQL, a gunicorn app and a dozen other vhosts, and a real Chromium signed in
to vectorizer.ai does not belong inside it.

The split is between PROCESSES, though, not between machines — which is why the
VPS can run a worker of its own after all (`deploy/stockflow-worker.service`,
runbook in `deploy/README.md`). This script holds no browser: it spawns
`vectorize.js` per file, so Chromium lives and dies with the file and an idle
worker is one small Node poller. One file at a time is what fits there.
Anything wider belongs on a machine with RAM to spare, and the two run side by
side without coordinating — a claim is a compare-and-set.

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

Then add the logins under **Dashboard -> Vector accounts**. Until there is at
least one active account every claim answers 204, which from the worker's side
is indistinguishable from an empty queue — so the worker prints the count at
startup and says so.

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

**Run one worker per account.** Each holds one file and one login at a time, so
eight accounts and eight workers is eight images at once; an extra worker past
that just polls. They will not collide — a claim is a compare-and-set, so two
workers racing for the same row produce one winner and one "try the next", and
the account pick is serialized on the server for the same reason.

Each run gets a throwaway `--accounts-file` in the temp directory (0600, deleted
in a `finally`) rather than a password in argv, and `--no-digitalisazy` so the
shared reseller account cannot be used by two workers at once behind the
queue's back.

## The protocol

Four endpoints under `/api/v1/vector`, all bearer-authenticated with
`VECTOR_WORKER_SECRET`. This is a machine, so there is no session and no cookie.

| | |
|---|---|
| `GET /health` | are we talking to the right box, and what is the retention |
| `POST /claim` | `{worker}` → one file + presigned URLs, or **204** when idle |
| `POST /complete` | `{fileId, formats:{svg,eps}}` — the bytes are in the bucket |
| `POST /fail` | `{fileId, reason, retryable}` |

A claim carries a presigned GET for the original, a presigned PUT for each
output format, and an `account` — `{label, email, password}`, decrypted for this
one claim. **The bytes never pass through the Stockflow process** — the worker
talks to R2 directly, the same way the browser does when it uploads. See
`src/lib/server/r2.ts`.

The password is the one thing in the protocol that is a credential, and the
bearer secret is what guards it: it is AES-256-GCM at rest
(`src/lib/server/crypto.ts`), decrypted only by the claim, never logged and
never returned to a browser.

## What happens when things go wrong

- **The worker dies mid-file.** A claim is a lease, not a handover. After 45
  minutes the file goes back on the queue — nightly, and again whenever any
  worker asks for work, so an evening's queue does not sit still until 3am.
  The account frees itself with it: "busy" means a `running` file names it, so
  there is no second flag to fall out of step with the lease.
- **Every account is busy.** 204, the same as an empty queue. That is the
  throttle working — a ninth worker on eight accounts has nothing to spend.
- **No accounts configured.** Also 204, forever. `/health` reports
  `accounts: {active, busy}` and the worker prints it at startup precisely so
  this is one line of output rather than an afternoon.
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
the **EPS** — and the batch screen downloads all three as one zip.

How long they live is an **R2 object lifecycle rule** on the `vector/` prefix
and nothing else: this application has no retention code, deletes nothing on a
schedule, and refuses nothing for being old. See `deploy/README.md`.

The one thing the worker does delete is the original of a file that failed for
good — nobody will ever download it, and it would otherwise sit there until the
lifecycle rule noticed.
