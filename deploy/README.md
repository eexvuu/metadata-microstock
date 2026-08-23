# Putting Stockflow on a box

The target is Ubuntu 24.04 with nginx already in front of a dozen other sites.
Nothing here assumes the box is ours alone: the service binds to loopback, runs
as its own user, and is capped at 768 MB.

## Once, as root

```bash
# Node 22. The box had none at the time of writing.
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

adduser --system --group --home /srv/stockflow stockflow
mkdir -p /srv/stockflow/{releases,data} /etc/stockflow
chown -R stockflow:stockflow /srv/stockflow

# Fill this in from .env.example, then lock it down.
install -m 0600 /dev/null /etc/stockflow/stockflow.env

cp deploy/stockflow.service deploy/stockflow-cron.service deploy/stockflow-cron.timer /etc/systemd/system/
systemctl daemon-reload

cp deploy/nginx.conf /etc/nginx/sites-available/stockflow.conf
ln -s /etc/nginx/sites-available/stockflow.conf /etc/nginx/sites-enabled/
certbot --nginx -d stockflow.example.com
nginx -t && systemctl reload nginx
```

## Every deploy

Push to `vps`. `.github/workflows/deploy.yml` typechecks, builds, and then runs
the same script below — CI does not reimplement the deploy, so a green pipeline
and a hand deploy cannot drift apart.

By hand, when you want to watch it:

```bash
./deploy/deploy.sh root@43.157.210.19
```

Builds locally, ships `dist/` and `drizzle/` over tar, installs the one runtime
dependency, copies the database aside, migrates, hands the data directory back
to the `stockflow` user, flips the `current` symlink, restarts, and checks
`/api/health`. Five releases are kept.

The release carries a `package.json` of its own listing only
`@libsql/client` — the app's would make npm reconcile the whole tree on a box
with no build toolchain, which is exactly how the first deploy failed.

## Rolling back

The pre-migrate copy of the database is the undo for a bad migration, and the
previous release directory is the undo for bad code:

```bash
ls -1dt /srv/stockflow/releases/*        # newest first
ln -sfn /srv/stockflow/releases/<older> /srv/stockflow/current
systemctl restart stockflow
```

Migrations are forward-only. If one is the problem, stop the service, put back
`/srv/stockflow/data/stockflow.db.<timestamp>.bak`, then switch the symlink.

## Accounts that existed before Google sign-in

Google auto-linking refuses an account whose `email_verified` is false, and
this app ran with `requireEmailVerification: false` — so every account made
before the cutover has it false and its owner will hit
`?error=account_not_linked` on their first Google sign-in. Measured, not
guessed: flip the flag and the same sign-in lands on the original row with its
keys, runs and role intact.

So, once, for accounts you recognise:

```bash
sqlite3 /srv/stockflow/data/stockflow.db   "UPDATE user SET email_verified = 1 WHERE email IN ('you@example.com')"
```

List the addresses. A bare `UPDATE user SET email_verified = 1` marks every
account on the box as verified, which is the one thing that gate exists to
prevent — and it is your judgement about those specific people that makes the
flip defensible, not the statement itself.

## The first admin

There is no UI for it, on purpose:

```bash
sqlite3 /srv/stockflow/data/stockflow.db \
  "UPDATE user SET role='admin' WHERE email='you@example.com'"
```

Scope it with a WHERE. Without one, every account on the box becomes an admin.

## When something is wrong

```bash
systemctl status stockflow
journalctl -u stockflow -n 100 --no-pager
systemctl list-timers stockflow-cron.timer
```

`ENCRYPTION_SECRET` missing or changed is the failure that looks like several
others: every Gemini key operation throws, and the keys dialog shows nothing
useful. It cannot be rotated — a new value orphans every stored key.
