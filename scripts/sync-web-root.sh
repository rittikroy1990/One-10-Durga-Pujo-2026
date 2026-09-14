#!/bin/bash
# Rebuild the public frontend from GitHub main and publish it to nginx.
# Run on the Hostinger VPS as root from anywhere:
#   bash /root/one10events-app/scripts/sync-web-root.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/root/one10events-app}"
WEB_ROOT="${WEB_ROOT:-/var/www/one10events/build}"

cd "$APP_ROOT"

echo "==> Fetching latest main"
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "==> Building frontend (eslint plugin disabled for production compile)"
cd frontend
if [[ -f package-lock.json ]]; then
  npm ci --prefer-offline
else
  npm install
fi
DISABLE_ESLINT_PLUGIN=true CI=false npm run build

echo "==> Publishing build to $WEB_ROOT"
mkdir -p "$WEB_ROOT"
rsync -a --delete "$APP_ROOT/frontend/build/" "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"

JS=$(ls "$WEB_ROOT/static/js"/main.*.js | head -1)
if grep -q 'food-menu-info' "$JS"; then
  echo "==> OK: food menu info button is present in $(basename "$JS")"
else
  echo "==> ERROR: food-menu-info missing from published JS — aborting check" >&2
  exit 1
fi

echo "synced web root from $(git -C "$APP_ROOT" rev-parse --short HEAD)"
