#!/usr/bin/env bash
# First-time setup on a fresh Ubuntu 24.04 DigitalOcean droplet.
#
# Before running, point your domain's DNS A record at the droplet's IP address
# (Caddy needs it to get the HTTPS certificate).
#
# Run as root, from the folder that holds this script and the app:
#   DOMAIN=stmarymilford.org ADMIN_EMAIL=you@example.org bash deploy/provision.sh
#
# Re-running it is safe: existing content and the admin password are kept.
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN, e.g. DOMAIN=stmarymilford.org}"
ADMIN_EMAIL="${ADMIN_EMAIL:?Set ADMIN_EMAIL (used for HTTPS certificate notices)}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

APP_DIR=/opt/stmary-site
DATA_DIR=/var/lib/stmary-site
ENV_FILE=/etc/stmary-site.env
BACKUP_DIR=/var/backups/stmary-site

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (sudo bash deploy/provision.sh)" >&2
  exit 1
fi

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg ufw apt-transport-https openssl

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "==> Installing Caddy (automatic HTTPS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> Creating service user and folders"
id -u stmary >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin stmary
mkdir -p "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"

echo "==> Copying the website code to $APP_DIR"
rsync -a --delete --exclude node_modules --exclude content --exclude .git "$SRC_DIR"/ "$APP_DIR"/ 2>/dev/null || {
  apt-get install -y rsync >/dev/null
  rsync -a --delete --exclude node_modules --exclude content --exclude .git "$SRC_DIR"/ "$APP_DIR"/
}
cd "$APP_DIR"
npm ci --omit=dev

echo "==> Settings file"
if [ ! -f "$ENV_FILE" ]; then
  ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  cat > "$ENV_FILE" <<EOF
PORT=3000
HOST=127.0.0.1
CONTENT_DIR=$DATA_DIR/content
ADMIN_USER=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
  chmod 600 "$ENV_FILE"
  NEW_PASSWORD="$ADMIN_PASSWORD"
  echo "    Created $ENV_FILE"
else
  echo "    Keeping existing $ENV_FILE"
fi

chown -R stmary:stmary "$DATA_DIR"
chmod -R a+rX "$APP_DIR"

echo "==> Service"
cat > /etc/systemd/system/stmary-site.service <<EOF
[Unit]
Description=St. Mary of the Assumption website
After=network.target

[Service]
Type=simple
User=stmary
Group=stmary
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable stmary-site
systemctl restart stmary-site

echo "==> Web server (Caddy) for $DOMAIN"
cat > /etc/caddy/Caddyfile <<EOF
{
	email $ADMIN_EMAIL
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}

$DOMAIN {
	encode zstd gzip
	request_body {
		max_size 20MB
	}
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo "==> Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> Nightly content backup (kept 30 days)"
cat > /etc/cron.d/stmary-backup <<EOF
15 3 * * * root tar -czf $BACKUP_DIR/content-\$(date +\%F).tar.gz -C $DATA_DIR content && find $BACKUP_DIR -name 'content-*.tar.gz' -mtime +30 -delete
EOF

sleep 2
curl -fsS http://127.0.0.1:3000/healthz >/dev/null && echo "==> The site is running on port 3000"

echo
echo "Done. Visit https://$DOMAIN once DNS has propagated."
echo "Content editor: https://$DOMAIN/admin/   (user: admin)"
if [ -n "${NEW_PASSWORD:-}" ]; then
  echo "Admin password: $NEW_PASSWORD"
  echo "Save it in your password manager now. It is also stored in $ENV_FILE (readable only by root)."
else
  echo "Admin password: unchanged (see $ENV_FILE)"
fi
