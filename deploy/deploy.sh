#!/usr/bin/env bash
# Build here, ship the result, migrate, restart. Run from a checkout of `vps`.
#
#   ./deploy/deploy.sh root@43.157.210.19
#
# Deliberately not a git pull on the server: the box has no Bun and no build
# toolchain, and adding one to a machine already running a dozen sites is a
# worse trade than rsyncing a directory.
set -euo pipefail

TARGET="${1:?usage: deploy.sh user@host}"
REMOTE_DIR=/srv/stockflow
RELEASE="$REMOTE_DIR/releases/$(date -u +%Y%m%d%H%M%S)"

echo "==> building"
bun run typecheck
bun run build

# The release gets a package.json of its own, listing the one package the
# build does not bundle. Shipping the app's would make npm reconcile the whole
# tree on the server -- which it tried, and died compiling esbuild for a
# drizzle-kit dependency the server has no use for. The artifact is dist/,
# drizzle/, and five lines.
node -e "
  const p = require('./package.json')
  require('fs').writeFileSync('.release-package.json', JSON.stringify({
    name: 'stockflow-release', private: true, type: 'module',
    dependencies: { '@libsql/client': p.dependencies['@libsql/client'] },
  }, null, 2))
"

# tar over ssh rather than rsync: this runs from a Windows laptop as often as
# from CI, and Git Bash ships no rsync. Each release is a fresh directory, so
# there is nothing for rsync's --delete to do that an empty one does not.
echo "==> shipping to $TARGET:$RELEASE"
ssh "$TARGET" "mkdir -p '$RELEASE' '$REMOTE_DIR/data'"
tar czf - dist drizzle | ssh "$TARGET" "tar xzf - -C '$RELEASE'"
scp -q .release-package.json "$TARGET:$RELEASE/package.json"
rm -f .release-package.json

# The build bundles everything except libsql, which ships a native binary per
# platform and so cannot come from a Windows laptop.
echo "==> installing the one runtime dependency"
ssh "$TARGET" "cd '$RELEASE' && npm install --no-audit --no-fund --loglevel=error"

echo "==> backing up the database before migrating"
ssh "$TARGET" "test ! -f '$REMOTE_DIR/data/stockflow.db' || cp '$REMOTE_DIR/data/stockflow.db' '$REMOTE_DIR/data/stockflow.db.$(date -u +%Y%m%d%H%M%S).bak'"

# Migrations are forward-only and there is no rollback command. The copy above
# is the rollback.
echo "==> migrating"
ssh "$TARGET" "cd '$RELEASE' && set -a && . /etc/stockflow/stockflow.env && set +a && node dist/server/server.js --migrate"

# The migration runs as root over ssh, so the database file it creates is
# root's — and the service runs as `stockflow`, which then cannot write to it.
# It fails as SQLITE_READONLY at the first sign-in, not at the health check,
# which is a miserable way to find out.
echo "==> handing the database back to the service user"
ssh "$TARGET" "chown -R stockflow:stockflow '$REMOTE_DIR/data'"

echo "==> switching over"
ssh "$TARGET" "ln -sfn '$RELEASE' '$REMOTE_DIR/current' && systemctl restart stockflow"

echo "==> health"
ssh "$TARGET" "sleep 2 && curl -fsS http://127.0.0.1:3000/api/health && echo"

echo "==> keeping the last five releases"
ssh "$TARGET" "ls -1dt '$REMOTE_DIR'/releases/* | tail -n +6 | xargs -r rm -rf"
