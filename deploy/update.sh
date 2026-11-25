#!/usr/bin/env bash
# Deploy a new version of the website code. Content (/var/lib/stmary-site) is not touched.
#
# Run as root from the folder that holds the new version of the app:
#   sudo bash deploy/update.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/stmary-site
PREV_DIR=/opt/stmary-site.previous

echo "==> Preparing the new version"
rm -rf "$APP_DIR.new"
mkdir "$APP_DIR.new"
(cd "$SRC_DIR" && tar --exclude=node_modules --exclude=content --exclude=.git -cf - .) | tar -xf - -C "$APP_DIR.new"
(cd "$APP_DIR.new" && npm ci --omit=dev)

echo "==> Switching over (a few seconds of downtime)"
systemctl stop stmary-site
rm -rf "$PREV_DIR"
[ -d "$APP_DIR" ] && mv "$APP_DIR" "$PREV_DIR"
mv "$APP_DIR.new" "$APP_DIR"
chmod -R a+rX "$APP_DIR"
systemctl start stmary-site

sleep 2
curl -fsS http://127.0.0.1:3000/healthz >/dev/null && echo "==> Updated. The previous version is in $PREV_DIR"
