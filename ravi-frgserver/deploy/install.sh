#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
cd -- "$(dirname -- "$0")/.."
for target in /opt/ravi /etc/ravi.env /etc/systemd/system/ravi.service /etc/nginx/sites-available/ravi /etc/nginx/sites-enabled/ravi; do
  [[ ! -e "$target" && ! -L "$target" ]] || { echo "Existing installation found at $target; stopping without overwriting."; exit 1; }
done
apt-get update
apt-get install -y nodejs nginx certbot python3-certbot-nginx build-essential python3
[[ -x /usr/bin/node ]] || { echo '/usr/bin/node is required by the systemd unit.'; exit 1; }
/usr/bin/node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo 'Node.js 22 or later is required at /usr/bin/node.'; exit 1; }
command -v npm >/dev/null || { echo 'npm is required; install the npm matching Node.js 22 or later.'; exit 1; }
id ravi-web >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin ravi-web
install -d -m 755 /opt/ravi
cp -R public worker.js llm.js http-body.mjs server.mjs central-http.mjs central-store.mjs central-crypto.mjs central-config.mjs staff-cli.mjs backup-cli.mjs package.json package-lock.json /opt/ravi/
# The pinned SQLite package includes prebuilt N-API binaries for common
# Linux x64/arm64; avoid unnecessary build scripts and header downloads.
(cd /opt/ravi && PATH=/usr/bin:/usr/local/bin:/bin npm ci --omit=dev --ignore-scripts --no-audit)
(cd /opt/ravi && /usr/bin/node -e "const D=require('better-sqlite3');const d=new D(':memory:');d.prepare('select 1').get();d.close()")
chown -R root:root /opt/ravi
chmod -R u=rwX,go=rX /opt/ravi
install -m 600 /dev/null /etc/ravi.env
cat > /etc/ravi.env <<'EOF'
APP_ORIGIN=https://frgserver.ir
PORT=4173
OPENAI_MODEL=gpt-6-astra
OPENAI_REASONING_EFFORT=low
OPENAI_TRANSCRIBE_MODEL=gpt-transcribe
OPENAI_API_KEY=
# Central intake is intentionally disabled until DNS, TLS, credentials,
# backups, operator accounts and the release checklist are complete.
CENTRAL_ENABLED=0
ADMIN_ORIGIN=https://admin.frgserver.ir
CENTRAL_DATA_DIR=/var/lib/ravi
# CENTRAL_DATA_KEY_FILE=/etc/ravi/data.key
# BALE_BOT_TOKEN_FILE=/etc/ravi/bale.token
EOF
install -m 644 deploy/ravi.service /etc/systemd/system/ravi.service
install -m 644 deploy/nginx.conf /etc/nginx/sites-available/ravi
ln -s /etc/nginx/sites-available/ravi /etc/nginx/sites-enabled/ravi
nginx -t
systemctl daemon-reload
systemctl enable --now ravi.service
systemctl reload nginx
echo 'Installed with central intake DISABLED. Follow deploy/README.fa.md before accepting reports.'
echo 'After DNS points to this server, obtain HTTPS for both the public and staff host:'
echo '  certbot --nginx -d frgserver.ir -d admin.frgserver.ir --redirect'
echo 'An external API key is optional; real model services must be configured and tested separately.'
echo 'Firewall rules were not changed. Do not use real reports until the release checklist passes.'
