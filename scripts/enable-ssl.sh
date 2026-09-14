#!/bin/bash
set -euo pipefail
certbot --nginx -d one10events.in -d www.one10events.in --non-interactive --agree-tos --register-unsafely-without-email --redirect
systemctl reload nginx
echo "SSL ready: https://one10events.in"
