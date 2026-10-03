#!/bin/bash
set -e
rsync -a --delete /root/one10events-app/frontend/build/ /var/www/one10events/build/
chown -R www-data:www-data /var/www/one10events/build
# Uvicorn registers SPA routes only if frontend/build/index.html exists at process start.
systemctl restart one10events.service
echo "synced web root + restarted API"
