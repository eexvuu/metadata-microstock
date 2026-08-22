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

echo "==> shipping to $TARGET:$RELEASE"
ssh "$TARGET" "mkdir -p '$RELEASE' '$REMOTE_DIR/data'"
rsync -az --delete dist/ "$TARGET:$RELEASE/dist/"
rsync -az drizzle/ "$TARGET:$RELEASE/drizzle/"
rsync -az package.json "$TARGET:$RELEASE/package.json"

echo "==> installing runtime dependencies"
ssh "$TARGET" "cd '$RELEASE' && npm install --omit=dev --no-audit --no-fund"

echo "==> backing up the database before migrating"
ssh "$TARGET" "test ! -f '$REMOTE_DIR/data/stockflow.db' || cp '$REMOTE_DIR/data/stockflow.db' '$REMOTE_DIR/data/stockflow.db.$(date -u +%Y%m%d%H%M%S).bak'"

# Migrations are forward-only and there is no rollback command. The copy above
# is the rollback.
echo "==> migrating"
ssh "$TARGET" "cd '$RELEASE' && set -a && . /etc/stockflow/stockflow.env && set +a && npx drizzle-kit migrate"

echo "==> switching over"
ssh "$TARGET" "ln -sfn '$RELEASE' '$REMOTE_DIR/current' && systemctl restart stockflow"

echo "==> health"
ssh "$TARGET" "sleep 2 && curl -fsS http://127.0.0.1:3000/api/health && echo"

echo "==> keeping the last five releases"
ssh "$TARGET" "ls -1dt '$REMOTE_DIR'/releases/* | tail -n +6 | xargs -r rm -rf"
