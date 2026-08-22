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

```bash
./deploy/deploy.sh root@43.157.210.19
```

Builds locally, rsyncs `dist/`, copies the database aside, migrates, flips the
`current` symlink, restarts, and checks `/api/health`. Five releases are kept.

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
