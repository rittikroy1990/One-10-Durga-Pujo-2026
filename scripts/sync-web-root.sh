#!/bin/bash
set -e
rsync -a --delete /root/one10events-app/frontend/build/ /var/www/one10events/build/
chown -R www-data:www-data /var/www/one10events/build
echo "synced web root"
