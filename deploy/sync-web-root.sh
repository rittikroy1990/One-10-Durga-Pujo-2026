#!/usr/bin/env bash
# Sync CRA build to the nginx web root (www-data readable).
set -euo pipefail
SRC="${1:-/root/one10events-app/frontend/build/}"
DEST="${2:-/var/www/one10events/build/}"
mkdir -p "$DEST"
rsync -a --delete "$SRC" "$DEST"
chown -R www-data:www-data /var/www/one10events
echo "Synced $SRC -> $DEST"
